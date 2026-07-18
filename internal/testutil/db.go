package testutil

import (
	"database/sql"
	"os"
	"strconv"
	"testing"

	"github.com/xxxsen/mnote/internal/db"
)

func envOrDefault(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}

func OpenTestDB(t *testing.T) (*sql.DB, func()) {
	t.Helper()
	host := os.Getenv("TEST_DB_HOST")
	if host == "" {
		t.Skip("TEST_DB_HOST not set, skipping postgres test")
	}
	port, err := strconv.Atoi(envOrDefault("TEST_DB_PORT", "5432"))
	if err != nil || port <= 0 || port > 65535 {
		t.Fatalf("invalid TEST_DB_PORT: %q", os.Getenv("TEST_DB_PORT"))
	}
	conn, err := db.Open(db.Config{
		Host:     host,
		Port:     port,
		User:     envOrDefault("TEST_DB_USER", "mnote"),
		Password: envOrDefault("TEST_DB_PASSWORD", "mnote_pass"),
		DBName:   envOrDefault("TEST_DB_NAME", "mnote_test"),
		SSLMode:  envOrDefault("TEST_DB_SSLMODE", "disable"),
	})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.ApplyMigrations(conn); err != nil {
		_ = conn.Close()
		t.Fatalf("migrations: %v", err)
	}
	return conn, func() {
		_ = conn.Close()
	}
}
