package main

import (
	"log"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"mnote/internal/handler"
	"mnote/internal/repo"
	"mnote/internal/service"
)

func main() {
	dbPath := getEnv("DB_PATH", "./data.db")
	jwtSecret := []byte(getEnv("JWT_SECRET", "dev-secret"))
	port := getEnv("PORT", "8080")
	jwtTTL := getEnvDuration("JWT_TTL_HOURS", 72)

	db, err := repo.Open(dbPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	migrationsDir := filepath.Join(".", "migrations")
	if err := repo.ApplyMigrations(db, migrationsDir); err != nil {
		log.Fatalf("migrations: %v", err)
	}

	userRepo := repo.NewUserRepo(db)
	docRepo := repo.NewDocumentRepo(db)
	versionRepo := repo.NewVersionRepo(db)
	tagRepo := repo.NewTagRepo(db)
	docTagRepo := repo.NewDocumentTagRepo(db)
	shareRepo := repo.NewShareRepo(db)
	ftsRepo := repo.NewFTSRepo(db)

	authService := service.NewAuthService(userRepo, jwtSecret, time.Hour*time.Duration(jwtTTL))
	documentService := service.NewDocumentService(docRepo, versionRepo, docTagRepo, ftsRepo, shareRepo)
	tagService := service.NewTagService(tagRepo, docTagRepo)
	exportService := service.NewExportService(docRepo, versionRepo, tagRepo, docTagRepo)

	authHandler := handler.NewAuthHandler(authService)
	documentHandler := handler.NewDocumentHandler(documentService)
	versionHandler := handler.NewVersionHandler(documentService)
	shareHandler := handler.NewShareHandler(documentService)
	tagHandler := handler.NewTagHandler(tagService)
	exportHandler := handler.NewExportHandler(exportService)

	router := handler.NewRouter(handler.RouterDeps{
		Auth:      authHandler,
		Documents: documentHandler,
		Versions:  versionHandler,
		Shares:    shareHandler,
		Tags:      tagHandler,
		Export:    exportHandler,
		JWTSecret: jwtSecret,
	})

	if err := router.Run("0.0.0.0:" + port); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func getEnvDuration(key string, fallbackHours int) int {
	if value := os.Getenv(key); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil && parsed > 0 {
			return parsed
		}
	}
	return fallbackHours
}
