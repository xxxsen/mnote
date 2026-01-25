package main

import (
	"context"
	"fmt"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/spf13/cobra"
	"github.com/xxxsen/common/logger"
	"github.com/xxxsen/common/logutil"
	"github.com/xxxsen/common/webapi"
	"go.uber.org/zap"

	"github.com/xxxsen/mnote/internal/config"
	"github.com/xxxsen/mnote/internal/filestore"
	"github.com/xxxsen/mnote/internal/handler"
	"github.com/xxxsen/mnote/internal/middleware"
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
			return runServer(cfg)
		},
	}

	runCmd.Flags().StringVar(&configPath, "config", "", "path to config.json")
	rootCmd.AddCommand(runCmd)

	if err := rootCmd.Execute(); err != nil {
		logutil.GetLogger(context.Background()).Fatal("startup error", zap.Error(err))
	}
}

func runServer(cfg *config.Config) error {
	logutil.GetLogger(context.Background()).Info(
		"starting server",
		zap.Int("port", cfg.Port),
		zap.String("db_path", cfg.DBPath),
		zap.String("file_store", cfg.FileStore.Type),
	)
	db, err := repo.Open(cfg.DBPath)
	if err != nil {
		return fmt.Errorf("open db: %w", err)
	}
	logutil.GetLogger(context.Background()).Info("db opened")
	migrationsDir := filepath.Join(".", "migrations")
	if err := repo.ApplyMigrations(db, migrationsDir); err != nil {
		return fmt.Errorf("migrations: %w", err)
	}
	logutil.GetLogger(context.Background()).Info("migrations applied", zap.String("dir", migrationsDir))

	userRepo := repo.NewUserRepo(db)
	docRepo := repo.NewDocumentRepo(db)
	versionRepo := repo.NewVersionRepo(db)
	tagRepo := repo.NewTagRepo(db)
	docTagRepo := repo.NewDocumentTagRepo(db)
	shareRepo := repo.NewShareRepo(db)
	ftsRepo := repo.NewFTSRepo(db)

	authService := service.NewAuthService(userRepo, []byte(cfg.JWTSecret), time.Hour*time.Duration(cfg.JWTTTLHours))
	documentService := service.NewDocumentService(docRepo, versionRepo, docTagRepo, ftsRepo, shareRepo)
	tagService := service.NewTagService(tagRepo, docTagRepo)
	exportService := service.NewExportService(docRepo, versionRepo, tagRepo, docTagRepo)

	authHandler := handler.NewAuthHandler(authService)
	documentHandler := handler.NewDocumentHandler(documentService)
	versionHandler := handler.NewVersionHandler(documentService)
	shareHandler := handler.NewShareHandler(documentService)
	tagHandler := handler.NewTagHandler(tagService)
	exportHandler := handler.NewExportHandler(exportService)
	store, err := filestore.New(cfg.FileStore)
	if err != nil {
		return fmt.Errorf("init file store: %w", err)
	}
	fileHandler := handler.NewFileHandler(store)

	deps := handler.RouterDeps{
		Auth:      authHandler,
		Documents: documentHandler,
		Versions:  versionHandler,
		Shares:    shareHandler,
		Tags:      tagHandler,
		Export:    exportHandler,
		Files:     fileHandler,
		JWTSecret: []byte(cfg.JWTSecret),
	}

	engine, err := webapi.NewEngine(
		"/api/v1",
		fmt.Sprintf("0.0.0.0:%d", cfg.Port),
		webapi.WithRegister(func(group *gin.RouterGroup) {
			handler.RegisterRoutes(group, deps)
		}),
		webapi.WithExtraMiddlewares(
			middleware.CORS(),
		),
	)
	if err != nil {
		return fmt.Errorf("init web engine: %w", err)
	}
	logutil.GetLogger(context.Background()).Info("http server listening", zap.String("addr", fmt.Sprintf("0.0.0.0:%d", cfg.Port)))

	if err := engine.Run(); err != nil {
		return fmt.Errorf("server error: %w", err)
	}
	return nil
}
