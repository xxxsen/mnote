package testutil

import (
	"database/sql"
	"os"
	"testing"

	"github.com/xxxsen/mnote/internal/config"
	"github.com/xxxsen/mnote/internal/db"
)

func OpenTestDB(t *testing.T) (*sql.DB, func()) {
	t.Helper()
	host := os.Getenv("TEST_DB_HOST")
	if host == "" {
		t.Skip("TEST_DB_HOST not set, skipping postgres test")
	}
	conn, err := db.Open(config.DatabaseConfig{
		Host:     host,
		Port:     5432,
		User:     "mnote",
		Password: "mnote_pass",
		DBName:   "mnote_test",
		SSLMode:  "disable",
	})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.ApplyMigrations(conn); err != nil {
		t.Fatalf("migrations: %v", err)
	}
	return conn, func() {
		_ = conn.Close()
	}
}
