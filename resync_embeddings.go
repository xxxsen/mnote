package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/xxxsen/mnote/internal/ai"
	"github.com/xxxsen/mnote/internal/config"
	"github.com/xxxsen/mnote/internal/repo"
	"github.com/xxxsen/mnote/internal/service"
	_ "modernc.org/sqlite"
)

func main() {
	if len(os.Args) < 2 {
		log.Fatal("Usage: go run resync_embeddings.go <config_path>")
	}
	cfgPath := os.Args[1]
	cfg, err := config.Load(cfgPath)
	if err != nil {
		log.Fatal(err)
	}

	db, err := sql.Open("sqlite3", cfg.DBPath)
	if err != nil {
		log.Fatal(err)
	}

	embeddingRepo := repo.NewEmbeddingRepo(db)

	providerArgs := cfg.AI.Data
	if providerArgs == nil {
		providerArgs = cfg.AI
	}
	aiProvider, err := ai.NewProvider(cfg.AI.Provider, providerArgs)
	if err != nil {
		log.Fatal(err)
	}
	aiService := service.NewAIService(aiProvider, embeddingRepo, cfg.AI.Model, "gemini-embedding-001", cfg.AI.MaxInputChars, cfg.AI.Timeout)

	ctx := context.Background()
	// Get all documents
	rows, err := db.QueryContext(ctx, "SELECT id, user_id, title, content FROM documents")
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		var id, userID, title, content string
		if err := rows.Scan(&id, &userID, &title, &content); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("Syncing [%d] %s (%s)...\n", count, title, id)
		if err := aiService.SyncEmbedding(ctx, userID, id, title, content); err != nil {
			fmt.Printf("  Error: %v\n", err)
		}
		count++
		time.Sleep(200 * time.Millisecond) // Avoid rate limit
	}
	fmt.Printf("Done. Synced %d documents.\n", count)
}
