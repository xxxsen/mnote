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
	mnoteapp "github.com/xxxsen/mnote/internal/app"
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
			cfg, err := loadValidatedConfig(configPath)
			if err != nil {
				return err
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

			startupCtx, cancelStartup := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancelStartup()
			conn, err := db.Open(startupCtx, db.Config{
				DSN:             cfg.Database.DSN,
				Host:            cfg.Database.Host,
				Port:            cfg.Database.Port,
				User:            cfg.Database.User,
				Password:        cfg.Database.Password,
				DBName:          cfg.Database.DBName,
				SSLMode:         cfg.Database.SSLMode,
				MaxOpenConns:    cfg.Database.MaxOpenConns,
				MaxIdleConns:    cfg.Database.MaxIdleConns,
				ConnMaxLifetime: time.Duration(cfg.Database.ConnMaxLifetimeSeconds) * time.Second,
				ConnMaxIdleTime: time.Duration(cfg.Database.ConnMaxIdleTimeSeconds) * time.Second,
			})
			if err != nil {
				return fmt.Errorf("open db: %w", err)
			}
			if err := db.ApplyMigrationsContext(startupCtx, conn); err != nil {
				_ = conn.Close()
				return fmt.Errorf("migrations: %w", err)
			}
			return runServer(cfg, conn)
		},
	}

	runCmd.Flags().StringVar(&configPath, "config", "", "path to config.json")
	var validateConfigPath string
	configCmd := &cobra.Command{Use: "config", Short: "configuration utilities"}
	validateCmd := &cobra.Command{
		Use:   "validate",
		Short: "validate configuration and exit",
		RunE: func(_ *cobra.Command, _ []string) error {
			if validateConfigPath == "" {
				return errors.New("--config is required")
			}
			_, err := loadValidatedConfig(validateConfigPath)
			return err
		},
	}
	validateCmd.Flags().StringVar(&validateConfigPath, "config", "", "path to config.json")
	configCmd.AddCommand(validateCmd)
	rootCmd.AddCommand(runCmd)
	rootCmd.AddCommand(configCmd)

	if err := rootCmd.Execute(); err != nil {
		_, _ = fmt.Fprintln(os.Stderr, "startup error:", err)
		os.Exit(1)
	}
}

func loadValidatedConfig(path string) (*config.Config, error) {
	cfg, err := config.Load(path)
	if err != nil {
		return nil, fmt.Errorf("validate config: %w", err)
	}
	if err := validateRuntimeConfig(cfg); err != nil {
		return nil, err
	}
	return cfg, nil
}

func validateRuntimeConfig(cfg *config.Config) error {
	if cfg == nil {
		return errors.New("config is required")
	}
	if _, err := filestore.New(filestore.Config{
		Type: cfg.FileStore.Type,
		Data: cfg.FileStore.Data,
	}); err != nil {
		return fmt.Errorf("validate file store: %w", err)
	}
	return nil
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
		ID:              "test_user",
		Email:           email,
		EmailNormalized: email,
		PasswordHash:    hash,
		Ctime:           time.Now().Unix(),
		Mtime:           time.Now().Unix(),
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

func initEmbeddingProviders(cfg *config.Config) (map[string]ai.IProvider, error) {
	providers := make(map[string]ai.IProvider)
	required := requiredEmbeddingProviders(cfg.AI)
	if len(required) == 0 {
		return providers, nil
	}
	seen := make(map[string]struct{})
	for _, pcfg := range cfg.AIProvider {
		if _, needed := required[pcfg.Name]; !needed {
			continue
		}
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

func requiredEmbeddingProviders(cfg config.AIConfig) map[string]struct{} {
	required := make(map[string]struct{})
	if !cfg.IsEnabled() {
		return required
	}
	for _, item := range normalizeEmbeddingList(cfg.Embed, cfg) {
		if item.Provider != "" {
			required[item.Provider] = struct{}{}
		}
	}
	return required
}

func normalizeEmbeddingList(
	list []config.AIEmbeddingConfig, defaults config.AIConfig,
) []config.AIEmbeddingConfig {
	if len(list) == 0 {
		return []config.AIEmbeddingConfig{{Provider: defaults.Provider, Model: defaults.Model}}
	}
	result := make([]config.AIEmbeddingConfig, 0, len(list))
	for _, item := range list {
		result = append(result, item.WithDefaults(defaults))
	}
	return result
}

func resolveEmbedding(
	list []config.AIEmbeddingConfig,
	defaults config.AIConfig, providers map[string]ai.IProvider,
) ([]ai.IProvider, []string, error) {
	items := normalizeEmbeddingList(list, defaults)
	resolved := make([]ai.IProvider, 0, len(items))
	models := make([]string, 0, len(items))
	for _, f := range items {
		if f.Provider == "" || f.Model == "" {
			return nil, nil, errors.New("embedding: provider or model not configured")
		}
		p, ok := providers[f.Provider]
		if !ok {
			return nil, nil, fmt.Errorf(
				"embedding: provider %s not found", f.Provider,
			)
		}
		logutil.GetLogger(context.Background()).Info(
			"embedding provider init",
			zap.String("provider", f.Provider),
			zap.String("model", f.Model),
		)
		resolved = append(resolved, p)
		models = append(models, f.Model)
	}
	return resolved, models, nil
}

func buildEmbedder(
	list []config.AIEmbeddingConfig,
	defaults config.AIConfig, providers map[string]ai.IProvider,
) (ai.IEmbedder, error) {
	pp, models, err := resolveEmbedding(list, defaults, providers)
	if err != nil {
		return nil, err
	}
	entries := make([]ai.EmbedderEntry, 0, len(pp))
	for i, p := range pp {
		entries = append(entries, ai.EmbedderEntry{
			Name:     fmt.Sprintf("embed/%s", models[i]),
			Embedder: ai.NewEmbedder(p, models[i]),
		})
	}
	return ai.NewGroupEmbedder(entries), nil
}

func initAIEmbedder(
	cfg *config.Config, providers map[string]ai.IProvider,
	cacheRepo *repo.EmbeddingCacheRepo,
) (ai.IEmbedder, error) {
	if !cfg.AI.IsEnabled() {
		return ai.NewGroupEmbedder(nil), nil
	}
	embedder, err := buildEmbedder(cfg.AI.Embed, cfg.AI, providers)
	if err != nil {
		return nil, fmt.Errorf("init embedder: %w", err)
	}
	wrapped := embedcache.WrapDBCacheToEmbedder(embedder, cacheRepo)
	wrapped = embedcache.WrapLruCacheToEmbedder(wrapped, 20000, 2*time.Hour)
	return wrapped, nil
}

type serverRepos struct {
	user           *repo.UserRepo
	doc            *repo.DocumentRepo
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
	template       *repo.TemplateRepo
	asset          *repo.AssetRepo
	documentAsset  *repo.DocumentAssetRepo
	todo           *repo.TodoRepo
}

func newServerRepos(db *sql.DB) serverRepos {
	return serverRepos{
		user:           repo.NewUserRepo(db),
		doc:            repo.NewDocumentRepo(db),
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
			return fmt.Errorf("inject test user: %w", err)
		}
		logutil.GetLogger(context.Background()).Info("test mode enabled, test user injected")
	}

	services, err := buildServerServices(cfg, db, r)
	if err != nil {
		return err
	}
	deps, store, err := buildRouterDeps(
		cfg, services.auth, services.oauth, services.documents, services.tags,
		services.assets, services.imports, r, services.runtime,
	)
	if err != nil {
		return err
	}
	if err := deps.Validate(); err != nil {
		return fmt.Errorf("validate router dependencies: %w", err)
	}
	engine, err := webapi.NewEngine(
		"/api/v1",
		fmt.Sprintf("0.0.0.0:%d", cfg.Port),
		webapi.WithRegister(func(group *gin.RouterGroup) {
			handler.RegisterRoutes(group, deps)
		}),
		webapi.WithExtraMiddlewares(
			middleware.RequestID(),
			middleware.CORS(cfg.CORS.AllowOrigins),
			responseCompression(),
		),
	)
	if err != nil {
		return fmt.Errorf("init web engine: %w", err)
	}

	return startServer(
		cfg, db, engine, services.embedding,
		[]mnoteapp.Worker{
			service.NewImportWorker(services.imports, r.importJob, r.importJobNote),
			service.NewAssetCleanupWorker(r.asset, store, services.runtime),
		},
		r,
	)
}

func responseCompression() gin.HandlerFunc {
	return gzip.Gzip(
		gzip.DefaultCompression,
		gzip.WithExcludedPaths([]string{"/api/v1/files/"}),
	)
}

type serverServices struct {
	auth      *service.AuthService
	oauth     *service.OAuthService
	embedding *service.EmbeddingService
	documents *service.DocumentService
	tags      *service.TagService
	assets    *service.AssetService
	imports   *service.ImportService
	runtime   service.Runtime
}

func buildServerServices(
	cfg *config.Config, database *sql.DB, repos serverRepos,
) (serverServices, error) {
	oauthProviders, err := initOAuthProviders(cfg)
	if err != nil {
		return serverServices{}, err
	}
	embeddingProviders, err := initEmbeddingProviders(cfg)
	if err != nil {
		return serverServices{}, err
	}
	embedder, err := initAIEmbedder(cfg, embeddingProviders, repos.embeddingCache)
	if err != nil {
		return serverServices{}, err
	}
	runtime := service.NewRuntime(repo.NewTransactor(database))
	runtime.Limits = service.Limits{
		MaxDocumentBytes: int(cfg.MaxDocumentSize),
		MaxTemplateBytes: int(cfg.MaxTemplateSize),
		MaxJSONBodyBytes: cfg.MaxJSONBodySize,
	}
	verify := service.NewEmailVerificationService(
		repos.emailCode, newMailSender(cfg.Mail), runtime,
	)
	auth := service.NewAuthService(
		repos.user, verify, []byte(cfg.JWTSecret),
		time.Hour*time.Duration(cfg.JWTTTLHours),
		cfg.Properties.EnableUserRegister && cfg.Properties.EnableEmailRegister,
		runtime,
	)
	oauthService := service.NewOAuthService(
		repos.user, repos.oauth, []byte(cfg.JWTSecret),
		time.Hour*time.Duration(cfg.JWTTTLHours), oauthProviders, runtime,
	)
	embeddingService := service.NewEmbeddingService(embedder, repos.embedding)
	assets := service.NewAssetService(repos.asset, repos.documentAsset, runtime)
	documents := service.NewDocumentService(
		runtime, repos.doc, repos.version, repos.docTag, repos.share,
		repos.tag, repos.user, embeddingService, cfg.VersionMaxKeep, assets,
	)
	tags := service.NewTagService(runtime, repos.tag, repos.docTag)
	return serverServices{
		auth: auth, oauth: oauthService, embedding: embeddingService,
		documents: documents, tags: tags, assets: assets,
		imports: service.NewImportService(
			documents, tags, repos.importJob, repos.importJobNote, runtime,
		),
		runtime: runtime,
	}, nil
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
	docSvc *service.DocumentService, tagSvc *service.TagService, assetSvc *service.AssetService,
	importSvc *service.ImportService, r serverRepos, runtime service.Runtime,
) (handler.RouterDeps, filestore.Store, error) {
	store, err := filestore.New(filestore.Config{
		Type: cfg.FileStore.Type,
		Data: cfg.FileStore.Data,
	})
	if err != nil {
		return handler.RouterDeps{}, nil, fmt.Errorf("init file store: %w", err)
	}
	fileHandler := handler.NewFileHandler(store, cfg.MaxUploadSize, assetSvc)

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
			service.NewExportService(r.doc, r.version, r.tag, r.docTag),
		),
		Files:          fileHandler,
		SemanticSearch: handler.NewSemanticSearchHandler(docSvc),
		Import:         handler.NewImportHandler(importSvc, cfg.MaxUploadSize, service.SaveTempFile),
		Templates: handler.NewTemplateHandler(
			service.NewTemplateService(r.template, docSvc, r.tag, runtime),
		),
		Assets:          handler.NewAssetHandler(assetSvc),
		Todos:           handler.NewTodoHandler(service.NewTodoService(r.todo, runtime)),
		JWTSecret:       []byte(cfg.JWTSecret),
		MaxJSONBodySize: cfg.MaxJSONBodySize,
	}, store, nil
}

func startServer(
	cfg *config.Config, database *sql.DB, engine webapi.IWebEngine,
	embeddingSvc *service.EmbeddingService,
	workers []mnoteapp.Worker,
	r serverRepos,
) error {
	logutil.GetLogger(context.Background()).Info(
		"http server listening",
		zap.String("addr", fmt.Sprintf("0.0.0.0:%d", cfg.Port)),
	)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	scheduler := schedule.NewCronScheduler()
	if err := addScheduledJobs(scheduler, cfg, embeddingSvc, r); err != nil {
		return err
	}
	instance, err := mnoteapp.New(mnoteapp.Config{
		Address:   fmt.Sprintf("0.0.0.0:%d", cfg.Port),
		Handler:   engine,
		DB:        database,
		Scheduler: scheduler,
		Workers:   workers,
	})
	if err != nil {
		return fmt.Errorf("create application: %w", err)
	}
	return instance.Run(ctx)
}

func addScheduledJobs(
	s schedule.Scheduler, cfg *config.Config,
	embeddingSvc *service.EmbeddingService,
	r serverRepos,
) error {
	type entry struct {
		job  schedule.Job
		cron string
		name string
	}
	jobs := []entry{
		{job.NewImportCleanupJob(r.importJob, r.importJobNote, 24*time.Hour), "0 * * * *", "import_cleanup"},
	}
	if cfg.AI.IsEnabled() {
		jobs = append(jobs,
			entry{job.NewAIEmbeddingJob(embeddingSvc, cfg.AIJob.EmbeddingDelaySeconds), "*/1 * * * *", "ai_embedding"},
			entry{job.NewEmbeddingCacheCleanupJob(r.embeddingCache, 30), "0 3 * * *", "embedding_cache_cleanup"},
		)
	}
	for _, e := range jobs {
		if err := s.AddJob(e.job, e.cron); err != nil {
			return fmt.Errorf("schedule %s: %w", e.name, err)
		}
	}
	return nil
}
