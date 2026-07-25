//go:build integration

package testutil

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"os"
	"strconv"
	"testing"

	"github.com/lib/pq"

	"github.com/xxxsen/mnote/internal/db"
)

const integrationExtensionLockKey int64 = 6_202_607_251

func envOrDefault(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}

func ensureIntegrationExtensions(t *testing.T, admin *sql.DB) {
	t.Helper()
	ctx := context.Background()
	connection, err := admin.Conn(ctx)
	if err != nil {
		t.Fatalf("open integration extension connection: %v", err)
	}
	defer func() { _ = connection.Close() }()

	if _, err := connection.ExecContext(
		ctx, "SELECT pg_advisory_lock($1)", integrationExtensionLockKey,
	); err != nil {
		t.Fatalf("lock integration extension setup: %v", err)
	}
	defer func() {
		if _, err := connection.ExecContext(
			ctx, "SELECT pg_advisory_unlock($1)", integrationExtensionLockKey,
		); err != nil {
			t.Errorf("unlock integration extension setup: %v", err)
		}
	}()

	for _, extension := range []string{"vector", "pgcrypto"} {
		query := "CREATE EXTENSION IF NOT EXISTS " +
			pq.QuoteIdentifier(extension) + " WITH SCHEMA public"
		if _, err := connection.ExecContext(ctx, query); err != nil {
			t.Fatalf("install integration extension %s: %v", extension, err)
		}
	}
}

func OpenTestDB(t *testing.T) (*sql.DB, func()) {
	t.Helper()
	host := os.Getenv("TEST_DB_HOST")
	if host == "" {
		t.Fatal("TEST_DB_HOST is required for integration tests")
	}
	port, err := strconv.Atoi(envOrDefault("TEST_DB_PORT", "5432"))
	if err != nil || port <= 0 || port > 65535 {
		t.Fatalf("invalid TEST_DB_PORT: %q", os.Getenv("TEST_DB_PORT"))
	}
	cfg := db.Config{
		Host:     host,
		Port:     port,
		User:     envOrDefault("TEST_DB_USER", "mnote"),
		Password: envOrDefault("TEST_DB_PASSWORD", "mnote_pass"),
		DBName:   envOrDefault("TEST_DB_NAME", "mnote_test"),
		SSLMode:  envOrDefault("TEST_DB_SSLMODE", "disable"),
	}
	admin, err := db.Open(context.Background(), cfg)
	if err != nil {
		t.Fatalf("open integration admin db: %v", err)
	}
	ensureIntegrationExtensions(t, admin)

	random := make([]byte, 12)
	if _, err := rand.Read(random); err != nil {
		_ = admin.Close()
		t.Fatalf("generate integration schema name: %v", err)
	}
	schema := "mnote_test_" + hex.EncodeToString(random)
	if _, err := admin.ExecContext(
		context.Background(),
		"CREATE SCHEMA "+pq.QuoteIdentifier(schema),
	); err != nil {
		_ = admin.Close()
		t.Fatalf("create integration schema %s: %v", schema, err)
	}

	cfg.DSN = fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s "+
			"options='-c search_path=%s,public'",
		cfg.Host,
		cfg.Port,
		cfg.User,
		cfg.Password,
		cfg.DBName,
		cfg.SSLMode,
		schema,
	)
	conn, err := db.Open(context.Background(), cfg)
	if err != nil {
		_, _ = admin.ExecContext(
			context.Background(),
			"DROP SCHEMA "+pq.QuoteIdentifier(schema)+" CASCADE",
		)
		_ = admin.Close()
		t.Fatalf("open isolated integration db: %v", err)
	}
	if err := db.ApplyMigrations(conn); err != nil {
		_ = conn.Close()
		_, _ = admin.ExecContext(
			context.Background(),
			"DROP SCHEMA "+pq.QuoteIdentifier(schema)+" CASCADE",
		)
		_ = admin.Close()
		t.Fatalf("migrations: %v", err)
	}
	return conn, func() {
		_ = conn.Close()
		_, _ = admin.ExecContext(
			context.Background(),
			"DROP SCHEMA "+pq.QuoteIdentifier(schema)+" CASCADE",
		)
		_ = admin.Close()
	}
}
