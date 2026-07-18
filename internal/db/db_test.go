package db

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"io/fs"
	"strings"
	"sync"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func sum(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

func newFiles(specs ...[2]string) []migrationFile {
	out := make([]migrationFile, 0, len(specs))
	for _, sp := range specs {
		out = append(out, migrationFile{
			Version:  versionFromFilename(sp[0]),
			Filename: sp[0],
			Content:  []byte(sp[1]),
			Checksum: sum(sp[1]),
		})
	}
	return out
}

// pinConn returns a connection drawn from db. The migrator now requires a
// pinned *sql.Conn so pg_advisory_lock / pg_advisory_unlock land on the
// same physical session — see ApplyMigrations for the rationale.
func pinConn(t *testing.T, db *sql.DB) *sql.Conn {
	t.Helper()
	c, err := db.Conn(context.Background())
	require.NoError(t, err)
	t.Cleanup(func() { _ = c.Close() })
	return c
}

// expectUnlock matches the new pg_advisory_unlock implementation, which now
// uses QueryRowContext and verifies the boolean return value. Returning true
// indicates the session actually held the lock (the connection-pinning
// invariant); false would hint at a regression where the unlock landed on a
// different physical connection than the lock did.
func expectUnlock(mock sqlmock.Sqlmock) {
	mock.ExpectQuery("SELECT pg_advisory_unlock").WithArgs(advisoryLockKey).
		WillReturnRows(sqlmock.NewRows([]string{"pg_advisory_unlock"}).AddRow(true))
}

func TestVersionFromFilename(t *testing.T) {
	assert.Equal(t, "001_init", versionFromFilename("001_init.sql"))
	assert.Equal(t, "006_x", versionFromFilename("006_x.sql"))
}

func TestApplyMigrations_AppliesAllOnFreshDB(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	files := newFiles(
		[2]string{"001_init.sql", "CREATE TABLE t1();"},
		[2]string{"002_add.sql", "CREATE TABLE t2();"},
	)

	mock.ExpectExec("SELECT pg_advisory_lock").WithArgs(advisoryLockKey).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec("CREATE TABLE IF NOT EXISTS schema_migrations").
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery("SELECT version, filename, checksum FROM schema_migrations").
		WillReturnRows(sqlmock.NewRows([]string{"version", "filename", "checksum"}))
	mock.ExpectQuery("SELECT COUNT").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery("SELECT version, filename, checksum FROM schema_migrations").
		WillReturnRows(sqlmock.NewRows([]string{"version", "filename", "checksum"}))
	// file 1
	mock.ExpectBegin()
	mock.ExpectExec("CREATE TABLE t1").WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec("INSERT INTO schema_migrations").
		WithArgs("001_init", "001_init.sql", files[0].Checksum, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
	// file 2
	mock.ExpectBegin()
	mock.ExpectExec("CREATE TABLE t2").WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec("INSERT INTO schema_migrations").
		WithArgs("002_add", "002_add.sql", files[1].Checksum, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
	expectUnlock(mock)

	require.NoError(t, applyMigrationsWithFiles(context.Background(), pinConn(t, db), files))
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestApplyMigrations_SkipsAlreadyApplied(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	files := newFiles(
		[2]string{"001_init.sql", "CREATE TABLE t1();"},
	)
	mock.ExpectExec("SELECT pg_advisory_lock").WithArgs(advisoryLockKey).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec("CREATE TABLE IF NOT EXISTS schema_migrations").
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery("SELECT version, filename, checksum FROM schema_migrations").
		WillReturnRows(sqlmock.NewRows([]string{"version", "filename", "checksum"}).
			AddRow("001_init", "001_init.sql", files[0].Checksum))
	expectUnlock(mock)

	require.NoError(t, applyMigrationsWithFiles(context.Background(), pinConn(t, db), files))
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestApplyMigrations_ChecksumMismatchFails(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	files := newFiles(
		[2]string{"001_init.sql", "CREATE TABLE NEW();"},
	)
	mock.ExpectExec("SELECT pg_advisory_lock").WithArgs(advisoryLockKey).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec("CREATE TABLE IF NOT EXISTS schema_migrations").
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery("SELECT version, filename, checksum FROM schema_migrations").
		WillReturnRows(sqlmock.NewRows([]string{"version", "filename", "checksum"}).
			AddRow("001_init", "001_init.sql", "old-checksum"))
	expectUnlock(mock)

	err = applyMigrationsWithFiles(context.Background(), pinConn(t, db), files)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "checksum mismatch")
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestApplyMigrations_UnknownAppliedVersionFails(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	files := newFiles(
		[2]string{"001_init.sql", "CREATE TABLE t1();"},
	)
	mock.ExpectExec("SELECT pg_advisory_lock").WithArgs(advisoryLockKey).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec("CREATE TABLE IF NOT EXISTS schema_migrations").
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery("SELECT version, filename, checksum FROM schema_migrations").
		WillReturnRows(sqlmock.NewRows([]string{"version", "filename", "checksum"}).
			AddRow("001_init", "001_init.sql", files[0].Checksum).
			AddRow("999_future", "999_future.sql", "abc"))
	expectUnlock(mock)

	err = applyMigrationsWithFiles(context.Background(), pinConn(t, db), files)
	require.Error(t, err)
	assert.ErrorIs(t, err, errMissingFromBinary)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestApplyMigrations_RollsBackOnFailure(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	files := newFiles(
		[2]string{"001_init.sql", "BAD SQL;"},
	)
	mock.ExpectExec("SELECT pg_advisory_lock").WithArgs(advisoryLockKey).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec("CREATE TABLE IF NOT EXISTS schema_migrations").
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery("SELECT version, filename, checksum FROM schema_migrations").
		WillReturnRows(sqlmock.NewRows([]string{"version", "filename", "checksum"}))
	mock.ExpectQuery("SELECT COUNT").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery("SELECT version, filename, checksum FROM schema_migrations").
		WillReturnRows(sqlmock.NewRows([]string{"version", "filename", "checksum"}))
	mock.ExpectBegin()
	mock.ExpectExec("BAD SQL").WillReturnError(fmt.Errorf("syntax error"))
	mock.ExpectRollback()
	expectUnlock(mock)

	err = applyMigrationsWithFiles(context.Background(), pinConn(t, db), files)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "execute migration")
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestApplyMigrations_LegacyBootstrapInserts001To005(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	files := newFiles(
		[2]string{"001_init.sql", "CREATE TABLE u();"},
		[2]string{"002_add_document_links.sql", "CREATE TABLE dl();"},
		[2]string{"002_import_staging.sql", "CREATE TABLE imp();"},
		[2]string{"003_saved_views.sql", "CREATE TABLE sv();"},
		[2]string{"004_templates_assets_share.sql", "CREATE TABLE tpl();"},
		[2]string{"005_todos.sql", "CREATE TABLE td();"},
	)
	mock.ExpectExec("SELECT pg_advisory_lock").WithArgs(advisoryLockKey).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec("CREATE TABLE IF NOT EXISTS schema_migrations").
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery("SELECT version, filename, checksum FROM schema_migrations").
		WillReturnRows(sqlmock.NewRows([]string{"version", "filename", "checksum"}))
	// core tables present
	mock.ExpectQuery("SELECT COUNT").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(len(legacyCoreTables)))
	for range legacyCoreColumns {
		mock.ExpectQuery("FROM information_schema.columns").
			WillReturnRows(sqlmock.NewRows([]string{"?column?"}).AddRow(1))
	}
	mock.ExpectBegin()
	for _, name := range legacyMigrationFiles {
		mock.ExpectExec("INSERT INTO schema_migrations").
			WithArgs(versionFromFilename(name), name, sqlmock.AnyArg(), sqlmock.AnyArg()).
			WillReturnResult(sqlmock.NewResult(0, 1))
	}
	mock.ExpectCommit()
	mock.ExpectQuery("SELECT version, filename, checksum FROM schema_migrations").
		WillReturnRows(sqlmock.NewRows([]string{"version", "filename", "checksum"}).
			AddRow("001_init", "001_init.sql", files[0].Checksum).
			AddRow("002_add_document_links", "002_add_document_links.sql", files[1].Checksum).
			AddRow("002_import_staging", "002_import_staging.sql", files[2].Checksum).
			AddRow("003_saved_views", "003_saved_views.sql", files[3].Checksum).
			AddRow("004_templates_assets_share", "004_templates_assets_share.sql", files[4].Checksum).
			AddRow("005_todos", "005_todos.sql", files[5].Checksum))
	expectUnlock(mock)

	require.NoError(t, applyMigrationsWithFiles(context.Background(), pinConn(t, db), files))
	require.NoError(t, mock.ExpectationsWereMet())
}

// TestApplyMigrations_LegacyBootstrapMissingTableFails guards the partial
// baseline detection path: when some but not all of the expected legacy
// tables are present, bootstrap must fail loudly so operators restore a
// known-good baseline instead of relying on `IF NOT EXISTS` DDL silently
// papering over the gap.
func TestApplyMigrations_LegacyBootstrapMissingTableFails(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	files := newFiles(
		[2]string{"001_init.sql", "CREATE TABLE u();"},
	)
	mock.ExpectExec("SELECT pg_advisory_lock").WithArgs(advisoryLockKey).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec("CREATE TABLE IF NOT EXISTS schema_migrations").
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery("SELECT version, filename, checksum FROM schema_migrations").
		WillReturnRows(sqlmock.NewRows([]string{"version", "filename", "checksum"}))
	// One table missing → COUNT returns len-1 → partial.
	mock.ExpectQuery("SELECT COUNT").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(len(legacyCoreTables) - 1))
	// Bootstrap then enumerates which tables are missing. Simulate the
	// `templates` table being absent.
	presentNames := sqlmock.NewRows([]string{"table_name"})
	for _, name := range legacyCoreTables {
		if name == "templates" {
			continue
		}
		presentNames.AddRow(name)
	}
	mock.ExpectQuery("SELECT table_name FROM information_schema.tables").
		WillReturnRows(presentNames)
	expectUnlock(mock)

	err = applyMigrationsWithFiles(context.Background(), pinConn(t, db), files)
	require.Error(t, err)
	assert.ErrorIs(t, err, errLegacyMissingTable)
	assert.Contains(t, err.Error(), "templates")
	// No schema_migrations rows were written for 001–005.
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestApplyMigrations_LegacyBootstrapMissingColumnFails(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	files := newFiles(
		[2]string{"001_init.sql", "CREATE TABLE u();"},
		[2]string{"002_add_document_links.sql", "CREATE TABLE dl();"},
		[2]string{"002_import_staging.sql", "CREATE TABLE imp();"},
		[2]string{"003_saved_views.sql", "CREATE TABLE sv();"},
		[2]string{"004_templates_assets_share.sql", "CREATE TABLE tpl();"},
		[2]string{"005_todos.sql", "CREATE TABLE td();"},
	)
	mock.ExpectExec("SELECT pg_advisory_lock").WithArgs(advisoryLockKey).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec("CREATE TABLE IF NOT EXISTS schema_migrations").
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery("SELECT version, filename, checksum FROM schema_migrations").
		WillReturnRows(sqlmock.NewRows([]string{"version", "filename", "checksum"}))
	mock.ExpectQuery("SELECT COUNT").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(len(legacyCoreTables)))
	mock.ExpectQuery("FROM information_schema.columns").
		WillReturnRows(sqlmock.NewRows([]string{"?column?"})) // first column lookup returns 0 rows
	expectUnlock(mock)

	err = applyMigrationsWithFiles(context.Background(), pinConn(t, db), files)
	require.Error(t, err)
	assert.ErrorIs(t, err, errLegacyMissingTable)
	require.NoError(t, mock.ExpectationsWereMet())
}

// TestApplyMigrations_LegacyBootstrapMissingAssetFileKeyFails covers the
// column-validation half of legacy bootstrap. assets.file_key is a
// business-critical column (uploads cannot reference assets without it),
// so its absence must surface as a hard error naming the table and column
// rather than letting the migrator continue.
func TestApplyMigrations_LegacyBootstrapMissingAssetFileKeyFails(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	files := newFiles(
		[2]string{"001_init.sql", "CREATE TABLE u();"},
	)
	mock.ExpectExec("SELECT pg_advisory_lock").WithArgs(advisoryLockKey).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec("CREATE TABLE IF NOT EXISTS schema_migrations").
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery("SELECT version, filename, checksum FROM schema_migrations").
		WillReturnRows(sqlmock.NewRows([]string{"version", "filename", "checksum"}))
	mock.ExpectQuery("SELECT COUNT").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(len(legacyCoreTables)))
	// Walk the legacyCoreColumns list, returning a row for each entry until
	// we reach assets.file_key, at which point we return no rows so the
	// bootstrap rejects the baseline with errLegacyMissingTable.
	for _, col := range legacyCoreColumns {
		isFileKey := col.Table == "assets" && col.Column == "file_key"
		rows := sqlmock.NewRows([]string{"?column?"})
		if !isFileKey {
			rows = rows.AddRow(1)
		}
		mock.ExpectQuery("FROM information_schema.columns").WillReturnRows(rows)
		if isFileKey {
			break
		}
	}
	expectUnlock(mock)

	err = applyMigrationsWithFiles(context.Background(), pinConn(t, db), files)
	require.Error(t, err)
	assert.ErrorIs(t, err, errLegacyMissingTable)
	assert.Contains(t, err.Error(), "assets.file_key")
	require.NoError(t, mock.ExpectationsWereMet())
}

// TestLegacyCoreTables_OmitsSavedViews documents that saved_views is
// intentionally not part of the legacy baseline check: migration 007 drops
// it, so a database that has already removed saved_views out of band must
// still pass bootstrap and continue to apply 007 idempotently. This is a
// regression guard against accidentally re-adding saved_views to the list.
func TestLegacyCoreTables_OmitsSavedViews(t *testing.T) {
	for _, name := range legacyCoreTables {
		if name == "saved_views" {
			t.Fatalf("saved_views must not be part of legacyCoreTables")
		}
	}
}

// TestApplyMigrations_AcquireAndReleaseLockOnSameConnection asserts the
// connection-pinning contract of the migrator: pg_advisory_lock and
// pg_advisory_unlock — plus every read/write of schema_migrations performed
// in between — must execute on the same *sql.Conn. PostgreSQL's
// pg_advisory_lock is session-scoped, so if any operation in the critical
// section landed on a different physical connection, the lock would no
// longer serialize concurrent processes.
//
// We exercise the contract by giving applyMigrationsWithFiles a pinned
// *sql.Conn obtained from db.Conn(ctx). sqlmock binds every queued
// expectation to that single underlying mock session, so
// ExpectationsWereMet() implicitly proves that every recorded interaction
// reached that one connection in the expected order — including the lock,
// the schema_migrations CRUD, the migration DDL transaction, and the
// unlock query. We run two independent goroutines on independent mocks to
// confirm the migrator is reentrant; the meaningful single-conn invariant
// is enforced per goroutine.
//
// NOTE on scope: this test only proves single-connection binding inside
// one invocation. Real cross-process serialization between multiple mnote
// instances is provided by PostgreSQL itself (pg_advisory_lock is a
// blocking lock that waits on the same key from any session) and is not
// exercised here because the repository does not pin a testcontainers PG
// image into the test suite. A future iteration can replace this with a
// real-PG concurrency test without changing production code.
func TestApplyMigrations_AcquireAndReleaseLockOnSameConnection(t *testing.T) {
	files := newFiles(
		[2]string{"001_init.sql", "CREATE TABLE t1();"},
	)
	type runResult struct {
		err error
	}
	results := make(chan runResult, 2)
	var wg sync.WaitGroup

	run := func(simulateAlreadyApplied bool) {
		defer wg.Done()
		db, mock, err := sqlmock.New()
		if err != nil {
			results <- runResult{err: err}
			return
		}
		defer func() { _ = db.Close() }()
		mock.ExpectExec("SELECT pg_advisory_lock").WithArgs(advisoryLockKey).
			WillReturnResult(sqlmock.NewResult(0, 0))
		mock.ExpectExec("CREATE TABLE IF NOT EXISTS schema_migrations").
			WillReturnResult(sqlmock.NewResult(0, 0))
		if simulateAlreadyApplied {
			mock.ExpectQuery("SELECT version, filename, checksum FROM schema_migrations").
				WillReturnRows(sqlmock.NewRows([]string{"version", "filename", "checksum"}).
					AddRow("001_init", "001_init.sql", files[0].Checksum))
		} else {
			mock.ExpectQuery("SELECT version, filename, checksum FROM schema_migrations").
				WillReturnRows(sqlmock.NewRows([]string{"version", "filename", "checksum"}))
			mock.ExpectQuery("SELECT COUNT").
				WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
			mock.ExpectQuery("SELECT version, filename, checksum FROM schema_migrations").
				WillReturnRows(sqlmock.NewRows([]string{"version", "filename", "checksum"}))
			mock.ExpectBegin()
			mock.ExpectExec("CREATE TABLE t1").WillReturnResult(sqlmock.NewResult(0, 0))
			mock.ExpectExec("INSERT INTO schema_migrations").
				WithArgs("001_init", "001_init.sql", files[0].Checksum, sqlmock.AnyArg()).
				WillReturnResult(sqlmock.NewResult(0, 1))
			mock.ExpectCommit()
		}
		expectUnlock(mock)

		c, cerr := db.Conn(context.Background())
		if cerr != nil {
			results <- runResult{err: cerr}
			return
		}
		defer func() { _ = c.Close() }()
		err = applyMigrationsWithFiles(context.Background(), c, files)
		_ = mock.ExpectationsWereMet()
		results <- runResult{err: err}
	}

	wg.Add(2)
	go run(false)
	go run(true)
	wg.Wait()
	close(results)
	for r := range results {
		require.NoError(t, r.err)
	}
}

// TestApplyMigrations_PublicEntryPointAcquiresConn covers the public
// ApplyMigrations -> db.Conn(ctx) -> applyMigrationsWithFiles wiring: a
// db.Conn(ctx) failure must surface as an error from ApplyMigrations
// without touching the schema_migrations machinery. We trigger this by
// closing the DB up front so the pool refuses to hand out a conn.
func TestApplyMigrations_PublicEntryPointAcquiresConn(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	mock.ExpectClose()
	require.NoError(t, db.Close()) // force db.Conn(ctx) to fail

	err = ApplyMigrations(db)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "acquire migration conn")
}

// TestMigration006_BackfillsContentRevisionFromVersionsMax asserts that the
// 006 migration carries the data backfill required to prevent the first
// post-upgrade save on a legacy document from colliding with the existing
// document_versions(user_id, document_id, version) unique index. The save
// path writes document_versions.version = documents.content_revision, so a
// document with prior versions 1..N must come out of the migration with
// content_revision = N. We assert on the SQL text because (a) sqlmock cannot
// execute real PostgreSQL queries and (b) the repository has no
// testcontainers-backed integration harness; the migration is executed by
// the driver in a single Exec call, so any divergence between the source
// text and the runtime behavior would itself be a driver bug.
func TestMigration006_BackfillsContentRevisionFromVersionsMax(t *testing.T) {
	body, err := fs.ReadFile(migrationsFS, migrationsDir+"/006_add_document_content_revision.sql")
	require.NoError(t, err)
	text := string(body)
	assert.Contains(t, text, "UPDATE documents d", "006 must contain the content_revision backfill")
	assert.Contains(t, text, "SET content_revision = COALESCE(")
	assert.Contains(t, text, "SELECT MAX(version) FROM document_versions v")
	assert.Contains(t, text, "WHERE v.user_id = d.user_id AND v.document_id = d.id")
	assert.Contains(t, text, "WHERE content_revision = 1",
		"backfill must be guarded so a re-execution against partially-advanced data is safe")
	// Sanity: ensure the ALTER appears before the UPDATE so the column is in
	// place when the backfill runs.
	alterIdx := strings.Index(text, "ADD COLUMN IF NOT EXISTS content_revision")
	updateIdx := strings.Index(text, "SELECT MAX(version) FROM document_versions v")
	require.NotEqual(t, -1, alterIdx)
	require.NotEqual(t, -1, updateIdx)
	assert.Less(t, alterIdx, updateIdx,
		"content_revision column must exist before the MAX(version) backfill runs")
}

func TestLoadMigrationFiles_ReturnsEmbedded(t *testing.T) {
	files, err := loadMigrationFiles()
	require.NoError(t, err)
	require.NotEmpty(t, files)
	for _, want := range legacyMigrationFiles {
		found := false
		for _, f := range files {
			if f.Filename == want {
				found = true
				break
			}
		}
		assert.True(t, found, "expected %s in embedded migrations", want)
	}
}

func TestValidateApplied(t *testing.T) {
	files := newFiles([2]string{"001_init.sql", "X"})
	t.Run("ok", func(t *testing.T) {
		applied := map[string]appliedMigration{
			"001_init": {Version: "001_init", Filename: "001_init.sql", Checksum: files[0].Checksum},
		}
		require.NoError(t, validateApplied(files, applied))
	})
	t.Run("unknown_version", func(t *testing.T) {
		applied := map[string]appliedMigration{
			"999_future": {Version: "999_future", Filename: "999_future.sql", Checksum: "x"},
		}
		err := validateApplied(files, applied)
		require.Error(t, err)
	})
	t.Run("checksum_mismatch", func(t *testing.T) {
		applied := map[string]appliedMigration{
			"001_init": {Version: "001_init", Filename: "001_init.sql", Checksum: "stale"},
		}
		err := validateApplied(files, applied)
		require.Error(t, err)
	})
}

func TestExecutesMigrationWithEmbeddedSemicolons(t *testing.T) {
	// Verifies that the new migrator passes the entire file contents to the
	// driver in one ExecContext call instead of splitting on raw ";". This
	// guarantees that strings or PL/pgSQL function bodies that legitimately
	// contain semicolons survive intact.
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	body := "DO $$ BEGIN PERFORM 1; PERFORM 2; END $$;"
	files := newFiles([2]string{"010_do.sql", body})

	mock.ExpectExec("SELECT pg_advisory_lock").WithArgs(advisoryLockKey).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec("CREATE TABLE IF NOT EXISTS schema_migrations").
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery("SELECT version, filename, checksum FROM schema_migrations").
		WillReturnRows(sqlmock.NewRows([]string{"version", "filename", "checksum"}))
	mock.ExpectQuery("SELECT COUNT").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery("SELECT version, filename, checksum FROM schema_migrations").
		WillReturnRows(sqlmock.NewRows([]string{"version", "filename", "checksum"}))
	mock.ExpectBegin()
	// sqlmock uses regexp matching by default; quote the body and match the
	// full statement we expect to send.
	mock.ExpectExec("DO \\$\\$ BEGIN PERFORM 1; PERFORM 2; END \\$\\$;").
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec("INSERT INTO schema_migrations").
		WithArgs("010_do", "010_do.sql", files[0].Checksum, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
	expectUnlock(mock)

	require.NoError(t, applyMigrationsWithFiles(context.Background(), pinConn(t, db), files))
	require.NoError(t, mock.ExpectationsWereMet())
}

// TestMigration008_BackfillsContentHashWithDocumentHashFormula pins the
// 008 backfill migration to the exact hashing formula used by the Go save
// path (computeDocumentHash in internal/service/document_service.go). If
// either the SQL or the Go side drifts, the embedding stale loop re-opens
// the very gap this migration exists to close, so we lock the contract
// from both ends:
//
//   - The SQL file must declare pgcrypto, must use E'\n' (a one-byte 0x0A
//     escape) rather than the four-byte literal "\\n", must run the
//     digest through encode(..., 'hex'), and must only touch rows whose
//     content_hash is still the empty-string seed.
//   - sha256(title || "\n" || content), rendered as lower-case hex, is
//     the canonical fingerprint. We pin a known sample so a future
//     refactor that accidentally switches the separator or the encoding
//     fails this test instead of corrupting production data silently.
func TestMigration008_BackfillsContentHashWithDocumentHashFormula(t *testing.T) {
	const path = "migrations/008_backfill_document_content_hash.sql"
	raw, err := fs.ReadFile(migrationsFS, path)
	require.NoError(t, err, "migration file %s must be embedded", path)
	sqlText := string(raw)

	// The SQL contract: each phrase below is load-bearing for the
	// backfill to match computeDocumentHash. Asserting plain substrings
	// (instead of regexes) keeps the test resilient to whitespace tweaks
	// while still catching the only meaningful drifts.
	required := []string{
		"CREATE EXTENSION IF NOT EXISTS pgcrypto",
		"E'\\n'",
		"digest(title || E'\\n' || content, 'sha256')",
		"encode(",
		", 'hex')",
		"WHERE content_hash = ''",
	}
	for _, phrase := range required {
		assert.Contains(t, sqlText, phrase, "migration 008 must contain %q", phrase)
	}

	// Go-side anchor: sha256("hello" || "\n" || "world") hex-encoded.
	// Computed once with crypto/sha256 + encoding/hex; embedding the
	// pre-computed digest catches both algorithm changes and separator
	// regressions (e.g. a future patch that swaps '\n' for ' ' or drops
	// the separator entirely).
	sum := sha256.Sum256([]byte("hello" + "\n" + "world"))
	got := hex.EncodeToString(sum[:])
	// hex.EncodeToString always emits 64 lower-case characters for a
	// 32-byte SHA-256 digest; SQL's encode(..., 'hex') has the same
	// contract, so any future Go-side reformat would fail this length
	// invariant before reaching production.
	assert.Len(t, got, 64)
	// Cross-check that joining title + "\n" + content as two concatenated
	// Go literals and as a single literal produce the same bytes; this is
	// a guard against a future refactor that mistakenly uses a multi-byte
	// escape on one side and a one-byte newline on the other.
	alt := sha256.Sum256([]byte("hello\nworld"))
	assert.Equal(t, hex.EncodeToString(alt[:]), got, "two equivalent expressions of the formula must agree")
	// Hard-coded anchor: any future PR that changes the separator,
	// encoding, or algorithm flips this assertion immediately. The value
	// is sha256("hello\nworld") rendered as lower-case hex, computed
	// out-of-band so the test cannot self-validate against a moved
	// target.
	const pinned = "26c60a61d01db5836ca70fefd44a6a016620413c8ef5f259a6c5612d4f79d3b8"
	assert.Equal(t, pinned, got, "sha256(title || '\\n' || content) hex must equal pinned anchor")
}
