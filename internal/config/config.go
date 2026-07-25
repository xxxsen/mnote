package config

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"

	"github.com/xxxsen/common/logger"
)

type Config struct {
	Database        DatabaseConfig     `json:"database"`
	JWTSecret       string             `json:"jwt_secret"`
	Port            int                `json:"port"`
	JWTTTLHours     int                `json:"jwt_ttl_hours"`
	VersionMaxKeep  int                `json:"version_max_keep"`
	MaxUploadSize   int64              `json:"max_upload_size"`
	MaxJSONBodySize int64              `json:"max_json_body_size"`
	MaxDocumentSize int64              `json:"max_document_size"`
	MaxTemplateSize int64              `json:"max_template_size"`
	LogConfig       logger.LogConfig   `json:"log_config"`
	CORS            CORSConfig         `json:"cors"`
	FileStore       FileStoreConfig    `json:"file_store"`
	AI              AIConfig           `json:"ai"`
	AIJob           AIJobConfig        `json:"ai_job"`
	OAuth           OAuthConfig        `json:"oauth"`
	Mail            MailConfig         `json:"mail"`
	Properties      Properties         `json:"properties"`
	Banner          BannerConfig       `json:"banner"`
	AIProvider      []AIProviderConfig `json:"ai_provider"`
}

type DatabaseConfig struct {
	DSN                    string `json:"dsn"`
	Host                   string `json:"host"`
	Port                   int    `json:"port"`
	User                   string `json:"user"`
	Password               string `json:"password"`
	DBName                 string `json:"dbname"`
	SSLMode                string `json:"sslmode"`
	MaxOpenConns           int    `json:"max_open_conns"`
	MaxIdleConns           int    `json:"max_idle_conns"`
	ConnMaxLifetimeSeconds int    `json:"conn_max_lifetime_seconds"`
	ConnMaxIdleTimeSeconds int    `json:"conn_max_idle_time_seconds"`
}

type CORSConfig struct {
	AllowOrigins []string `json:"allow_origins"`
}

type FileStoreConfig struct {
	Type string `json:"type"`
	Data any    `json:"data"`
}

type AIProviderConfig struct {
	Name string `json:"name"`
	Type string `json:"type"`
	Data any    `json:"data"`
}

type AIEmbeddingConfig struct {
	Provider string `json:"provider"`
	Model    string `json:"model"`
}

func (f AIEmbeddingConfig) WithDefaults(c AIConfig) AIEmbeddingConfig {
	if f.Provider == "" {
		f.Provider = c.Provider
	}
	if f.Model == "" {
		f.Model = c.Model
	}
	return f
}

type AIProfileConfig struct {
	ID               string   `json:"id"`
	SpaceID          string   `json:"space_id"`
	Model            string   `json:"model"`
	Dimensions       int      `json:"dimensions"`
	Metric           string   `json:"metric"`
	ChunkerVersion   int      `json:"chunker_version"`
	QueryTaskType    string   `json:"query_task_type"`
	DocumentTaskType string   `json:"document_task_type"`
	MinScore         *float64 `json:"min_score"`
	Providers        []string `json:"providers"`
}

func (p AIProfileConfig) Fingerprint() string {
	value := strings.Join([]string{
		p.SpaceID,
		p.Model,
		strconv.Itoa(p.Dimensions),
		p.Metric,
		p.QueryTaskType,
		p.DocumentTaskType,
		strconv.Itoa(p.ChunkerVersion),
	}, "\n")
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func (p AIProfileConfig) ResolvedMinScore() float32 {
	if p.MinScore == nil {
		return 0.55
	}
	return float32(*p.MinScore)
}

type AIConfig struct {
	Enabled               *bool               `json:"enabled"`
	Provider              string              `json:"provider"`
	Model                 string              `json:"model"`
	Embed                 []AIEmbeddingConfig `json:"embed"`
	Profiles              []AIProfileConfig   `json:"profiles"`
	RequestTimeoutSeconds int                 `json:"request_timeout_seconds"`
	WorkerConcurrency     int                 `json:"worker_concurrency"`
	BatchSize             int                 `json:"batch_size"`
	IndexDelaySeconds     *int64              `json:"index_delay_seconds"`
	LeaseSeconds          int64               `json:"lease_seconds"`
	LeaseRenewSeconds     int64               `json:"lease_renew_seconds"`
	MaxAttempts           int                 `json:"max_attempts"`
	StandbyHours          int                 `json:"standby_hours"`
}

func (c AIConfig) IsEnabled() bool {
	if c.Enabled != nil {
		return *c.Enabled
	}
	return c.Provider != "" || c.Model != "" || len(c.Embed) > 0 || len(c.Profiles) > 0
}

func (c AIConfig) UsesV2() bool {
	return c.IsEnabled() && len(c.Profiles) > 0
}

type AIJobConfig struct {
	EmbeddingDelaySeconds  int64 `json:"embedding_delay_seconds"`
	embeddingDelayExplicit bool
}

func (c *AIJobConfig) UnmarshalJSON(data []byte) error {
	var raw struct {
		EmbeddingDelaySeconds *int64 `json:"embedding_delay_seconds"`
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&raw); err != nil {
		return fmt.Errorf("decode ai_job config: %w", err)
	}
	if err := ensureJSONEOF(decoder); err != nil {
		return err
	}
	if raw.EmbeddingDelaySeconds != nil {
		c.EmbeddingDelaySeconds = *raw.EmbeddingDelaySeconds
		c.embeddingDelayExplicit = true
	}
	return nil
}

type OAuthConfig struct {
	Github OAuthProviderConfig `json:"github"`
	Google OAuthProviderConfig `json:"google"`
}

type OAuthProviderConfig struct {
	ClientID     string   `json:"client_id"`
	ClientSecret string   `json:"client_secret"`
	RedirectURL  string   `json:"redirect_url"`
	Scopes       []string `json:"scopes"`
}

type MailConfig struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Username string `json:"username"`
	Password string `json:"password"`
	From     string `json:"from"`
}

type Properties struct {
	EnableGithubOauth   bool `json:"enable_github_oauth"`
	EnableGoogleOauth   bool `json:"enable_google_oauth"`
	EnableUserRegister  bool `json:"enable_user_register"`
	EnableEmailRegister bool `json:"enable_email_register"`
	EnableTestMode      bool `json:"enable_test_mode"`
}

type BannerConfig struct {
	Enable   bool   `json:"enable"`
	Title    string `json:"title"`
	Wording  string `json:"wording"`
	Redirect string `json:"redirect"`
}

var (
	errDatabaseRequired      = errors.New("database.host or database.dsn is required")
	errJWTSecretRequired     = errors.New("jwt_secret is required")
	errPortRequired          = errors.New("port is required")
	errTrailingConfig        = errors.New("config must contain exactly one JSON object")
	errInvalidLimits         = errors.New("TTL, upload, and text limits must be positive")
	errInvalidDatabasePool   = errors.New("invalid database pool configuration")
	errInvalidAIConfig       = errors.New("invalid embedding configuration")
	errIncompleteMailConfig  = errors.New("mail host, port, and from are required when email registration is enabled")
	errIncompleteOAuthConfig = errors.New("oauth client id, secret, and redirect URL are required")
)

func Load(path string) (*Config, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open config: %w", err)
	}
	defer func() { _ = file.Close() }()

	decoder := json.NewDecoder(file)
	decoder.DisallowUnknownFields()
	var cfg Config
	if err := decoder.Decode(&cfg); err != nil {
		return nil, fmt.Errorf("decode config: %w", err)
	}
	if err := ensureJSONEOF(decoder); err != nil {
		return nil, err
	}
	cfg.applyDefaults()
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func ensureJSONEOF(decoder *json.Decoder) error {
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		if err == nil {
			return errTrailingConfig
		}
		return fmt.Errorf("decode trailing config: %w", err)
	}
	return nil
}

func (c *Config) Validate() error {
	if err := c.validateCore(); err != nil {
		return err
	}
	if err := c.validateDatabase(); err != nil {
		return err
	}
	if err := c.validateAI(); err != nil {
		return err
	}
	return c.validateOptionalFeatures()
}

func (c *Config) validateCore() error {
	if c.Database.Host == "" && c.Database.DSN == "" {
		return errDatabaseRequired
	}
	if c.JWTSecret == "" {
		return errJWTSecretRequired
	}
	if c.Port < 1 || c.Port > 65535 {
		return errPortRequired
	}
	if c.JWTTTLHours <= 0 || c.VersionMaxKeep < 0 ||
		c.MaxUploadSize <= 0 || c.MaxJSONBodySize <= 0 ||
		c.MaxDocumentSize <= 0 || c.MaxTemplateSize <= 0 {
		return errInvalidLimits
	}
	return nil
}

func (c *Config) validateDatabase() error {
	if c.Database.MaxOpenConns <= 0 || c.Database.MaxIdleConns < 0 ||
		c.Database.MaxIdleConns > c.Database.MaxOpenConns ||
		c.Database.ConnMaxLifetimeSeconds <= 0 ||
		c.Database.ConnMaxIdleTimeSeconds <= 0 {
		return errInvalidDatabasePool
	}
	return nil
}

func (c *Config) validateAI() error {
	if err := c.validateAIProfiles(); err != nil {
		return err
	}
	if !c.AI.IsEnabled() {
		return nil
	}
	if len(c.AI.Profiles) > 0 {
		return c.validateAIV2Runtime()
	}
	if c.AIJob.EmbeddingDelaySeconds <= 0 {
		return errInvalidAIConfig
	}
	embeddings := c.AI.Embed
	if len(embeddings) == 0 {
		embeddings = []AIEmbeddingConfig{{}}
	}
	for _, embedding := range embeddings {
		resolved := embedding.WithDefaults(c.AI)
		if strings.TrimSpace(resolved.Provider) == "" || strings.TrimSpace(resolved.Model) == "" {
			return errInvalidAIConfig
		}
	}
	return nil
}

func (c *Config) validateAIProfiles() error {
	providerNames := make(map[string]int, len(c.AIProvider))
	for _, provider := range c.AIProvider {
		name := strings.TrimSpace(provider.Name)
		if name == "" {
			continue
		}
		providerNames[name]++
	}
	profileIDs := make(map[string]struct{}, len(c.AI.Profiles))
	fingerprints := make(map[string]string, len(c.AI.Profiles))
	for _, profile := range c.AI.Profiles {
		if err := validateAIProfile(
			profile,
			providerNames,
			profileIDs,
			fingerprints,
		); err != nil {
			return err
		}
	}
	return nil
}

func validateAIProfile(
	profile AIProfileConfig,
	providerNames map[string]int,
	profileIDs map[string]struct{},
	fingerprints map[string]string,
) error {
	required := []bool{
		strings.TrimSpace(profile.ID) != "",
		strings.TrimSpace(profile.SpaceID) != "",
		strings.TrimSpace(profile.Model) != "",
		profile.Metric == "cosine",
		profile.ChunkerVersion == 2,
		strings.TrimSpace(profile.QueryTaskType) != "",
		strings.TrimSpace(profile.DocumentTaskType) != "",
		isSupportedEmbeddingDimensions(profile.Dimensions),
		len(profile.Providers) > 0,
	}
	for _, valid := range required {
		if !valid {
			return fmt.Errorf("%w: invalid profile %q", errInvalidAIConfig, profile.ID)
		}
	}
	if _, exists := profileIDs[profile.ID]; exists {
		return fmt.Errorf("%w: duplicate profile %q", errInvalidAIConfig, profile.ID)
	}
	profileIDs[profile.ID] = struct{}{}
	fingerprint := profile.Fingerprint()
	if existing, exists := fingerprints[fingerprint]; exists {
		return fmt.Errorf(
			"%w: profiles %q and %q have the same fingerprint",
			errInvalidAIConfig, existing, profile.ID,
		)
	}
	fingerprints[fingerprint] = profile.ID
	if profile.MinScore == nil || *profile.MinScore < -1 || *profile.MinScore > 1 {
		return fmt.Errorf("%w: invalid min_score for %q", errInvalidAIConfig, profile.ID)
	}
	return validateAIProfileProviders(profile, providerNames)
}

func validateAIProfileProviders(
	profile AIProfileConfig,
	providerNames map[string]int,
) error {
	seen := make(map[string]struct{}, len(profile.Providers))
	for _, providerName := range profile.Providers {
		providerName = strings.TrimSpace(providerName)
		if providerNames[providerName] != 1 {
			return fmt.Errorf(
				"%w: profile %q requires exactly one provider %q",
				errInvalidAIConfig, profile.ID, providerName,
			)
		}
		if _, exists := seen[providerName]; exists {
			return fmt.Errorf(
				"%w: profile %q repeats provider %q",
				errInvalidAIConfig, profile.ID, providerName,
			)
		}
		seen[providerName] = struct{}{}
	}
	return nil
}

func (c *Config) validateAIV2Runtime() error {
	delay := c.AI.ResolvedIndexDelaySeconds(c.AIJob)
	invalid := []bool{
		delay < 0,
		delay > 3600,
		c.AI.RequestTimeoutSeconds < 5,
		c.AI.RequestTimeoutSeconds > 120,
		c.AI.WorkerConcurrency < 1,
		c.AI.WorkerConcurrency > 16,
		c.AI.BatchSize < 1,
		c.AI.BatchSize > 64,
		c.AI.LeaseSeconds < int64(c.AI.RequestTimeoutSeconds*2),
		c.AI.LeaseSeconds <= c.AI.LeaseRenewSeconds*3,
		c.AI.LeaseRenewSeconds <= 0,
		c.AI.MaxAttempts < 1,
		c.AI.StandbyHours < 1,
	}
	for _, value := range invalid {
		if value {
			return errInvalidAIConfig
		}
	}
	if c.AI.IndexDelaySeconds != nil &&
		c.AIJob.embeddingDelayExplicit &&
		*c.AI.IndexDelaySeconds != c.AIJob.EmbeddingDelaySeconds {
		return fmt.Errorf(
			"%w: ai.index_delay_seconds conflicts with ai_job.embedding_delay_seconds",
			errInvalidAIConfig,
		)
	}
	return nil
}

func (c AIConfig) ResolvedIndexDelaySeconds(job AIJobConfig) int64 {
	if c.IndexDelaySeconds != nil {
		return *c.IndexDelaySeconds
	}
	return job.EmbeddingDelaySeconds
}

func isSupportedEmbeddingDimensions(value int) bool {
	switch value {
	case 384, 768, 1024, 1536:
		return true
	default:
		return false
	}
}

func (c *Config) validateOptionalFeatures() error {
	if c.Properties.EnableGithubOauth {
		if err := validateOAuthProvider("github", c.OAuth.Github); err != nil {
			return err
		}
	}
	if c.Properties.EnableGoogleOauth {
		if err := validateOAuthProvider("google", c.OAuth.Google); err != nil {
			return err
		}
	}
	if c.Properties.EnableEmailRegister &&
		(strings.TrimSpace(c.Mail.Host) == "" || c.Mail.Port <= 0 || strings.TrimSpace(c.Mail.From) == "") {
		return errIncompleteMailConfig
	}
	return nil
}

func validateOAuthProvider(name string, provider OAuthProviderConfig) error {
	if strings.TrimSpace(provider.ClientID) == "" ||
		strings.TrimSpace(provider.ClientSecret) == "" ||
		strings.TrimSpace(provider.RedirectURL) == "" {
		return fmt.Errorf("%w: %s", errIncompleteOAuthConfig, name)
	}
	return nil
}

func (c *Config) applyDefaults() {
	if c.JWTTTLHours == 0 {
		c.JWTTTLHours = 72
	}
	if c.VersionMaxKeep == 0 {
		c.VersionMaxKeep = 10
	}
	if c.MaxUploadSize <= 0 {
		c.MaxUploadSize = 20 * 1024 * 1024
	}
	if c.MaxJSONBodySize == 0 {
		c.MaxJSONBodySize = 2 * 1024 * 1024
	}
	if c.MaxDocumentSize == 0 {
		c.MaxDocumentSize = 1024 * 1024
	}
	if c.MaxTemplateSize == 0 {
		c.MaxTemplateSize = 1024 * 1024
	}
	if c.Database.MaxOpenConns == 0 {
		c.Database.MaxOpenConns = 20
	}
	if c.Database.MaxIdleConns == 0 {
		c.Database.MaxIdleConns = 10
		if c.Database.MaxOpenConns < c.Database.MaxIdleConns {
			c.Database.MaxIdleConns = c.Database.MaxOpenConns
		}
	}
	if c.Database.ConnMaxLifetimeSeconds == 0 {
		c.Database.ConnMaxLifetimeSeconds = 30 * 60
	}
	if c.Database.ConnMaxIdleTimeSeconds == 0 {
		c.Database.ConnMaxIdleTimeSeconds = 5 * 60
	}
	if c.LogConfig.Level == "" {
		c.LogConfig.Level = "info"
	}
	if c.FileStore.Type == "" {
		c.FileStore.Type = "local"
	}
	c.applyAIDefaults()
	c.applyOAuthDefaults()
}

func (c *Config) applyAIDefaults() {
	c.AI.Provider = strings.TrimSpace(c.AI.Provider)
	c.AI.Model = strings.TrimSpace(c.AI.Model)
	for index := range c.AI.Embed {
		c.AI.Embed[index].Provider = strings.TrimSpace(c.AI.Embed[index].Provider)
		c.AI.Embed[index].Model = strings.TrimSpace(c.AI.Embed[index].Model)
	}
	for index := range c.AIProvider {
		c.AIProvider[index].Name = strings.TrimSpace(c.AIProvider[index].Name)
		c.AIProvider[index].Type = strings.TrimSpace(c.AIProvider[index].Type)
	}
	c.applyDefaultEmbeddingV2Profile()
	if c.AIJob.EmbeddingDelaySeconds == 0 &&
		!c.AIJob.embeddingDelayExplicit {
		c.AIJob.EmbeddingDelaySeconds = 300
	}
	if len(c.AI.Profiles) == 0 {
		return
	}
	if c.AI.RequestTimeoutSeconds == 0 {
		c.AI.RequestTimeoutSeconds = 30
	}
	if c.AI.WorkerConcurrency == 0 {
		c.AI.WorkerConcurrency = 2
	}
	if c.AI.BatchSize == 0 {
		c.AI.BatchSize = 16
	}
	if c.AI.LeaseSeconds == 0 {
		c.AI.LeaseSeconds = 120
	}
	if c.AI.LeaseRenewSeconds == 0 {
		c.AI.LeaseRenewSeconds = 30
	}
	if c.AI.MaxAttempts == 0 {
		c.AI.MaxAttempts = 10
	}
	if c.AI.StandbyHours == 0 {
		c.AI.StandbyHours = 24
	}
	defaultMinScore := 0.55
	for index := range c.AI.Profiles {
		applyAIProfileDefaults(&c.AI.Profiles[index], defaultMinScore)
	}
}

func (c *Config) applyDefaultEmbeddingV2Profile() {
	if len(c.AI.Profiles) > 0 || !c.AI.IsEnabled() {
		return
	}
	embeddings := c.AI.Embed
	if len(embeddings) == 0 {
		embeddings = []AIEmbeddingConfig{{}}
	}
	resolved := embeddings[0].WithDefaults(c.AI)
	if resolved.Provider == "" || resolved.Model == "" {
		return
	}
	providerType, unique := c.embeddingProviderType(resolved.Provider)
	if !unique {
		return
	}
	dimensions := defaultEmbeddingDimensions(providerType, resolved.Model)
	if dimensions == 0 {
		return
	}
	providers := make([]string, 0, len(embeddings))
	seen := make(map[string]struct{}, len(embeddings))
	for _, embedding := range embeddings {
		candidate := embedding.WithDefaults(c.AI)
		if candidate.Model != resolved.Model {
			continue
		}
		if _, exists := seen[candidate.Provider]; exists {
			continue
		}
		if _, compatible := c.embeddingProviderType(candidate.Provider); !compatible {
			continue
		}
		seen[candidate.Provider] = struct{}{}
		providers = append(providers, candidate.Provider)
	}
	if len(providers) == 0 {
		return
	}
	c.AI.Profiles = []AIProfileConfig{{
		ID:         "default-v2",
		SpaceID:    fmt.Sprintf("%s@mnote-v2-%d", resolved.Model, dimensions),
		Model:      resolved.Model,
		Dimensions: dimensions,
		Providers:  providers,
	}}
}

func (c *Config) embeddingProviderType(name string) (string, bool) {
	var providerType string
	matches := 0
	for _, provider := range c.AIProvider {
		if provider.Name != name {
			continue
		}
		providerType = strings.ToLower(provider.Type)
		matches++
	}
	return providerType, matches == 1
}

func defaultEmbeddingDimensions(providerType, model string) int {
	model = strings.ToLower(strings.TrimSpace(model))
	switch {
	case strings.Contains(model, "text-embedding-004"):
		return 768
	case strings.Contains(model, "gemini-embedding"):
		return 768
	case strings.Contains(model, "text-embedding-3-"):
		return 1536
	case strings.Contains(model, "text-embedding-ada-002"):
		return 1536
	}
	switch providerType {
	case "gemini":
		return 768
	case "openai", "openrouter":
		return 1536
	default:
		return 0
	}
}

func applyAIProfileDefaults(profile *AIProfileConfig, defaultMinScore float64) {
	profile.ID = strings.TrimSpace(profile.ID)
	profile.SpaceID = strings.TrimSpace(profile.SpaceID)
	profile.Model = strings.TrimSpace(profile.Model)
	if profile.Metric == "" {
		profile.Metric = "cosine"
	}
	if profile.ChunkerVersion == 0 {
		profile.ChunkerVersion = 2
	}
	if profile.QueryTaskType == "" {
		profile.QueryTaskType = "RETRIEVAL_QUERY"
	}
	if profile.DocumentTaskType == "" {
		profile.DocumentTaskType = "RETRIEVAL_DOCUMENT"
	}
	if profile.MinScore == nil {
		value := defaultMinScore
		profile.MinScore = &value
	}
	for index := range profile.Providers {
		profile.Providers[index] = strings.TrimSpace(profile.Providers[index])
	}
}

func (c *Config) applyOAuthDefaults() {
	if c.Properties.EnableGithubOauth && len(c.OAuth.Github.Scopes) == 0 {
		c.OAuth.Github.Scopes = []string{"user:email"}
	}
	if c.Properties.EnableGoogleOauth && len(c.OAuth.Google.Scopes) == 0 {
		c.OAuth.Google.Scopes = []string{"openid", "email", "profile"}
	}
}
