package main

import (
	"context"
	"database/sql"
	"errors"
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

	"github.com/xxxsen/mnote/internal/pkg/safeconv"

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
		RunE: func(_ *cobra.Command, _ []string) error {
			if configPath == "" {
				return errors.New("--config is required")
			}
			cfg, err := config.Load(configPath)
			if err != nil {
				return fmt.Errorf("load config: %w", err)
			}
			logger.Init(
				cfg.LogConfig.File,
				cfg.LogConfig.Level,
				safeconv.Uint64ToInt(cfg.LogConfig.FileCount),
				safeconv.Uint64ToInt(cfg.LogConfig.FileSize),
				safeconv.Uint32ToInt(cfg.LogConfig.KeepDays),
				cfg.LogConfig.Console,
			)
			logutil.GetLogger(context.Background()).Info("config loaded", zap.String("config", configPath))

			conn, err := db.Open(db.Config{
				DSN:      cfg.Database.DSN,
				Host:     cfg.Database.Host,
				Port:     cfg.Database.Port,
				User:     cfg.Database.User,
				Password: cfg.Database.Password,
				DBName:   cfg.Database.DBName,
				SSLMode:  cfg.Database.SSLMode,
			})
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
	if !errors.Is(err, appErr.ErrNotFound) {
		return fmt.Errorf("lookup test user: %w", err)
	}
	hash, err := password.Hash("test")
	if err != nil {
		return fmt.Errorf("hash test password: %w", err)
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

func initOAuthProviders(cfg *config.Config) (map[string]oauth.Provider, error) {
	providers := map[string]oauth.Provider{}
	client := &http.Client{Timeout: 10 * time.Second}
	type oauthEntry struct {
		name    string
		enabled bool
		config  oauth.ProviderConfig
	}
	entries := []oauthEntry{
		{"github", cfg.Properties.EnableGithubOauth, oauth.ProviderConfig{
			ClientID: cfg.OAuth.Github.ClientID, ClientSecret: cfg.OAuth.Github.ClientSecret,
			RedirectURL: cfg.OAuth.Github.RedirectURL, Scopes: cfg.OAuth.Github.Scopes,
		}},
		{"google", cfg.Properties.EnableGoogleOauth, oauth.ProviderConfig{
			ClientID: cfg.OAuth.Google.ClientID, ClientSecret: cfg.OAuth.Google.ClientSecret,
			RedirectURL: cfg.OAuth.Google.RedirectURL, Scopes: cfg.OAuth.Google.Scopes,
		}},
	}
	for _, e := range entries {
		if !e.enabled {
			continue
		}
		p, err := oauth.NewProvider(e.name, oauth.ProviderArgs{Config: e.config, Client: client})
		if err != nil {
			return nil, fmt.Errorf("init %s oauth: %w", e.name, err)
		}
		providers[e.name] = p
	}
	return providers, nil
}

func initAIProviders(cfgs []config.AIProviderConfig) (map[string]ai.IProvider, error) {
	providers := make(map[string]ai.IProvider)
	seen := make(map[string]struct{})
	for _, pcfg := range cfgs {
		if pcfg.Name == "" {
			return nil, errors.New("ai provider name is required")
		}
		if _, exists := seen[pcfg.Name]; exists {
			return nil, fmt.Errorf("ai provider name duplicated: %s", pcfg.Name)
		}
		seen[pcfg.Name] = struct{}{}
		logutil.GetLogger(context.Background()).Info(
			"init ai provider", zap.String("name", pcfg.Name), zap.String("type", pcfg.Type),
		)
		p, err := ai.NewProvider(pcfg.Type, pcfg.Data)
		if err != nil {
			return nil, fmt.Errorf("init ai provider %s: %w", pcfg.Name, err)
		}
		providers[pcfg.Name] = p
	}
	return providers, nil
}

func normalizeFeatureList(
	list []config.AIFeatureConfig, defaults config.AIConfig,
) []config.AIFeatureConfig {
	if len(list) == 0 {
		return []config.AIFeatureConfig{{Provider: defaults.Provider, Model: defaults.Model}}
	}
	result := make([]config.AIFeatureConfig, 0, len(list))
	for _, item := range list {
		result = append(result, item.WithDefaults(defaults))
	}
	return result
}

func resolveAIFeature(
	name string, list []config.AIFeatureConfig,
	defaults config.AIConfig, providers map[string]ai.IProvider,
) ([]ai.IProvider, []string, error) {
	items := normalizeFeatureList(list, defaults)
	resolved := make([]ai.IProvider, 0, len(items))
	models := make([]string, 0, len(items))
	for _, f := range items {
		if f.Provider == "" || f.Model == "" {
			return nil, nil, fmt.Errorf(
				"ai feature %s: provider or model not configured", name,
			)
		}
		p, ok := providers[f.Provider]
		if !ok {
			return nil, nil, fmt.Errorf(
				"ai feature %s: provider %s not found", name, f.Provider,
			)
		}
		logutil.GetLogger(context.Background()).Info(
			"ai feature init",
			zap.String("feature", name),
			zap.String("provider", f.Provider),
			zap.String("model", f.Model),
		)
		resolved = append(resolved, p)
		models = append(models, f.Model)
	}
	return resolved, models, nil
}

func buildGenerator(
	name string, list []config.AIFeatureConfig,
	defaults config.AIConfig, providers map[string]ai.IProvider,
) (ai.IGenerator, error) {
	pp, models, err := resolveAIFeature(name, list, defaults, providers)
	if err != nil {
		return nil, err
	}
	entries := make([]ai.GeneratorEntry, 0, len(pp))
	for i, p := range pp {
		entries = append(entries, ai.GeneratorEntry{
			Name:      fmt.Sprintf("%s/%s", name, models[i]),
			Generator: ai.NewGenerator(p, models[i]),
		})
	}
	return ai.NewGroupGenerator(entries), nil
}

func buildEmbedder(
	name string, list []config.AIFeatureConfig,
	defaults config.AIConfig, providers map[string]ai.IProvider,
) (ai.IEmbedder, error) {
	pp, models, err := resolveAIFeature(name, list, defaults, providers)
	if err != nil {
		return nil, err
	}
	entries := make([]ai.EmbedderEntry, 0, len(pp))
	for i, p := range pp {
		entries = append(entries, ai.EmbedderEntry{
			Name:     fmt.Sprintf("%s/%s", name, models[i]),
			Embedder: ai.NewEmbedder(p, models[i]),
		})
	}
	return ai.NewGroupEmbedder(entries), nil
}

func initAIManager(
	cfg *config.Config, providers map[string]ai.IProvider,
	cacheRepo *repo.EmbeddingCacheRepo,
) (*ai.Manager, error) {
	gen := func(name string, list []config.AIFeatureConfig) (ai.IGenerator, error) {
		return buildGenerator(name, list, cfg.AI, providers)
	}
	polishGen, err := gen("polish", cfg.AI.Polish)
	if err != nil {
		return nil, fmt.Errorf("init polish generator: %w", err)
	}
	genGen, err := gen("generate", cfg.AI.Generate)
	if err != nil {
		return nil, fmt.Errorf("init text generator: %w", err)
	}
	tagGen, err := gen("tagging", cfg.AI.Tagging)
	if err != nil {
		return nil, fmt.Errorf("init tag generator: %w", err)
	}
	sumGen, err := gen("summary", cfg.AI.Summary)
	if err != nil {
		return nil, fmt.Errorf("init summary generator: %w", err)
	}
	embGen, err := buildEmbedder("embed", cfg.AI.Embed, cfg.AI, providers)
	if err != nil {
		return nil, fmt.Errorf("init embedder: %w", err)
	}
	wrapped := embedcache.WrapDBCacheToEmbedder(embGen, cacheRepo)
	wrapped = embedcache.WrapLruCacheToEmbedder(wrapped, 20000, 2*time.Hour)
	return ai.NewManager(polishGen, genGen, tagGen, sumGen, wrapped, ai.ManagerConfig{
		Timeout:       cfg.AI.Timeout,
		MaxInputChars: cfg.AI.MaxInputChars,
	}), nil
}

type serverRepos struct {
	user           *repo.UserRepo
	doc            *repo.DocumentRepo
	summary        *repo.DocumentSummaryRepo
	version        *repo.VersionRepo
	oauth          *repo.OAuthRepo
	emailCode      *repo.EmailVerificationRepo
	tag            *repo.TagRepo
	docTag         *repo.DocumentTagRepo
	share          *repo.ShareRepo
	embedding      *repo.EmbeddingRepo
	embeddingCache *repo.EmbeddingCacheRepo
	importJob      *repo.ImportJobRepo
	importJobNote  *repo.ImportJobNoteRepo
	savedView      *repo.SavedViewRepo
	template       *repo.TemplateRepo
	asset          *repo.AssetRepo
	documentAsset  *repo.DocumentAssetRepo
	todo           *repo.TodoRepo
}

func newServerRepos(db *sql.DB) serverRepos {
	return serverRepos{
		user:           repo.NewUserRepo(db),
		doc:            repo.NewDocumentRepo(db),
		summary:        repo.NewDocumentSummaryRepo(db),
		version:        repo.NewVersionRepo(db),
		oauth:          repo.NewOAuthRepo(db),
		emailCode:      repo.NewEmailVerificationRepo(db),
		tag:            repo.NewTagRepo(db),
		docTag:         repo.NewDocumentTagRepo(db),
		share:          repo.NewShareRepo(db),
		embedding:      repo.NewEmbeddingRepo(db),
		embeddingCache: repo.NewEmbeddingCacheRepo(db),
		importJob:      repo.NewImportJobRepo(db),
		importJobNote:  repo.NewImportJobNoteRepo(db),
		savedView:      repo.NewSavedViewRepo(db),
		template:       repo.NewTemplateRepo(db),
		asset:          repo.NewAssetRepo(db),
		documentAsset:  repo.NewDocumentAssetRepo(db),
		todo:           repo.NewTodoRepo(db),
	}
}

func runServer(cfg *config.Config, db *sql.DB) error {
	logutil.GetLogger(context.Background()).Info(
		"starting server",
		zap.Int("port", cfg.Port),
		zap.String("db_host", cfg.Database.Host),
		zap.String("file_store", cfg.FileStore.Type),
	)

	r := newServerRepos(db)
	if cfg.Properties.EnableTestMode {
		if err := injectTestUser(context.Background(), r.user); err != nil {
			logutil.GetLogger(context.Background()).Fatal(
				"failed to inject test user", zap.Error(err),
			)
		}
		logutil.GetLogger(context.Background()).Info("test mode enabled, test user injected")
	}

	oauthProviders, err := initOAuthProviders(cfg)
	if err != nil {
		return err
	}
	aiProviders, err := initAIProviders(cfg.AIProvider)
	if err != nil {
		return err
	}
	aiManager, err := initAIManager(cfg, aiProviders, r.embeddingCache)
	if err != nil {
		return err
	}

	verifyService := service.NewEmailVerificationService(r.emailCode, newMailSender(cfg.Mail))
	allowRegister := cfg.Properties.EnableUserRegister && cfg.Properties.EnableEmailRegister
	authService := service.NewAuthService(
		r.user, verifyService, []byte(cfg.JWTSecret),
		time.Hour*time.Duration(cfg.JWTTTLHours), allowRegister,
	)
	oauthService := service.NewOAuthService(
		r.user, r.oauth, []byte(cfg.JWTSecret),
		time.Hour*time.Duration(cfg.JWTTTLHours), oauthProviders,
	)

	aiService := service.NewAIService(db, aiManager, r.embedding)
	documentService := service.NewDocumentService(
		db, r.doc, r.summary, r.version, r.docTag, r.share,
		r.tag, r.user, aiService, cfg.VersionMaxKeep,
	)
	assetService := service.NewAssetService(r.asset, r.documentAsset)
	documentService.SetAssetService(assetService)
	tagService := service.NewTagService(db, r.tag, r.docTag)
	importService := service.NewImportService(
		documentService, tagService, r.importJob, r.importJobNote,
	)

	deps, err := buildRouterDeps(cfg, authService, oauthService,
		documentService, aiService, tagService, assetService,
		importService, r)
	if err != nil {
		return err
	}
	engine, err := webapi.NewEngine(
		"/api/v1",
		fmt.Sprintf("0.0.0.0:%d", cfg.Port),
		webapi.WithRegister(func(group *gin.RouterGroup) {
			handler.RegisterRoutes(group, deps)
		}),
		webapi.WithExtraMiddlewares(
			middleware.CORS(cfg.CORS.AllowOrigins),
			gzip.Gzip(gzip.DefaultCompression),
		),
	)
	if err != nil {
		return fmt.Errorf("init web engine: %w", err)
	}

	return startServer(cfg, engine, aiService, documentService, r)
}

func newMailSender(mail config.MailConfig) service.EmailSender {
	return service.NewEmailSender(service.MailConfig{
		Host:     mail.Host,
		Port:     mail.Port,
		Username: mail.Username,
		Password: mail.Password,
		From:     mail.From,
	})
}

func buildRouterDeps(
	cfg *config.Config,
	authSvc *service.AuthService, oauthSvc *service.OAuthService,
	docSvc *service.DocumentService, aiSvc *service.AIService,
	tagSvc *service.TagService, assetSvc *service.AssetService,
	importSvc *service.ImportService, r serverRepos,
) (handler.RouterDeps, error) {
	store, err := filestore.New(filestore.Config{
		Type: cfg.FileStore.Type,
		Data: cfg.FileStore.Data,
	})
	if err != nil {
		return handler.RouterDeps{}, fmt.Errorf("init file store: %w", err)
	}
	fileHandler := handler.NewFileHandler(store, cfg.MaxUploadSize)
	fileHandler.SetAssetService(assetSvc)

	return handler.RouterDeps{
		Auth:  handler.NewAuthHandler(authSvc),
		OAuth: handler.NewOAuthHandler(oauthSvc),
		Properties: handler.NewPropertiesHandler(
			handler.Properties{
				EnableGithubOauth:   cfg.Properties.EnableGithubOauth,
				EnableGoogleOauth:   cfg.Properties.EnableGoogleOauth,
				EnableUserRegister:  cfg.Properties.EnableUserRegister,
				EnableEmailRegister: cfg.Properties.EnableEmailRegister,
				EnableTestMode:      cfg.Properties.EnableTestMode,
			},
			handler.BannerConfig{
				Enable:   cfg.Banner.Enable,
				Title:    cfg.Banner.Title,
				Wording:  cfg.Banner.Wording,
				Redirect: cfg.Banner.Redirect,
			},
		),
		Documents: handler.NewDocumentHandler(docSvc),
		Versions:  handler.NewVersionHandler(docSvc),
		Shares:    handler.NewShareHandler(docSvc),
		Tags:      handler.NewTagHandler(tagSvc),
		Export: handler.NewExportHandler(
			service.NewExportService(r.doc, r.summary, r.version, r.tag, r.docTag),
		),
		Files:      fileHandler,
		SavedViews: handler.NewSavedViewHandler(service.NewSavedViewService(r.savedView)),
		AI:         handler.NewAIHandler(aiSvc, docSvc, tagSvc),
		Import:     handler.NewImportHandler(importSvc, cfg.MaxUploadSize, service.SaveTempFile),
		Templates: handler.NewTemplateHandler(
			service.NewTemplateService(r.template, docSvc, r.tag),
		),
		Assets:    handler.NewAssetHandler(assetSvc),
		Todos:     handler.NewTodoHandler(service.NewTodoService(r.todo)),
		JWTSecret: []byte(cfg.JWTSecret),
	}, nil
}

func startServer(
	cfg *config.Config, engine webapi.IWebEngine,
	aiSvc *service.AIService, docSvc *service.DocumentService,
	r serverRepos,
) error {
	logutil.GetLogger(context.Background()).Info(
		"http server listening",
		zap.String("addr", fmt.Sprintf("0.0.0.0:%d", cfg.Port)),
	)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	scheduler := schedule.NewCronScheduler()
	if err := addScheduledJobs(scheduler, cfg, aiSvc, docSvc, r); err != nil {
		return err
	}
	scheduler.Start(ctx)
	defer scheduler.Stop()

	go func() {
		if err := engine.Run(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logutil.GetLogger(context.Background()).Error("server error", zap.Error(err))
		}
	}()

	<-ctx.Done()
	logutil.GetLogger(context.Background()).Info("server stopping...")
	return nil
}

func addScheduledJobs(
	s *schedule.CronScheduler, cfg *config.Config,
	aiSvc *service.AIService, docSvc *service.DocumentService,
	r serverRepos,
) error {
	type entry struct {
		job  schedule.Job
		cron string
		name string
	}
	jobs := []entry{
		{job.NewAIEmbeddingJob(aiSvc, cfg.AIJob.EmbeddingDelaySeconds), "*/1 * * * *", "ai_embedding"},
		{job.NewAISummaryJob(docSvc, cfg.AIJob.SummaryDelaySeconds), "*/1 * * * *", "ai_summary"},
		{job.NewEmbeddingCacheCleanupJob(r.embeddingCache, 30), "0 3 * * *", "embedding_cache_cleanup"},
		{job.NewImportCleanupJob(r.importJob, r.importJobNote, 24*time.Hour), "0 * * * *", "import_cleanup"},
	}
	for _, e := range jobs {
		if err := s.AddJob(e.job, e.cron); err != nil {
			return fmt.Errorf("schedule %s: %w", e.name, err)
		}
	}
	return nil
}
