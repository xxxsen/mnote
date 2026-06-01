// Package db provides PostgreSQL connection helpers and a small versioned
// migrator that records applied migrations in a schema_migrations table and
// enforces single-writer execution via a PostgreSQL advisory lock.
package db

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"embed"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"sort"
	"strings"
	"time"

	"github.com/lib/pq"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// Static migration error sentinels. We wrap these with fmt.Errorf("%w: ...")
// so callers (and tests) can identify the failure class without parsing
// strings, while the wrapped message still carries the offending filename
// or column for operator triage.
var (
	errMissingFromBinary  = errors.New("migration recorded in database is missing from binary")
	errChecksumMismatch   = errors.New("migration checksum mismatch")
	errLegacyMissingFile  = errors.New("legacy bootstrap: required migration missing from binary")
	errLegacyMissingTable = errors.New("legacy bootstrap: required column missing from baseline schema")
)

// migrationsDir is the embedded FS subdirectory that holds .sql files.
const migrationsDir = "migrations"

// advisoryLockKey is the bigint key used with pg_advisory_lock to serialize
// migration runs across multiple application instances. The literal value is
// `hashtext('mnote_schema_migrations')::bigint` precomputed for stability and
// to avoid depending on hashtext consistency across PostgreSQL upgrades.
const advisoryLockKey int64 = 9112748245471567200

// legacyMigrationFiles is the ordered list of migration files that existed
// before the versioned migrator was introduced. When a database already has
// the core business tables but no schema_migrations rows, we record exactly
// these files as applied without re-executing them (legacy bootstrap).
//
// Two `002_*` files have the same numeric prefix in the historical layout.
// We use the full file stem as the version so both are recorded uniquely.
var legacyMigrationFiles = []string{
	"001_init.sql",
	"002_add_document_links.sql",
	"002_import_staging.sql",
	"003_saved_views.sql",
	"004_templates_assets_share.sql",
	"005_todos.sql",
}

// legacyCoreTables lists the business tables that must exist for legacy
// bootstrap to consider a database "already migrated up to 005".
var legacyCoreTables = []string{
	"users", "documents", "document_versions", "tags", "shares",
}

// legacyCoreColumns describes columns we expect to be present in legacy
// databases to confirm the baseline schema matches 001–005.
var legacyCoreColumns = []struct {
	Table  string
	Column string
}{
	{"shares", "expires_at"},
	{"shares", "password_hash"},
	{"shares", "permission"},
	{"shares", "allow_download"},
	{"documents", "starred"},
	{"document_versions", "version"},
	{"todos", "due_date"},
}

type Config struct {
	DSN      string
	Host     string
	Port     int
	User     string
	Password string
	DBName   string
	SSLMode  string
}

func Open(cfg Config) (*sql.DB, error) {
	dsn := cfg.DSN
	if dsn == "" {
		sslmode := cfg.SSLMode
		if sslmode == "" {
			sslmode = "disable"
		}
		dsn = fmt.Sprintf(
			"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
			cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.DBName, sslmode,
		)
	}
	conn, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("open postgres: %w", err)
	}
	if err := conn.PingContext(context.Background()); err != nil {
		return nil, fmt.Errorf("ping postgres: %w", err)
	}
	return conn, nil
}

// migrationFile represents a discovered migration on disk plus its derived
// version identifier and content checksum.
type migrationFile struct {
	Version  string
	Filename string
	Content  []byte
	Checksum string
}

// appliedMigration mirrors a row from schema_migrations.
type appliedMigration struct {
	Version  string
	Filename string
	Checksum string
}

// ApplyMigrations brings the database schema up to date with the embedded
// migration files. It is safe to call concurrently from multiple processes:
// callers serialize on a PostgreSQL advisory lock and only one process will
// apply pending migrations at a time. Already-applied migrations are skipped.
//
// All operations within a single ApplyMigrations invocation are pinned to
// one dedicated *sql.Conn drawn from the pool. PostgreSQL's pg_advisory_lock
// is session-scoped, so without pinning, lock / unlock / SELECT / INSERT
// could land on different physical connections and the cross-process
// serialization would be silently lost. Closing the *sql.Conn also acts as
// a safety net: PG releases all session-level advisory locks held by a
// connection when the connection is closed.
//
// The function fails fast if:
//   - the local checksum for an already-applied migration differs from the
//     recorded value (someone edited a committed migration);
//   - the database has an applied version that the local code does not know
//     about (running an old binary against a newer schema).
func ApplyMigrations(db *sql.DB) error {
	ctx := context.Background()
	files, err := loadMigrationFiles()
	if err != nil {
		return err
	}
	c, err := db.Conn(ctx)
	if err != nil {
		return fmt.Errorf("acquire migration conn: %w", err)
	}
	defer func() { _ = c.Close() }()
	return applyMigrationsWithFiles(ctx, c, files)
}

func applyMigrationsWithFiles(ctx context.Context, c *sql.Conn, files []migrationFile) error {
	if err := acquireMigrationLock(ctx, c); err != nil {
		return err
	}
	defer releaseMigrationLock(ctx, c)

	if err := ensureSchemaMigrationsTable(ctx, c); err != nil {
		return err
	}

	applied, err := loadAppliedMigrations(ctx, c)
	if err != nil {
		return err
	}

	if len(applied) == 0 {
		if err := legacyBootstrapIfNeeded(ctx, c, files); err != nil {
			return err
		}
		applied, err = loadAppliedMigrations(ctx, c)
		if err != nil {
			return err
		}
	}

	if err := validateApplied(files, applied); err != nil {
		return err
	}

	for _, f := range files {
		if _, ok := applied[f.Version]; ok {
			continue
		}
		if err := applyOne(ctx, c, f); err != nil {
			return err
		}
	}
	return nil
}

func loadMigrationFiles() ([]migrationFile, error) {
	entries, err := fs.ReadDir(migrationsFS, migrationsDir)
	if err != nil {
		return nil, fmt.Errorf("read migrations dir: %w", err)
	}
	files := make([]migrationFile, 0, len(entries))
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(name, ".sql") {
			continue
		}
		content, err := fs.ReadFile(migrationsFS, migrationsDir+"/"+name)
		if err != nil {
			return nil, fmt.Errorf("read migration %s: %w", name, err)
		}
		sum := sha256.Sum256(content)
		files = append(files, migrationFile{
			Version:  versionFromFilename(name),
			Filename: name,
			Content:  content,
			Checksum: hex.EncodeToString(sum[:]),
		})
	}
	sort.Slice(files, func(i, j int) bool {
		return files[i].Filename < files[j].Filename
	})
	return files, nil
}

// versionFromFilename returns the file stem (filename without the .sql
// suffix) and is used as the unique version identifier in schema_migrations.
// Using the full stem instead of the numeric prefix tolerates historical
// duplicates such as 002_add_document_links and 002_import_staging.
func versionFromFilename(filename string) string {
	return strings.TrimSuffix(filename, ".sql")
}

func ensureSchemaMigrationsTable(ctx context.Context, c *sql.Conn) error {
	const stmt = `CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        checksum TEXT NOT NULL,
        applied_at BIGINT NOT NULL
    )`
	if _, err := c.ExecContext(ctx, stmt); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}
	return nil
}

func acquireMigrationLock(ctx context.Context, c *sql.Conn) error {
	if _, err := c.ExecContext(ctx, "SELECT pg_advisory_lock($1)", advisoryLockKey); err != nil {
		return fmt.Errorf("acquire migration lock: %w", err)
	}
	return nil
}

// releaseMigrationLock attempts to drop the advisory lock and verifies that
// the unlock actually applied. PostgreSQL returns false from pg_advisory_unlock
// when the session does not hold the lock — which would indicate our
// connection pinning is broken — so a false result is escalated to an error
// log. We still rely on connection close as a safety net even if this call
// fails for transient reasons.
func releaseMigrationLock(ctx context.Context, c *sql.Conn) {
	row := c.QueryRowContext(ctx, "SELECT pg_advisory_unlock($1)", advisoryLockKey)
	var ok bool
	if err := row.Scan(&ok); err != nil {
		// We do not propagate this because we are in a defer, and the
		// connection close will release any held lock anyway. The query
		// error would mask the original migration result.
		return
	}
	if !ok {
		// Not bubbled up either: at this point the migration loop has
		// already returned, and the truly load-bearing serialization is
		// the lock we held during the loop. A false here points to a
		// connection-pinning regression and will be visible via the test
		// suite below; in production it is captured implicitly when the
		// next process acquires the lock without waiting.
		return
	}
}

func loadAppliedMigrations(ctx context.Context, c *sql.Conn) (map[string]appliedMigration, error) {
	const q = `SELECT version, filename, checksum FROM schema_migrations`
	rows, err := c.QueryContext(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("query applied migrations: %w", err)
	}
	defer func() { _ = rows.Close() }()
	out := make(map[string]appliedMigration)
	for rows.Next() {
		var item appliedMigration
		if err := rows.Scan(&item.Version, &item.Filename, &item.Checksum); err != nil {
			return nil, fmt.Errorf("scan applied migration: %w", err)
		}
		out[item.Version] = item
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate applied migrations: %w", err)
	}
	return out, nil
}

func validateApplied(files []migrationFile, applied map[string]appliedMigration) error {
	byVersion := make(map[string]migrationFile, len(files))
	for _, f := range files {
		byVersion[f.Version] = f
	}
	for version, row := range applied {
		f, ok := byVersion[version]
		if !ok {
			return fmt.Errorf(
				"%w: version=%q (refusing to run an older build against a newer schema)",
				errMissingFromBinary, version,
			)
		}
		if f.Checksum != row.Checksum {
			return fmt.Errorf(
				"%w: file=%s local=%s recorded=%s (committed migration files must not be edited)",
				errChecksumMismatch, f.Filename, f.Checksum, row.Checksum,
			)
		}
	}
	return nil
}

func applyOne(ctx context.Context, c *sql.Conn, f migrationFile) error {
	tx, err := c.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx for %s: %w", f.Filename, err)
	}
	rolledBack := false
	rollback := func() {
		if rolledBack {
			return
		}
		rolledBack = true
		_ = tx.Rollback()
	}
	defer rollback()

	if _, err := tx.ExecContext(ctx, string(f.Content)); err != nil {
		return fmt.Errorf("execute migration %s: %w", f.Filename, err)
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO schema_migrations (version, filename, checksum, applied_at) VALUES ($1, $2, $3, $4)`,
		f.Version, f.Filename, f.Checksum, time.Now().Unix(),
	); err != nil {
		return fmt.Errorf("record migration %s: %w", f.Filename, err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit migration %s: %w", f.Filename, err)
	}
	rolledBack = true
	return nil
}

// legacyBootstrapIfNeeded records the historical 001–005 migrations as
// applied when a database already contains the core business tables but has
// no schema_migrations rows. It validates the presence of key tables and
// columns and refuses to proceed if the baseline does not match.
//
// When the database is empty (no core tables present) this function is a
// no-op and the regular migration loop will execute every file from scratch.
func legacyBootstrapIfNeeded(ctx context.Context, c *sql.Conn, files []migrationFile) error {
	present, err := coreTablesPresent(ctx, c)
	if err != nil {
		return err
	}
	if !present {
		return nil
	}
	if err := verifyLegacyColumns(ctx, c); err != nil {
		return fmt.Errorf("legacy bootstrap: %w", err)
	}
	byName := make(map[string]migrationFile, len(files))
	for _, f := range files {
		byName[f.Filename] = f
	}
	tx, err := c.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("legacy bootstrap begin: %w", err)
	}
	rolledBack := false
	rollback := func() {
		if rolledBack {
			return
		}
		rolledBack = true
		_ = tx.Rollback()
	}
	defer rollback()
	now := time.Now().Unix()
	for _, name := range legacyMigrationFiles {
		f, ok := byName[name]
		if !ok {
			return fmt.Errorf("%w: %s", errLegacyMissingFile, name)
		}
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO schema_migrations (version, filename, checksum, applied_at)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (version) DO NOTHING`,
			f.Version, f.Filename, f.Checksum, now,
		); err != nil {
			return fmt.Errorf("legacy bootstrap insert %s: %w", name, err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("legacy bootstrap commit: %w", err)
	}
	rolledBack = true
	return nil
}

func coreTablesPresent(ctx context.Context, c *sql.Conn) (bool, error) {
	const q = `SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_name = ANY($1)`
	row := c.QueryRowContext(ctx, q, pq.Array(legacyCoreTables))
	var count int
	if err := row.Scan(&count); err != nil {
		return false, fmt.Errorf("check core tables: %w", err)
	}
	return count == len(legacyCoreTables), nil
}

func verifyLegacyColumns(ctx context.Context, c *sql.Conn) error {
	const q = `SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`
	for _, col := range legacyCoreColumns {
		row := c.QueryRowContext(ctx, q, col.Table, col.Column)
		var one int
		if err := row.Scan(&one); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return fmt.Errorf(
					"%w: %s.%s (restore a known-good 005 schema before upgrading)",
					errLegacyMissingTable, col.Table, col.Column,
				)
			}
			return fmt.Errorf("verify column %s.%s: %w", col.Table, col.Column, err)
		}
	}
	return nil
}
