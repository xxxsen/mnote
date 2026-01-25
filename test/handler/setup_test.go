package handler_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"github.com/xxxsen/common/webapi"

	"github.com/xxxsen/mnote/internal/handler"
	"github.com/xxxsen/mnote/internal/middleware"
	"github.com/xxxsen/mnote/internal/repo"
	"github.com/xxxsen/mnote/internal/service"
	"github.com/xxxsen/mnote/test/testutil"
)

func setupRouter(t *testing.T) (http.Handler, func()) {
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

	deps := handler.RouterDeps{
		Auth:      handler.NewAuthHandler(authService),
		Documents: handler.NewDocumentHandler(documentService),
		Versions:  handler.NewVersionHandler(documentService),
		Shares:    handler.NewShareHandler(documentService),
		Tags:      handler.NewTagHandler(tagService),
		Export:    handler.NewExportHandler(exportService),
		JWTSecret: jwtSecret,
	}

	engine, err := webapi.NewEngine(
		"/api/v1",
		"",
		webapi.WithRegister(func(group *gin.RouterGroup) {
			handler.RegisterRoutes(group, deps)
		}),
		webapi.WithExtraMiddlewares(
			middleware.RequestID(),
			middleware.CORS(),
		),
	)
	require.NoError(t, err)

	return engine, cleanup
}
