package main

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"
	"github.com/spf13/cobra"
	"github.com/xxxsen/common/logger"
	"github.com/xxxsen/common/logutil"
	"github.com/xxxsen/common/webapi"
	"go.uber.org/zap"

	"github.com/xxxsen/mnote/internal/ai"
	"github.com/xxxsen/mnote/internal/config"
	"github.com/xxxsen/mnote/internal/filestore"
	"github.com/xxxsen/mnote/internal/handler"
	"github.com/xxxsen/mnote/internal/middleware"
	"github.com/xxxsen/mnote/internal/oauth"
	"github.com/xxxsen/mnote/internal/repo"
	"github.com/xxxsen/mnote/internal/service"
)

func main() {
	var configPath string

	rootCmd := &cobra.Command{
		Use:   "mnote",
		Short: "mnote backend server",
	}

	runCmd := &cobra.Command{
		Use:   "run",
		Short: "run mnote server",
		RunE: func(cmd *cobra.Command, args []string) error {
			if configPath == "" {
				return fmt.Errorf("--config is required")
			}
			cfg, err := config.Load(configPath)
			if err != nil {
				return err
			}
			logger.Init(
				cfg.LogConfig.File,
				cfg.LogConfig.Level,
				int(cfg.LogConfig.FileCount),
				int(cfg.LogConfig.FileSize),
				int(cfg.LogConfig.KeepDays),
				cfg.LogConfig.Console,
			)
			logutil.GetLogger(context.Background()).Info("config loaded", zap.String("config", configPath))

			db, err := repo.Open(cfg.DBPath)
			if err != nil {
				return fmt.Errorf("open db: %w", err)
			}
			if err := repo.ApplyMigrations(db); err != nil {
				return fmt.Errorf("migrations: %w", err)
			}
			return runServer(cfg, db)
		},
	}

	runCmd.Flags().StringVar(&configPath, "config", "", "path to config.json")
	rootCmd.AddCommand(runCmd)

	if err := rootCmd.Execute(); err != nil {
		logutil.GetLogger(context.Background()).Fatal("startup error", zap.Error(err))
	}
}

func runServer(cfg *config.Config, db *sql.DB) error {
	logutil.GetLogger(context.Background()).Info(
		"starting server",
		zap.Int("port", cfg.Port),
		zap.String("db_path", cfg.DBPath),
		zap.String("file_store", cfg.FileStore.Type),
	)

	userRepo := repo.NewUserRepo(db)
	docRepo := repo.NewDocumentRepo(db)
	versionRepo := repo.NewVersionRepo(db)
	oauthRepo := repo.NewOAuthRepo(db)
	emailCodeRepo := repo.NewEmailVerificationRepo(db)
	tagRepo := repo.NewTagRepo(db)
	docTagRepo := repo.NewDocumentTagRepo(db)
	shareRepo := repo.NewShareRepo(db)

	mailSender := service.NewEmailSender(cfg.Mail)
	verifyService := service.NewEmailVerificationService(emailCodeRepo, mailSender)
	allowRegister := cfg.Properties.EnableUserRegister
	authService := service.NewAuthService(userRepo, verifyService, []byte(cfg.JWTSecret), time.Hour*time.Duration(cfg.JWTTTLHours), allowRegister)
	oauthProviders := map[string]oauth.Provider{}
	client := &http.Client{Timeout: 10 * time.Second}
	if cfg.Properties.EnableGithubOauth {
		provider, err := oauth.NewProvider("github", oauth.ProviderArgs{Config: oauth.ProviderConfig{
			ClientID:     cfg.OAuth.Github.ClientID,
			ClientSecret: cfg.OAuth.Github.ClientSecret,
			RedirectURL:  cfg.OAuth.Github.RedirectURL,
			Scopes:       cfg.OAuth.Github.Scopes,
		}, Client: client})
		if err == nil {
			oauthProviders["github"] = provider
		}
	}
	if cfg.Properties.EnableGoogleOauth {
		provider, err := oauth.NewProvider("google", oauth.ProviderArgs{Config: oauth.ProviderConfig{
			ClientID:     cfg.OAuth.Google.ClientID,
			ClientSecret: cfg.OAuth.Google.ClientSecret,
			RedirectURL:  cfg.OAuth.Google.RedirectURL,
			Scopes:       cfg.OAuth.Google.Scopes,
		}, Client: client})
		if err == nil {
			oauthProviders["google"] = provider
		}
	}
	oauthService := service.NewOAuthService(userRepo, oauthRepo, []byte(cfg.JWTSecret), time.Hour*time.Duration(cfg.JWTTTLHours), oauthProviders)
	documentService := service.NewDocumentService(docRepo, versionRepo, docTagRepo, shareRepo, tagRepo, userRepo, cfg.VersionMaxKeep)
	tagService := service.NewTagService(tagRepo, docTagRepo)
	exportService := service.NewExportService(docRepo, versionRepo, tagRepo, docTagRepo)
	providerArgs := cfg.AI.Data
	if providerArgs == nil {
		providerArgs = cfg.AI
	}
	aiProvider, err := ai.NewProvider(cfg.AI.Provider, providerArgs)
	if err != nil {
		return fmt.Errorf("init ai provider: %w", err)
	}
	aiService := service.NewAIService(aiProvider, cfg.AI.Model, cfg.AI.MaxInputChars, cfg.AI.Timeout)
	importService := service.NewImportService(documentService, tagService)

	authHandler := handler.NewAuthHandler(authService)
	oauthHandler := handler.NewOAuthHandler(oauthService)
	documentHandler := handler.NewDocumentHandler(documentService)
	versionHandler := handler.NewVersionHandler(documentService)
	shareHandler := handler.NewShareHandler(documentService)
	tagHandler := handler.NewTagHandler(tagService)
	exportHandler := handler.NewExportHandler(exportService)
	aiHandler := handler.NewAIHandler(aiService, documentService, tagService)
	importHandler := handler.NewImportHandler(importService)
	store, err := filestore.New(cfg.FileStore)
	if err != nil {
		return fmt.Errorf("init file store: %w", err)
	}
	fileHandler := handler.NewFileHandler(store)

	deps := handler.RouterDeps{
		Auth:       authHandler,
		OAuth:      oauthHandler,
		Properties: handler.NewPropertiesHandler(cfg.Properties),
		Documents:  documentHandler,
		Versions:   versionHandler,
		Shares:     shareHandler,
		Tags:       tagHandler,
		Export:     exportHandler,
		Files:      fileHandler,
		AI:         aiHandler,
		Import:     importHandler,
		JWTSecret:  []byte(cfg.JWTSecret),
	}

	engine, err := webapi.NewEngine(
		"/api/v1",
		fmt.Sprintf("0.0.0.0:%d", cfg.Port),
		webapi.WithRegister(func(group *gin.RouterGroup) {
			handler.RegisterRoutes(group, deps)
		}),
		webapi.WithExtraMiddlewares(
			middleware.CORS(),
			gzip.Gzip(gzip.DefaultCompression),
		),
	)
	if err != nil {
		return fmt.Errorf("init web engine: %w", err)
	}
	logutil.GetLogger(context.Background()).Info("http server listening", zap.String("addr", fmt.Sprintf("0.0.0.0:%d", cfg.Port)))

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		if err := engine.Run(); err != nil && err != http.ErrServerClosed {
			logutil.GetLogger(context.Background()).Error("server error", zap.Error(err))
		}
	}()

	<-ctx.Done()
	logutil.GetLogger(context.Background()).Info("server stopping...")
	return nil
}
