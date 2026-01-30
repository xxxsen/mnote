package testutil

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	"github.com/xxxsen/mnote/internal/db"
)

func OpenTestDB(t *testing.T) (*sql.DB, func()) {
	t.Helper()
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "test.db")
	conn, err := db.Open(dbPath)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.ApplyMigrations(conn); err != nil {
		t.Fatalf("migrations: %v", err)
	}
	return conn, func() {
		_ = conn.Close()
		_ = os.Remove(dbPath)
	}
}
