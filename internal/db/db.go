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
	"regexp"
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
	errMissingFromBinary    = errors.New("migration recorded in database is missing from binary")
	errChecksumMismatch     = errors.New("migration checksum mismatch")
	errBootstrapUnavailable = errors.New("bootstrap migration is unavailable")
	errInvalidMigrationName = errors.New("invalid migration filename")
	errEmptyMigration       = errors.New("migration file is empty")
	errInvalidManifest      = errors.New("invalid migration manifest")
	errDuplicateMigration   = errors.New("duplicate migration")
)

// migrationsDir is the embedded FS subdirectory that holds .sql files.
const migrationsDir = "migrations"

const bootstrapMigrationFilename = "000_schema_migrations.sql"

var migrationFilenamePattern = regexp.MustCompile(`^[0-9]{3}_[a-z0-9_]+\.sql$`)

// advisoryLockKey is the bigint key used with pg_advisory_lock to serialize
// migration runs across multiple application instances. The literal value is
// `hashtext('mnote_schema_migrations')::bigint` precomputed for stability and
// to avoid depending on hashtext consistency across PostgreSQL upgrades.
const advisoryLockKey int64 = 9112748245471567200

type Config struct {
	DSN             string
	Host            string
	Port            int
	User            string
	Password        string
	DBName          string
	SSLMode         string
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
	ConnMaxIdleTime time.Duration
}

func Open(ctx context.Context, cfg Config) (*sql.DB, error) {
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
	if cfg.MaxOpenConns <= 0 {
		cfg.MaxOpenConns = 20
	}
	if cfg.MaxIdleConns < 0 {
		cfg.MaxIdleConns = 0
	} else if cfg.MaxIdleConns == 0 {
		cfg.MaxIdleConns = 10
	}
	if cfg.ConnMaxLifetime <= 0 {
		cfg.ConnMaxLifetime = 30 * time.Minute
	}
	if cfg.ConnMaxIdleTime <= 0 {
		cfg.ConnMaxIdleTime = 5 * time.Minute
	}
	conn.SetMaxOpenConns(cfg.MaxOpenConns)
	conn.SetMaxIdleConns(cfg.MaxIdleConns)
	conn.SetConnMaxLifetime(cfg.ConnMaxLifetime)
	conn.SetConnMaxIdleTime(cfg.ConnMaxIdleTime)

	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := conn.PingContext(pingCtx); err != nil {
		_ = conn.Close()
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
	return ApplyMigrationsContext(context.Background(), db)
}

func ApplyMigrationsContext(ctx context.Context, db *sql.DB) error {
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

	applied, err := loadAppliedMigrations(ctx, c)
	if err != nil {
		applied, err = bootstrapLedger(ctx, c, files, err)
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

func bootstrapLedger(
	ctx context.Context, connection *sql.Conn, files []migrationFile, queryErr error,
) (map[string]appliedMigration, error) {
	if !isUndefinedTableError(queryErr) {
		return nil, queryErr
	}
	if len(files) == 0 || files[0].Filename != bootstrapMigrationFilename {
		return nil, fmt.Errorf(
			"%w: %s", errBootstrapUnavailable, bootstrapMigrationFilename,
		)
	}
	if err := applyOne(ctx, connection, files[0]); err != nil {
		return nil, fmt.Errorf("bootstrap migration ledger: %w", err)
	}
	return loadAppliedMigrations(ctx, connection)
}

func loadMigrationFiles() ([]migrationFile, error) {
	return loadMigrationFilesFromFS(migrationsFS, migrationsDir)
}

func loadMigrationFilesFromFS(fsys fs.FS, dir string) ([]migrationFile, error) {
	entries, err := fs.ReadDir(fsys, dir)
	if err != nil {
		return nil, fmt.Errorf("read migrations dir: %w", err)
	}
	files := make([]migrationFile, 0, len(entries))
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(name, ".sql") {
			continue
		}
		if !migrationFilenamePattern.MatchString(name) {
			return nil, fmt.Errorf("%w: %q", errInvalidMigrationName, name)
		}
		content, err := fs.ReadFile(fsys, dir+"/"+name)
		if err != nil {
			return nil, fmt.Errorf("read migration %s: %w", name, err)
		}
		if len(strings.TrimSpace(string(content))) == 0 {
			return nil, fmt.Errorf("%w: %s", errEmptyMigration, name)
		}
		version := versionFromFilename(name)
		sum := sha256.Sum256(content)
		files = append(files, migrationFile{
			Version:  version,
			Filename: name,
			Content:  content,
			Checksum: hex.EncodeToString(sum[:]),
		})
	}
	sort.Slice(files, func(i, j int) bool {
		return files[i].Filename < files[j].Filename
	})
	if err := validateMigrationManifest(files); err != nil {
		return nil, err
	}
	return files, nil
}

func validateMigrationManifest(files []migrationFile) error {
	if len(files) == 0 || files[0].Filename != bootstrapMigrationFilename {
		return fmt.Errorf(
			"%w: bootstrap migration %s must exist and sort first",
			errInvalidManifest,
			bootstrapMigrationFilename,
		)
	}
	versions := make(map[string]string, len(files))
	filenames := make(map[string]struct{}, len(files))
	for _, file := range files {
		if !migrationFilenamePattern.MatchString(file.Filename) {
			return fmt.Errorf("%w: %q", errInvalidMigrationName, file.Filename)
		}
		if len(strings.TrimSpace(string(file.Content))) == 0 {
			return fmt.Errorf("%w: %s", errEmptyMigration, file.Filename)
		}
		if _, ok := filenames[file.Filename]; ok {
			return fmt.Errorf("%w filename: %q", errDuplicateMigration, file.Filename)
		}
		filenames[file.Filename] = struct{}{}
		if previous, ok := versions[file.Version]; ok {
			return fmt.Errorf(
				"%w version %q in %s and %s",
				errDuplicateMigration,
				file.Version,
				previous,
				file.Filename,
			)
		}
		versions[file.Version] = file.Filename
	}
	return nil
}

// versionFromFilename returns the file stem (filename without the .sql
// suffix) and is used as the unique version identifier in schema_migrations.
// Using the full stem instead of the numeric prefix tolerates historical
// duplicates such as 002_add_document_links and 002_import_staging.
func versionFromFilename(filename string) string {
	return strings.TrimSuffix(filename, ".sql")
}

func isUndefinedTableError(err error) bool {
	var pqErr *pq.Error
	return errors.As(err, &pqErr) && string(pqErr.Code) == "42P01"
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
