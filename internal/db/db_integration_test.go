//go:build integration

package db

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"os"
	"sort"
	"strconv"
	"sync"
	"testing"

	"github.com/lib/pq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type integrationSchema struct {
	admin    *sql.DB
	database *sql.DB
	config   Config
	name     string
}

func integrationConfig(t *testing.T) Config {
	t.Helper()
	host := os.Getenv("TEST_DB_HOST")
	if host == "" {
		t.Fatal("TEST_DB_HOST is required for integration tests")
	}
	portText := os.Getenv("TEST_DB_PORT")
	if portText == "" {
		portText = "5432"
	}
	port, err := strconv.Atoi(portText)
	require.NoError(t, err)
	require.Greater(t, port, 0)
	require.LessOrEqual(t, port, 65535)
	valueOr := func(name, fallback string) string {
		if value := os.Getenv(name); value != "" {
			return value
		}
		return fallback
	}
	return Config{
		Host:     host,
		Port:     port,
		User:     valueOr("TEST_DB_USER", "mnote"),
		Password: valueOr("TEST_DB_PASSWORD", "mnote_pass"),
		DBName:   valueOr("TEST_DB_NAME", "mnote_test"),
		SSLMode:  valueOr("TEST_DB_SSLMODE", "disable"),
	}
}

func newIntegrationSchema(t *testing.T) *integrationSchema {
	t.Helper()
	cfg := integrationConfig(t)
	admin, err := Open(context.Background(), cfg)
	require.NoError(t, err)
	t.Cleanup(func() { _ = admin.Close() })

	random := make([]byte, 12)
	_, err = rand.Read(random)
	require.NoError(t, err)
	name := "mnote_db_it_" + hex.EncodeToString(random)
	_, err = admin.ExecContext(
		context.Background(),
		"CREATE SCHEMA "+pq.QuoteIdentifier(name),
	)
	require.NoError(t, err)

	cfg.DSN = fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s "+
			"options='-c search_path=%s,public'",
		cfg.Host,
		cfg.Port,
		cfg.User,
		cfg.Password,
		cfg.DBName,
		cfg.SSLMode,
		name,
	)
	database, err := Open(context.Background(), cfg)
	require.NoError(t, err)

	schema := &integrationSchema{
		admin:    admin,
		database: database,
		config:   cfg,
		name:     name,
	}
	t.Cleanup(func() {
		_ = database.Close()
		_, _ = admin.ExecContext(
			context.Background(),
			"DROP SCHEMA "+pq.QuoteIdentifier(name)+" CASCADE",
		)
	})
	return schema
}

func (schema *integrationSchema) openAnother(t *testing.T) *sql.DB {
	t.Helper()
	database, err := Open(context.Background(), schema.config)
	require.NoError(t, err)
	t.Cleanup(func() { _ = database.Close() })
	return database
}

func TestApplyMigrationsIntegration_EmptySchema(t *testing.T) {
	schema := newIntegrationSchema(t)
	require.NoError(t, ApplyMigrations(schema.database))
	require.NoError(t, ApplyMigrations(schema.database))

	files, err := loadMigrationFiles()
	require.NoError(t, err)
	var appliedCount int
	require.NoError(t, schema.database.QueryRowContext(
		context.Background(),
		"SELECT COUNT(*) FROM schema_migrations",
	).Scan(&appliedCount))
	assert.Equal(t, len(files), appliedCount)

	var usersTable, savedViewsTable sql.NullString
	require.NoError(t, schema.database.QueryRowContext(
		context.Background(),
		`SELECT
			to_regclass(current_schema() || '.users')::text,
			to_regclass(current_schema() || '.saved_views')::text`,
	).Scan(&usersTable, &savedViewsTable))
	assert.True(t, usersTable.Valid)
	assert.False(t, savedViewsTable.Valid)
}

func TestApplyMigrationsIntegration_CurrentProductionLedgerAddsOnlyBootstrap(t *testing.T) {
	schema := newIntegrationSchema(t)
	files, err := loadMigrationFiles()
	require.NoError(t, err)
	baseline := make([]migrationFile, 0, len(files))
	for _, file := range files {
		if file.Filename == bootstrapMigrationFilename ||
			file.Version <= "008_backfill_document_content_hash" {
			baseline = append(baseline, file)
		}
	}
	conn, err := schema.database.Conn(context.Background())
	require.NoError(t, err)
	require.NoError(t, applyMigrationsWithFiles(context.Background(), conn, baseline))
	require.NoError(t, conn.Close())

	var originalAppliedAt int64
	require.NoError(t, schema.database.QueryRowContext(
		context.Background(),
		"SELECT applied_at FROM schema_migrations WHERE version = '001_init'",
	).Scan(&originalAppliedAt))
	_, err = schema.database.ExecContext(
		context.Background(),
		"DELETE FROM schema_migrations WHERE version = '000_schema_migrations'",
	)
	require.NoError(t, err)

	require.NoError(t, ApplyMigrations(schema.database))
	var reappliedAt int64
	require.NoError(t, schema.database.QueryRowContext(
		context.Background(),
		"SELECT applied_at FROM schema_migrations WHERE version = '001_init'",
	).Scan(&reappliedAt))
	assert.Equal(t, originalAppliedAt, reappliedAt)

	var bootstrapCount int
	require.NoError(t, schema.database.QueryRowContext(
		context.Background(),
		"SELECT COUNT(*) FROM schema_migrations WHERE version = '000_schema_migrations'",
	).Scan(&bootstrapCount))
	assert.Equal(t, 1, bootstrapCount)

	var latestCount int
	require.NoError(t, schema.database.QueryRowContext(
		context.Background(),
		"SELECT COUNT(*) FROM schema_migrations WHERE version > '008_backfill_document_content_hash'",
	).Scan(&latestCount))
	assert.Equal(t, len(files)-len(baseline), latestCount)
}

func TestApplyMigrationsIntegration_ProductionDirtyDataIsArchivedAndConverged(t *testing.T) {
	schema := newIntegrationSchema(t)
	files, err := loadMigrationFiles()
	require.NoError(t, err)
	baseline := make([]migrationFile, 0, len(files))
	for _, file := range files {
		if file.Filename == bootstrapMigrationFilename ||
			file.Version <= "008_backfill_document_content_hash" {
			baseline = append(baseline, file)
		}
	}
	conn, err := schema.database.Conn(context.Background())
	require.NoError(t, err)
	require.NoError(t, applyMigrationsWithFiles(context.Background(), conn, baseline))
	require.NoError(t, conn.Close())

	_, err = schema.database.ExecContext(context.Background(), `
		INSERT INTO users (id, email, password_hash, ctime, mtime)
		VALUES ('user-1', 'User@example.test', 'hash', 1, 1);
		INSERT INTO documents (
			id, user_id, title, content, state, pinned, starred, ctime, mtime
		) VALUES ('doc-1', 'user-1', 'title', 'content', 1, 0, 0, 1, 1);
		INSERT INTO document_links (source_id, target_id, user_id, ctime)
		VALUES ('missing-source', 'missing-target', 'user-1', 1);
		INSERT INTO shares (
			id, user_id, document_id, token, state, ctime, mtime
		) VALUES
			('share-old', 'user-1', 'doc-1', 'token-old', 1, 1, 1),
			('share-new', 'user-1', 'doc-1', 'token-new', 1, 2, 2);
	`)
	require.NoError(t, err)

	require.NoError(t, ApplyMigrations(schema.database))

	var orphanLinks, archivedLinks int
	require.NoError(t, schema.database.QueryRowContext(
		context.Background(),
		"SELECT COUNT(*) FROM document_links",
	).Scan(&orphanLinks))
	require.NoError(t, schema.database.QueryRowContext(
		context.Background(),
		"SELECT COUNT(*) FROM integrity_orphan_archive WHERE source_table = 'document_links'",
	).Scan(&archivedLinks))
	assert.Zero(t, orphanLinks)
	assert.Equal(t, 1, archivedLinks)

	var activeShares, revokedShares int
	require.NoError(t, schema.database.QueryRowContext(
		context.Background(),
		"SELECT COUNT(*) FILTER (WHERE state = 1), COUNT(*) FILTER (WHERE state = 2) FROM shares",
	).Scan(&activeShares, &revokedShares))
	assert.Equal(t, 1, activeShares)
	assert.Equal(t, 1, revokedShares)
}

func TestApplyMigrationsIntegration_UnmanagedNonEmptySchemaFails(t *testing.T) {
	schema := newIntegrationSchema(t)
	_, err := schema.database.ExecContext(
		context.Background(),
		"CREATE TABLE unmanaged_data (id BIGINT PRIMARY KEY)",
	)
	require.NoError(t, err)

	err = ApplyMigrations(schema.database)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unmanaged non-empty schema")

	var ledger sql.NullString
	require.NoError(t, schema.database.QueryRowContext(
		context.Background(),
		"SELECT to_regclass(current_schema() || '.schema_migrations')::text",
	).Scan(&ledger))
	assert.False(t, ledger.Valid, "bootstrap transaction must roll back its ledger DDL")
}

func TestApplyMigrationsIntegration_EmptyLedgerWithBusinessTableFails(t *testing.T) {
	schema := newIntegrationSchema(t)
	_, err := schema.database.ExecContext(
		context.Background(),
		`CREATE TABLE schema_migrations (
		    version TEXT PRIMARY KEY,
		    filename TEXT NOT NULL UNIQUE,
		    checksum TEXT NOT NULL,
		    applied_at BIGINT NOT NULL
		);
		CREATE TABLE unmanaged_data (id BIGINT PRIMARY KEY);`,
	)
	require.NoError(t, err)

	err = ApplyMigrations(schema.database)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unmanaged non-empty schema")

	var appliedCount int
	require.NoError(t, schema.database.QueryRowContext(
		context.Background(),
		"SELECT COUNT(*) FROM schema_migrations",
	).Scan(&appliedCount))
	assert.Zero(t, appliedCount)
}

func TestApplyMigrationsIntegration_FailedMigrationRollsBackSchemaAndLedger(t *testing.T) {
	schema := newIntegrationSchema(t)
	require.NoError(t, ApplyMigrations(schema.database))
	files, err := loadMigrationFiles()
	require.NoError(t, err)
	failure := migrationFile{
		Version:  "999_failure",
		Filename: "999_failure.sql",
		Content: []byte(
			"CREATE TABLE migration_must_rollback (id BIGINT PRIMARY KEY); SELECT 1 / 0;",
		),
	}
	failure.Checksum = sum(string(failure.Content))
	files = append(files, failure)
	sort.Slice(files, func(i, j int) bool {
		return files[i].Filename < files[j].Filename
	})

	conn, err := schema.database.Conn(context.Background())
	require.NoError(t, err)
	defer func() { _ = conn.Close() }()
	err = applyMigrationsWithFiles(context.Background(), conn, files)
	require.Error(t, err)

	var table sql.NullString
	require.NoError(t, schema.database.QueryRowContext(
		context.Background(),
		"SELECT to_regclass(current_schema() || '.migration_must_rollback')::text",
	).Scan(&table))
	assert.False(t, table.Valid)
	var appliedCount int
	require.NoError(t, schema.database.QueryRowContext(
		context.Background(),
		"SELECT COUNT(*) FROM schema_migrations WHERE version = '999_failure'",
	).Scan(&appliedCount))
	assert.Zero(t, appliedCount)
}

func TestApplyMigrationsIntegration_ConcurrentInstancesSerialize(t *testing.T) {
	schema := newIntegrationSchema(t)
	second := schema.openAnother(t)
	start := make(chan struct{})
	errs := make(chan error, 2)
	var wait sync.WaitGroup
	for _, database := range []*sql.DB{schema.database, second} {
		wait.Add(1)
		go func(database *sql.DB) {
			defer wait.Done()
			<-start
			errs <- ApplyMigrations(database)
		}(database)
	}
	close(start)
	wait.Wait()
	close(errs)
	for err := range errs {
		require.NoError(t, err)
	}

	files, err := loadMigrationFiles()
	require.NoError(t, err)
	var appliedCount, distinctCount int
	require.NoError(t, schema.database.QueryRowContext(
		context.Background(),
		"SELECT COUNT(*), COUNT(DISTINCT version) FROM schema_migrations",
	).Scan(&appliedCount, &distinctCount))
	assert.Equal(t, len(files), appliedCount)
	assert.Equal(t, len(files), distinctCount)
}
