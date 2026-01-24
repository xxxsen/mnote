package handler_test

import (
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"mnote/internal/handler"
	"mnote/internal/repo"
	"mnote/internal/service"
	"mnote/test/testutil"
)

func setupRouter(t *testing.T) (*gin.Engine, func()) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	db, cleanup := testutil.OpenTestDB(t)
	userRepo := repo.NewUserRepo(db)
	docRepo := repo.NewDocumentRepo(db)
	versionRepo := repo.NewVersionRepo(db)
	tagRepo := repo.NewTagRepo(db)
	docTagRepo := repo.NewDocumentTagRepo(db)
	shareRepo := repo.NewShareRepo(db)
	ftsRepo := repo.NewFTSRepo(db)

	jwtSecret := []byte("test-secret")
	authService := service.NewAuthService(userRepo, jwtSecret, time.Hour)
	documentService := service.NewDocumentService(docRepo, versionRepo, docTagRepo, ftsRepo, shareRepo)
	tagService := service.NewTagService(tagRepo, docTagRepo)
	exportService := service.NewExportService(docRepo, versionRepo, tagRepo, docTagRepo)

	router := handler.NewRouter(handler.RouterDeps{
		Auth:      handler.NewAuthHandler(authService),
		Documents: handler.NewDocumentHandler(documentService),
		Versions:  handler.NewVersionHandler(documentService),
		Shares:    handler.NewShareHandler(documentService),
		Tags:      handler.NewTagHandler(tagService),
		Export:    handler.NewExportHandler(exportService),
		JWTSecret: jwtSecret,
	})

	return router, cleanup
}
