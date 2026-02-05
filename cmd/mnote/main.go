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
	"github.com/xxxsen/mnote/internal/db"
	"github.com/xxxsen/mnote/internal/embedcache"
	"github.com/xxxsen/mnote/internal/filestore"
	"github.com/xxxsen/mnote/internal/handler"
	"github.com/xxxsen/mnote/internal/job"
	"github.com/xxxsen/mnote/internal/middleware"
	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/oauth"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/password"
	"github.com/xxxsen/mnote/internal/repo"
	"github.com/xxxsen/mnote/internal/schedule"
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

			conn, err := db.Open(cfg.Database)
			if err != nil {
				return fmt.Errorf("open db: %w", err)
			}
			if err := db.ApplyMigrations(conn); err != nil {
				return fmt.Errorf("migrations: %w", err)
			}
			return runServer(cfg, conn)
		},
	}

	runCmd.Flags().StringVar(&configPath, "config", "", "path to config.json")
	rootCmd.AddCommand(runCmd)

	if err := rootCmd.Execute(); err != nil {
		logutil.GetLogger(context.Background()).Fatal("startup error", zap.Error(err))
	}
}

func injectTestUser(ctx context.Context, r *repo.UserRepo) error {
	email := "test@test.com"
	_, err := r.GetByEmail(ctx, email)
	if err == nil {
		return nil
	}
	if err != appErr.ErrNotFound {
		return err
	}
	hash, err := password.Hash("test")
	if err != nil {
		return err
	}
	user := &model.User{
		ID:           "test_user",
		Email:        email,
		PasswordHash: hash,
		Ctime:        time.Now().Unix(),
		Mtime:        time.Now().Unix(),
	}
	return r.Create(ctx, user)
}

func runServer(cfg *config.Config, db *sql.DB) error {
	logutil.GetLogger(context.Background()).Info(
		"starting server",
		zap.Int("port", cfg.Port),
		zap.String("db_host", cfg.Database.Host),
		zap.String("file_store", cfg.FileStore.Type),
	)

	userRepo := repo.NewUserRepo(db)
	if cfg.Properties.EnableTestMode {
		if err := injectTestUser(context.Background(), userRepo); err != nil {
			logutil.GetLogger(context.Background()).Fatal("failed to inject test user", zap.Error(err))
		}
		logutil.GetLogger(context.Background()).Info("test mode enabled, test user injected")
	}
	docRepo := repo.NewDocumentRepo(db)
	summaryRepo := repo.NewDocumentSummaryRepo(db)
	versionRepo := repo.NewVersionRepo(db)
	oauthRepo := repo.NewOAuthRepo(db)
	emailCodeRepo := repo.NewEmailVerificationRepo(db)
	tagRepo := repo.NewTagRepo(db)
	docTagRepo := repo.NewDocumentTagRepo(db)
	shareRepo := repo.NewShareRepo(db)
	embeddingRepo := repo.NewEmbeddingRepo(db)
	embeddingCacheRepo := repo.NewEmbeddingCacheRepo(db)
	importJobRepo := repo.NewImportJobRepo(db)
	importJobNoteRepo := repo.NewImportJobNoteRepo(db)

	mailSender := service.NewEmailSender(cfg.Mail)
	verifyService := service.NewEmailVerificationService(emailCodeRepo, mailSender)
	allowRegister := cfg.Properties.EnableUserRegister && cfg.Properties.EnableEmailRegister
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
		if err != nil {
			return fmt.Errorf("init github oauth provider: %w", err)
		}
		oauthProviders["github"] = provider
	}
	if cfg.Properties.EnableGoogleOauth {
		provider, err := oauth.NewProvider("google", oauth.ProviderArgs{Config: oauth.ProviderConfig{
			ClientID:     cfg.OAuth.Google.ClientID,
			ClientSecret: cfg.OAuth.Google.ClientSecret,
			RedirectURL:  cfg.OAuth.Google.RedirectURL,
			Scopes:       cfg.OAuth.Google.Scopes,
		}, Client: client})
		if err != nil {
			return fmt.Errorf("init google oauth provider: %w", err)
		}
		oauthProviders["google"] = provider
	}
	oauthService := service.NewOAuthService(userRepo, oauthRepo, []byte(cfg.JWTSecret), time.Hour*time.Duration(cfg.JWTTTLHours), oauthProviders)

	aiProviders := make(map[string]ai.IProvider)
	providerNames := make(map[string]struct{})
	for _, pcfg := range cfg.AIProvider {
		name := pcfg.Name
		if name == "" {
			return fmt.Errorf("ai provider name is required")
		}
		if _, exists := providerNames[name]; exists {
			return fmt.Errorf("ai provider name duplicated: %s", name)
		}
		providerNames[name] = struct{}{}
		logutil.GetLogger(context.Background()).Info("init ai provider", zap.String("name", name), zap.String("type", pcfg.Type))
		p, err := ai.NewProvider(pcfg.Type, pcfg.Data)
		if err != nil {
			return fmt.Errorf("init ai provider %s: %w", name, err)
		}
		aiProviders[name] = p
	}

	normalizeFeatureList := func(list []config.AIFeatureConfig) []config.AIFeatureConfig {
		if len(list) == 0 {
			return []config.AIFeatureConfig{{Provider: cfg.AI.Provider, Model: cfg.AI.Model}}
		}
		result := make([]config.AIFeatureConfig, 0, len(list))
		for _, item := range list {
			result = append(result, item.WithDefaults(cfg.AI))
		}
		return result
	}

	getGen := func(name string, list []config.AIFeatureConfig) (ai.IGenerator, error) {
		items := normalizeFeatureList(list)
		if len(items) == 0 {
			return nil, fmt.Errorf("ai feature %s: provider or model not configured", name)
		}
		entries := make([]ai.GeneratorEntry, 0, len(items))
		for _, f := range items {
			if f.Provider == "" || f.Model == "" {
				return nil, fmt.Errorf("ai feature %s: provider or model not configured", name)
			}
			p, ok := aiProviders[f.Provider]
			if !ok {
				return nil, fmt.Errorf("ai feature %s: provider %s not found or incompatible (type: generator)", name, f.Provider)
			}
			logutil.GetLogger(context.Background()).Info("ai feature init", zap.String("feature", name), zap.String("provider", f.Provider), zap.String("model", f.Model))
			entries = append(entries, ai.GeneratorEntry{
				Name:      fmt.Sprintf("%s/%s", f.Provider, f.Model),
				Generator: ai.NewGenerator(p, f.Model),
			})
		}
		return ai.NewGroupGenerator(entries), nil
	}
	getEmb := func(name string, list []config.AIFeatureConfig) (ai.IEmbedder, error) {
		items := normalizeFeatureList(list)
		if len(items) == 0 {
			return nil, fmt.Errorf("ai feature %s: provider or model not configured", name)
		}
		entries := make([]ai.EmbedderEntry, 0, len(items))
		for _, f := range items {
			if f.Provider == "" || f.Model == "" {
				return nil, fmt.Errorf("ai feature %s: provider or model not configured", name)
			}
			p, ok := aiProviders[f.Provider]
			if !ok {
				return nil, fmt.Errorf("ai feature %s: provider %s not found", name, f.Provider)
			}
			logutil.GetLogger(context.Background()).Info("ai feature init", zap.String("feature", name), zap.String("provider", f.Provider), zap.String("model", f.Model))
			entries = append(entries, ai.EmbedderEntry{
				Name:     fmt.Sprintf("%s/%s", f.Provider, f.Model),
				Embedder: ai.NewEmbedder(p, f.Model),
			})
		}
		return ai.NewGroupEmbedder(entries), nil
	}

	polishGen, err := getGen("polish", cfg.AI.Polish)
	if err != nil {
		return err
	}
	genGen, err := getGen("generate", cfg.AI.Generate)
	if err != nil {
		return err
	}
	tagGen, err := getGen("tagging", cfg.AI.Tagging)
	if err != nil {
		return err
	}
	sumGen, err := getGen("summary", cfg.AI.Summary)
	if err != nil {
		return err
	}
	embGen, err := getEmb("embed", cfg.AI.Embed)
	if err != nil {
		return err
	}
	embGen = embedcache.WrapDBCacheToEmbedder(embGen, embeddingCacheRepo)
	embGen = embedcache.WrapLruCacheToEmbedder(embGen, 20000, 2*time.Hour)

	aiManager := ai.NewManager(
		polishGen,
		genGen,
		tagGen,
		sumGen,
		embGen,
		ai.ManagerConfig{
			Timeout:       cfg.AI.Timeout,
			MaxInputChars: cfg.AI.MaxInputChars,
		},
	)

	aiService := service.NewAIService(aiManager, embeddingRepo)
	documentService := service.NewDocumentService(docRepo, summaryRepo, versionRepo, docTagRepo, shareRepo, tagRepo, userRepo, aiService, cfg.VersionMaxKeep)

	tagService := service.NewTagService(tagRepo, docTagRepo)
	exportService := service.NewExportService(docRepo, summaryRepo, versionRepo, tagRepo, docTagRepo)
	importService := service.NewImportService(documentService, tagService, importJobRepo, importJobNoteRepo)

	authHandler := handler.NewAuthHandler(authService)
	oauthHandler := handler.NewOAuthHandler(oauthService)
	documentHandler := handler.NewDocumentHandler(documentService)
	versionHandler := handler.NewVersionHandler(documentService)
	shareHandler := handler.NewShareHandler(documentService)
	tagHandler := handler.NewTagHandler(tagService)
	exportHandler := handler.NewExportHandler(exportService)
	aiHandler := handler.NewAIHandler(aiService, documentService, tagService)
	importHandler := handler.NewImportHandler(importService, cfg.MaxUploadSize)
	store, err := filestore.New(cfg.FileStore)
	if err != nil {
		return fmt.Errorf("init file store: %w", err)
	}
	fileHandler := handler.NewFileHandler(store, cfg.MaxUploadSize)

	deps := handler.RouterDeps{
		Auth:       authHandler,
		OAuth:      oauthHandler,
		Properties: handler.NewPropertiesHandler(cfg.Properties, cfg.Banner),
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

	scheduler := schedule.NewCronScheduler()
	cronEveryMinute := "*/1 * * * *"
	cronEveryHour := "0 * * * *"
	cronEveryDay := "0 3 * * *"
	if err := scheduler.AddJob(job.NewAIEmbeddingJob(aiService, cfg.AIJob.EmbeddingDelaySeconds), cronEveryMinute); err != nil {
		return fmt.Errorf("schedule ai_embedding: %w", err)
	}
	if err := scheduler.AddJob(job.NewAISummaryJob(documentService, cfg.AIJob.SummaryDelaySeconds), cronEveryMinute); err != nil {
		return fmt.Errorf("schedule ai_summary: %w", err)
	}
	if err := scheduler.AddJob(job.NewEmbeddingCacheCleanupJob(embeddingCacheRepo, 30), cronEveryDay); err != nil {
		return fmt.Errorf("schedule embedding cache cleanup: %w", err)
	}
	if err := scheduler.AddJob(job.NewImportCleanupJob(importJobRepo, importJobNoteRepo, 24*time.Hour), cronEveryHour); err != nil {
		return fmt.Errorf("schedule import cleanup: %w", err)
	}
	scheduler.Start(ctx)
	defer scheduler.Stop()

	go func() {
		if err := engine.Run(); err != nil && err != http.ErrServerClosed {
			logutil.GetLogger(context.Background()).Error("server error", zap.Error(err))
		}
	}()

	<-ctx.Done()
	logutil.GetLogger(context.Background()).Info("server stopping...")
	return nil
}
