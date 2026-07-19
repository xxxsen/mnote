package db

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"io/fs"
	"regexp"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/lib/pq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func sum(value string) string {
	hash := sha256.Sum256([]byte(value))
	return hex.EncodeToString(hash[:])
}

func newFiles(specs ...[2]string) []migrationFile {
	files := make([]migrationFile, 0, len(specs))
	for _, spec := range specs {
		files = append(files, migrationFile{
			Version:  versionFromFilename(spec[0]),
			Filename: spec[0],
			Content:  []byte(spec[1]),
			Checksum: sum(spec[1]),
		})
	}
	return files
}

func pinConn(t *testing.T, database *sql.DB) *sql.Conn {
	t.Helper()
	conn, err := database.Conn(context.Background())
	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.Close() })
	return conn
}

func expectLock(mock sqlmock.Sqlmock) {
	mock.ExpectExec("SELECT pg_advisory_lock").WithArgs(advisoryLockKey).
		WillReturnResult(sqlmock.NewResult(0, 0))
}

func expectUnlock(mock sqlmock.Sqlmock) {
	mock.ExpectQuery("SELECT pg_advisory_unlock").WithArgs(advisoryLockKey).
		WillReturnRows(sqlmock.NewRows([]string{"pg_advisory_unlock"}).AddRow(true))
}

func expectMigrationApplied(mock sqlmock.Sqlmock, file migrationFile) {
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta(string(file.Content))).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec("INSERT INTO schema_migrations").
		WithArgs(file.Version, file.Filename, file.Checksum, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
}

func TestVersionFromFilename(t *testing.T) {
	assert.Equal(t, "001_init", versionFromFilename("001_init.sql"))
	assert.Equal(t, "002_import_staging", versionFromFilename("002_import_staging.sql"))
}

func TestApplyMigrations_BootstrapsMissingLedgerFromSQL(t *testing.T) {
	database, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = database.Close() }()

	files := newFiles(
		[2]string{bootstrapMigrationFilename, "SELECT 'bootstrap';"},
		[2]string{"001_init.sql", "SELECT 'init';"},
	)
	expectLock(mock)
	mock.ExpectQuery("SELECT version, filename, checksum FROM schema_migrations").
		WillReturnError(&pq.Error{Code: "42P01", Message: "undefined table"})
	expectMigrationApplied(mock, files[0])
	mock.ExpectQuery("SELECT version, filename, checksum FROM schema_migrations").
		WillReturnRows(sqlmock.NewRows([]string{"version", "filename", "checksum"}).
			AddRow(files[0].Version, files[0].Filename, files[0].Checksum))
	expectMigrationApplied(mock, files[1])
	expectUnlock(mock)

	require.NoError(t, applyMigrationsWithFiles(context.Background(), pinConn(t, database), files))
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestApplyMigrations_AppliesBootstrapWhenLedgerExistsWithoutRecord(t *testing.T) {
	database, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = database.Close() }()

	files := newFiles(
		[2]string{bootstrapMigrationFilename, "SELECT 'bootstrap';"},
		[2]string{"001_init.sql", "SELECT 'init';"},
	)
	expectLock(mock)
	mock.ExpectQuery("SELECT version, filename, checksum FROM schema_migrations").
		WillReturnRows(sqlmock.NewRows([]string{"version", "filename", "checksum"}).
			AddRow(files[1].Version, files[1].Filename, files[1].Checksum))
	expectMigrationApplied(mock, files[0])
	expectUnlock(mock)

	require.NoError(t, applyMigrationsWithFiles(context.Background(), pinConn(t, database), files))
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestApplyMigrations_DoesNotBootstrapOtherLedgerErrors(t *testing.T) {
	database, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = database.Close() }()

	files := newFiles([2]string{bootstrapMigrationFilename, "SELECT 'bootstrap';"})
	expectLock(mock)
	mock.ExpectQuery("SELECT version, filename, checksum FROM schema_migrations").
		WillReturnError(&pq.Error{Code: "42501", Message: "permission denied"})
	expectUnlock(mock)

	err = applyMigrationsWithFiles(context.Background(), pinConn(t, database), files)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "query applied migrations")
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestApplyMigrations_SkipsAlreadyApplied(t *testing.T) {
	database, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = database.Close() }()

	files := newFiles([2]string{bootstrapMigrationFilename, "SELECT 'bootstrap';"})
	expectLock(mock)
	mock.ExpectQuery("SELECT version, filename, checksum FROM schema_migrations").
		WillReturnRows(sqlmock.NewRows([]string{"version", "filename", "checksum"}).
			AddRow(files[0].Version, files[0].Filename, files[0].Checksum))
	expectUnlock(mock)

	require.NoError(t, applyMigrationsWithFiles(context.Background(), pinConn(t, database), files))
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestApplyMigrations_ChecksumMismatchFails(t *testing.T) {
	database, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = database.Close() }()

	files := newFiles([2]string{bootstrapMigrationFilename, "SELECT 'bootstrap';"})
	expectLock(mock)
	mock.ExpectQuery("SELECT version, filename, checksum FROM schema_migrations").
		WillReturnRows(sqlmock.NewRows([]string{"version", "filename", "checksum"}).
			AddRow(files[0].Version, files[0].Filename, "stale"))
	expectUnlock(mock)

	err = applyMigrationsWithFiles(context.Background(), pinConn(t, database), files)
	require.Error(t, err)
	assert.ErrorIs(t, err, errChecksumMismatch)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestApplyMigrations_UnknownAppliedVersionFails(t *testing.T) {
	database, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = database.Close() }()

	files := newFiles([2]string{bootstrapMigrationFilename, "SELECT 'bootstrap';"})
	expectLock(mock)
	mock.ExpectQuery("SELECT version, filename, checksum FROM schema_migrations").
		WillReturnRows(sqlmock.NewRows([]string{"version", "filename", "checksum"}).
			AddRow(files[0].Version, files[0].Filename, files[0].Checksum).
			AddRow("999_future", "999_future.sql", "future"))
	expectUnlock(mock)

	err = applyMigrationsWithFiles(context.Background(), pinConn(t, database), files)
	require.Error(t, err)
	assert.ErrorIs(t, err, errMissingFromBinary)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestApplyMigrations_RollsBackMigrationAndLedgerOnFailure(t *testing.T) {
	database, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = database.Close() }()

	files := newFiles(
		[2]string{bootstrapMigrationFilename, "SELECT 'bootstrap';"},
		[2]string{"001_init.sql", "BAD SQL;"},
	)
	expectLock(mock)
	mock.ExpectQuery("SELECT version, filename, checksum FROM schema_migrations").
		WillReturnRows(sqlmock.NewRows([]string{"version", "filename", "checksum"}).
			AddRow(files[0].Version, files[0].Filename, files[0].Checksum))
	mock.ExpectBegin()
	mock.ExpectExec("BAD SQL").WillReturnError(errors.New("syntax error"))
	mock.ExpectRollback()
	expectUnlock(mock)

	err = applyMigrationsWithFiles(context.Background(), pinConn(t, database), files)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "execute migration")
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestApplyMigrations_UnmanagedSchemaFailureDoesNotRecordBootstrap(t *testing.T) {
	database, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = database.Close() }()

	files := newFiles([2]string{bootstrapMigrationFilename, "DO bootstrap;"})
	expectLock(mock)
	mock.ExpectQuery("SELECT version, filename, checksum FROM schema_migrations").
		WillReturnRows(sqlmock.NewRows([]string{"version", "filename", "checksum"}))
	mock.ExpectBegin()
	mock.ExpectExec("DO bootstrap").
		WillReturnError(&pq.Error{Code: "55000", Message: "unmanaged non-empty schema"})
	mock.ExpectRollback()
	expectUnlock(mock)

	err = applyMigrationsWithFiles(context.Background(), pinConn(t, database), files)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unmanaged non-empty schema")
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestApplyMigrations_UsesPinnedConnectionForLockAndLedger(t *testing.T) {
	database, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = database.Close() }()

	files := newFiles([2]string{bootstrapMigrationFilename, "SELECT 'bootstrap';"})
	expectLock(mock)
	mock.ExpectQuery("SELECT version, filename, checksum FROM schema_migrations").
		WillReturnRows(sqlmock.NewRows([]string{"version", "filename", "checksum"}).
			AddRow(files[0].Version, files[0].Filename, files[0].Checksum))
	expectUnlock(mock)

	require.NoError(t, applyMigrationsWithFiles(
		context.Background(),
		pinConn(t, database),
		files,
	))
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestApplyMigrations_PublicEntryPointAcquiresConn(t *testing.T) {
	database, mock, err := sqlmock.New()
	require.NoError(t, err)
	mock.ExpectClose()
	require.NoError(t, database.Close())

	err = ApplyMigrations(database)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "acquire migration conn")
}

func TestLoadMigrationFiles_ReturnsEmbeddedManifest(t *testing.T) {
	files, err := loadMigrationFiles()
	require.NoError(t, err)
	require.NotEmpty(t, files)
	assert.Equal(t, bootstrapMigrationFilename, files[0].Filename)

	expected := []string{
		"001_init.sql",
		"002_add_document_links.sql",
		"002_import_staging.sql",
		"003_saved_views.sql",
		"004_templates_assets_share.sql",
		"005_todos.sql",
		"006_add_document_content_revision.sql",
		"007_drop_saved_views.sql",
		"008_backfill_document_content_hash.sql",
	}
	byName := make(map[string]migrationFile, len(files))
	for _, file := range files {
		byName[file.Filename] = file
	}
	for _, filename := range expected {
		_, ok := byName[filename]
		assert.True(t, ok, "expected %s in embedded migrations", filename)
	}
}

func TestLoadMigrationFilesFromFS_ValidatesManifest(t *testing.T) {
	valid := fstest.MapFS{
		"migrations/000_schema_migrations.sql": {Data: []byte("SELECT 1;")},
		"migrations/001_init.sql":              {Data: []byte("SELECT 2;")},
	}
	files, err := loadMigrationFilesFromFS(valid, migrationsDir)
	require.NoError(t, err)
	require.Len(t, files, 2)

	tests := []struct {
		name string
		fsys fstest.MapFS
		want string
	}{
		{
			name: "missing bootstrap",
			fsys: fstest.MapFS{
				"migrations/001_init.sql": {Data: []byte("SELECT 1;")},
			},
			want: "must exist and sort first",
		},
		{
			name: "invalid filename",
			fsys: fstest.MapFS{
				"migrations/000_schema_migrations.sql": {Data: []byte("SELECT 1;")},
				"migrations/next.sql":                  {Data: []byte("SELECT 2;")},
			},
			want: "invalid migration filename",
		},
		{
			name: "empty migration",
			fsys: fstest.MapFS{
				"migrations/000_schema_migrations.sql": {Data: []byte("SELECT 1;")},
				"migrations/001_empty.sql":             {Data: []byte(" \n\t")},
			},
			want: "is empty",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, loadErr := loadMigrationFilesFromFS(tt.fsys, migrationsDir)
			require.Error(t, loadErr)
			assert.Contains(t, loadErr.Error(), tt.want)
		})
	}
}

func TestValidateMigrationManifest_RejectsDuplicates(t *testing.T) {
	base := migrationFile{
		Version:  "000_schema_migrations",
		Filename: bootstrapMigrationFilename,
		Content:  []byte("SELECT 1;"),
	}
	t.Run("filename", func(t *testing.T) {
		err := validateMigrationManifest([]migrationFile{base, base})
		require.Error(t, err)
		assert.Contains(t, err.Error(), "duplicate migration filename")
	})
	t.Run("version", func(t *testing.T) {
		duplicate := migrationFile{
			Version:  base.Version,
			Filename: "001_duplicate.sql",
			Content:  []byte("SELECT 2;"),
		}
		err := validateMigrationManifest([]migrationFile{base, duplicate})
		require.Error(t, err)
		assert.Contains(t, err.Error(), "duplicate migration version")
	})
}

func TestValidateApplied(t *testing.T) {
	files := newFiles([2]string{"001_init.sql", "SELECT 1;"})
	t.Run("ok", func(t *testing.T) {
		applied := map[string]appliedMigration{
			files[0].Version: {
				Version:  files[0].Version,
				Filename: files[0].Filename,
				Checksum: files[0].Checksum,
			},
		}
		require.NoError(t, validateApplied(files, applied))
	})
	t.Run("unknown version", func(t *testing.T) {
		err := validateApplied(files, map[string]appliedMigration{
			"999_future": {Version: "999_future", Filename: "999_future.sql", Checksum: "x"},
		})
		require.ErrorIs(t, err, errMissingFromBinary)
	})
	t.Run("checksum mismatch", func(t *testing.T) {
		err := validateApplied(files, map[string]appliedMigration{
			files[0].Version: {
				Version:  files[0].Version,
				Filename: files[0].Filename,
				Checksum: "stale",
			},
		})
		require.ErrorIs(t, err, errChecksumMismatch)
	})
}

func TestExecutesMigrationWithEmbeddedSemicolons(t *testing.T) {
	database, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = database.Close() }()

	bootstrap := newFiles([2]string{bootstrapMigrationFilename, "SELECT 'bootstrap';"})[0]
	body := "DO $$ BEGIN PERFORM 1; PERFORM 2; END $$;"
	migration := newFiles([2]string{"010_do.sql", body})[0]
	files := []migrationFile{bootstrap, migration}

	expectLock(mock)
	mock.ExpectQuery("SELECT version, filename, checksum FROM schema_migrations").
		WillReturnRows(sqlmock.NewRows([]string{"version", "filename", "checksum"}).
			AddRow(bootstrap.Version, bootstrap.Filename, bootstrap.Checksum))
	expectMigrationApplied(mock, migration)
	expectUnlock(mock)

	require.NoError(t, applyMigrationsWithFiles(context.Background(), pinConn(t, database), files))
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestMigration000_OwnsSchemaMigrationsDDLAndRejectsUnmanagedSchema(t *testing.T) {
	body, err := fs.ReadFile(migrationsFS, migrationsDir+"/"+bootstrapMigrationFilename)
	require.NoError(t, err)
	text := string(body)
	assert.Contains(t, text, "CREATE TABLE IF NOT EXISTS schema_migrations")
	assert.Contains(t, text, "NOT EXISTS (SELECT 1 FROM schema_migrations)")
	assert.Contains(t, text, "FROM pg_catalog.pg_tables")
	assert.Contains(t, text, "tablename <> 'schema_migrations'")
	assert.Contains(t, text, "ERRCODE = '55000'")
	assert.NotContains(t, text, "INSERT INTO schema_migrations")
}

func TestMigration006_BackfillsContentRevisionFromVersionsMax(t *testing.T) {
	body, err := fs.ReadFile(
		migrationsFS,
		migrationsDir+"/006_add_document_content_revision.sql",
	)
	require.NoError(t, err)
	text := string(body)
	assert.Contains(t, text, "UPDATE documents d")
	assert.Contains(t, text, "SET content_revision = COALESCE(")
	assert.Contains(t, text, "SELECT MAX(version) FROM document_versions v")
	assert.Contains(t, text, "WHERE v.user_id = d.user_id AND v.document_id = d.id")
	assert.Contains(t, text, "WHERE content_revision = 1")
	alterIndex := strings.Index(text, "ADD COLUMN IF NOT EXISTS content_revision")
	updateIndex := strings.Index(text, "SELECT MAX(version) FROM document_versions v")
	require.NotEqual(t, -1, alterIndex)
	require.NotEqual(t, -1, updateIndex)
	assert.Less(t, alterIndex, updateIndex)
}

func TestMigration008_BackfillsContentHashWithDocumentHashFormula(t *testing.T) {
	raw, err := fs.ReadFile(
		migrationsFS,
		migrationsDir+"/008_backfill_document_content_hash.sql",
	)
	require.NoError(t, err)
	sqlText := string(raw)
	required := []string{
		"CREATE EXTENSION IF NOT EXISTS pgcrypto",
		"E'\\n'",
		"digest(title || E'\\n' || content, 'sha256')",
		"encode(",
		", 'hex')",
		"WHERE content_hash = ''",
	}
	for _, phrase := range required {
		assert.Contains(t, sqlText, phrase)
	}

	hash := sha256.Sum256([]byte("hello" + "\n" + "world"))
	got := hex.EncodeToString(hash[:])
	assert.Len(t, got, 64)
	assert.Equal(
		t,
		"26c60a61d01db5836ca70fefd44a6a016620413c8ef5f259a6c5612d4f79d3b8",
		got,
	)
}
