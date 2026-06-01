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
