package testutil

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	"github.com/xxxsen/mnote/internal/repo"
)

func OpenTestDB(t *testing.T) (*sql.DB, func()) {
	t.Helper()
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "test.db")
	db, err := repo.Open(dbPath)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := repo.ApplyMigrations(db); err != nil {
		t.Fatalf("migrations: %v", err)
	}
	return db, func() {
		_ = db.Close()
		_ = os.Remove(dbPath)
	}
}
