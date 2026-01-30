package handler_test

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"github.com/xxxsen/common/webapi"

	"github.com/xxxsen/mnote/internal/config"
	"github.com/xxxsen/mnote/internal/filestore"
	"github.com/xxxsen/mnote/internal/handler"
	"github.com/xxxsen/mnote/internal/middleware"
	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/oauth"
	"github.com/xxxsen/mnote/internal/pkg/password"
	"github.com/xxxsen/mnote/internal/pkg/timeutil"
	"github.com/xxxsen/mnote/internal/repo"
	"github.com/xxxsen/mnote/internal/service"
	"github.com/xxxsen/mnote/test/testutil"
)

type noopSender struct{}

func (noopSender) Send(to, subject, body string) error {
	return nil
}

func newTestID() string {
	buf := make([]byte, 16)
	_, _ = rand.Read(buf)
	return hex.EncodeToString(buf)
}

func setupRouter(t *testing.T) (http.Handler, func(), func(email, code string) error) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	db, cleanup := testutil.OpenTestDB(t)
	userRepo := repo.NewUserRepo(db)
	docRepo := repo.NewDocumentRepo(db)
	versionRepo := repo.NewVersionRepo(db)
	oauthRepo := repo.NewOAuthRepo(db)
	emailCodeRepo := repo.NewEmailVerificationRepo(db)
	tagRepo := repo.NewTagRepo(db)
	docTagRepo := repo.NewDocumentTagRepo(db)
	shareRepo := repo.NewShareRepo(db)

	jwtSecret := []byte("test-secret")
	verifyService := service.NewEmailVerificationService(emailCodeRepo, noopSender{})
	authService := service.NewAuthService(userRepo, verifyService, jwtSecret, time.Hour, true)
	oauthService := service.NewOAuthService(userRepo, oauthRepo, jwtSecret, time.Hour, map[string]oauth.Provider{})
	documentService := service.NewDocumentService(docRepo, versionRepo, docTagRepo, shareRepo, tagRepo, userRepo, 10)
	tagService := service.NewTagService(tagRepo, docTagRepo)
	exportService := service.NewExportService(docRepo, versionRepo, tagRepo, docTagRepo)

	tmpDir, err := os.MkdirTemp("", "mnote-upload-*")
	require.NoError(t, err)

	store, err := filestore.New(config.FileStoreConfig{
		Type: "local",
		Data: map[string]interface{}{
			"dir": tmpDir,
		},
	})
	require.NoError(t, err)

	deps := handler.RouterDeps{
		Auth:       handler.NewAuthHandler(authService),
		OAuth:      handler.NewOAuthHandler(oauthService),
		Properties: handler.NewPropertiesHandler(config.Properties{}),
		Documents:  handler.NewDocumentHandler(documentService),
		Versions:   handler.NewVersionHandler(documentService),
		Shares:     handler.NewShareHandler(documentService),
		Tags:       handler.NewTagHandler(tagService),
		Export:     handler.NewExportHandler(exportService),
		Files:      handler.NewFileHandler(store, 20*1024*1024),
		JWTSecret:  jwtSecret,
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

	seed := func(email, code string) error {
		hash, err := password.Hash(code)
		if err != nil {
			return err
		}
		now := timeutil.NowUnix()
		return emailCodeRepo.Create(context.Background(), &model.EmailVerificationCode{
			ID:        newTestID(),
			Email:     email,
			Purpose:   "register",
			CodeHash:  hash,
			Used:      0,
			Ctime:     now,
			ExpiresAt: now + 600,
		})
	}

	return engine, func() {
		cleanup()
		_ = os.RemoveAll(tmpDir)
	}, seed
}
