package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/oauth"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/jwt"
)

type OAuthService struct {
	users     userRepo
	oauths    oauthRepo
	jwtSecret []byte
	jwtTTL    time.Duration
	providers map[string]oauth.Provider
	runtime   Runtime
}

func NewOAuthService(
	users userRepo,
	oauths oauthRepo,
	secret []byte,
	ttl time.Duration,
	providers map[string]oauth.Provider,
	runtime Runtime,
) *OAuthService {
	if providers == nil {
		providers = map[string]oauth.Provider{}
	}
	runtime = prepareRuntime(runtime)
	return &OAuthService{
		users: users, oauths: oauths,
		jwtSecret: secret, jwtTTL: ttl,
		providers: providers,
		runtime:   runtime,
	}
}

func (s *OAuthService) GetAuthURL(provider, state string) (string, error) {
	impl := s.providers[strings.ToLower(provider)]
	if impl == nil {
		return "", appErr.ErrInvalid
	}
	url, err := impl.AuthURL(state)
	if err != nil {
		return "", fmt.Errorf("get auth url: %w", err)
	}
	return url, nil
}

func (s *OAuthService) ExchangeCode(
	ctx context.Context, provider, code string,
) (*oauth.Profile, error) {
	impl := s.providers[strings.ToLower(provider)]
	if impl == nil {
		return nil, appErr.ErrInvalid
	}
	profile, err := impl.ExchangeCode(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("exchange code: %w", err)
	}
	return profile, nil
}

func (s *OAuthService) LoginOrCreate(
	ctx context.Context, profile *oauth.Profile,
) (*model.User, string, error) {
	if profile == nil || profile.ProviderUserID == "" || profile.Provider == "" {
		return nil, "", appErr.ErrInvalid
	}
	normalized, err := NormalizeEmail(profile.Email)
	if err != nil {
		return nil, "", err
	}
	profile.Email = normalized
	profile.Provider = strings.ToLower(strings.TrimSpace(profile.Provider))

	user, err := s.tryExistingOAuth(ctx, profile)
	if err == nil {
		return user, "", nil
	}
	if !errors.Is(err, appErr.ErrNotFound) {
		return nil, "", fmt.Errorf("lookup oauth: %w", err)
	}

	exists, err := s.users.HasCanonicalEmail(ctx, normalized)
	if err != nil {
		return nil, "", fmt.Errorf("check email: %w", err)
	}
	if exists {
		return nil, "", appErr.ErrConflict
	}

	return s.createOAuthUser(ctx, profile)
}

func (s *OAuthService) tryExistingOAuth(
	ctx context.Context, profile *oauth.Profile,
) (*model.User, error) {
	account, err := s.oauths.GetByProviderUserID(
		ctx, profile.Provider, profile.ProviderUserID,
	)
	if err != nil {
		return nil, fmt.Errorf("get by provider user: %w", err)
	}
	user, err := s.users.GetByID(ctx, account.UserID)
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}
	return user, nil
}

func (s *OAuthService) createOAuthUser(
	ctx context.Context, profile *oauth.Profile,
) (*model.User, string, error) {
	userID, err := s.runtime.IDs.ID()
	if err != nil {
		return nil, "", fmt.Errorf("generate user id: %w", err)
	}
	accountID, err := s.runtime.IDs.ID()
	if err != nil {
		return nil, "", fmt.Errorf("generate oauth account id: %w", err)
	}
	now := s.runtime.Clock.Now().Unix()
	user := &model.User{
		ID: userID, Email: profile.Email, EmailNormalized: profile.Email,
		Ctime: now, Mtime: now,
	}
	account := &model.OAuthAccount{
		ID:             accountID,
		UserID:         user.ID,
		Provider:       profile.Provider,
		ProviderUserID: profile.ProviderUserID,
		Email:          profile.Email,
		Ctime:          now,
		Mtime:          now,
	}
	if err := s.runtime.Transactor.WithinTransaction(ctx, func(txCtx context.Context) error {
		exists, err := s.users.HasCanonicalEmail(txCtx, profile.Email)
		if err != nil {
			return fmt.Errorf("check canonical email: %w", err)
		}
		if exists {
			return appErr.ErrConflict
		}
		if err := s.users.Create(txCtx, user); err != nil {
			return fmt.Errorf("create user: %w", err)
		}
		if err := s.oauths.Create(txCtx, account); err != nil {
			return fmt.Errorf("create oauth account: %w", err)
		}
		return nil
	}); err != nil {
		return nil, "", fmt.Errorf("create oauth user transaction: %w", err)
	}
	return user, "", nil
}

func (s *OAuthService) Bind(
	ctx context.Context, userID string, profile *oauth.Profile,
) error {
	if profile == nil || profile.ProviderUserID == "" || profile.Provider == "" {
		return appErr.ErrInvalid
	}
	normalized, err := NormalizeEmail(profile.Email)
	if err != nil {
		return err
	}
	profile.Email = normalized
	profile.Provider = strings.ToLower(strings.TrimSpace(profile.Provider))
	if account, err := s.oauths.GetByProviderUserID(
		ctx, profile.Provider, profile.ProviderUserID,
	); err == nil {
		if account.UserID != userID {
			return appErr.ErrConflict
		}
		return nil
	} else if !errors.Is(err, appErr.ErrNotFound) {
		return fmt.Errorf("get by provider user: %w", err)
	}
	if existing, err := s.oauths.GetByUserProvider(
		ctx, userID, profile.Provider,
	); err == nil {
		if existing.ProviderUserID != profile.ProviderUserID {
			return appErr.ErrConflict
		}
		return nil
	} else if !errors.Is(err, appErr.ErrNotFound) {
		return fmt.Errorf("get by user provider: %w", err)
	}
	accountID, err := s.runtime.IDs.ID()
	if err != nil {
		return fmt.Errorf("generate oauth account id: %w", err)
	}
	now := s.runtime.Clock.Now().Unix()
	account := &model.OAuthAccount{
		ID:             accountID,
		UserID:         userID,
		Provider:       profile.Provider,
		ProviderUserID: profile.ProviderUserID,
		Email:          profile.Email,
		Ctime:          now,
		Mtime:          now,
	}
	if err := s.oauths.Create(ctx, account); err != nil {
		return fmt.Errorf("create oauth account: %w", err)
	}
	return nil
}

func (s *OAuthService) ListBindings(
	ctx context.Context, userID string,
) ([]model.OAuthAccount, error) {
	accounts, err := s.oauths.ListByUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list bindings: %w", err)
	}
	return accounts, nil
}

func (s *OAuthService) Unbind(ctx context.Context, userID, provider string) error {
	provider = strings.ToLower(strings.TrimSpace(provider))
	err := s.runtime.Transactor.WithinTransaction(ctx, func(txCtx context.Context) error {
		user, err := s.users.GetByIDForUpdate(txCtx, userID)
		if err != nil {
			return fmt.Errorf("get user: %w", err)
		}
		count, err := s.oauths.CountByUser(txCtx, userID)
		if err != nil {
			return fmt.Errorf("count bindings: %w", err)
		}
		if count <= 1 &&
			strings.TrimSpace(user.PasswordHash) == "" {
			return appErr.ErrConflict
		}
		if err := s.oauths.DeleteByUserProvider(txCtx, userID, provider); err != nil {
			return fmt.Errorf("delete binding: %w", err)
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("unbind oauth transaction: %w", err)
	}
	return nil
}

type OAuthState struct {
	Provider string
	Purpose  string
	UserID   string
	ReturnTo string
}

type OAuthExchange struct {
	Token string
	Email string
}

func (s *OAuthService) CreateState(
	ctx context.Context, provider, purpose, userID, returnTo string,
) (string, error) {
	provider = strings.ToLower(strings.TrimSpace(provider))
	if s.providers[provider] == nil ||
		(purpose != "login" && purpose != "bind") ||
		(purpose == "bind" && userID == "") {
		return "", appErr.ErrInvalid
	}
	raw, err := s.runtime.IDs.Token(16)
	if err != nil {
		return "", fmt.Errorf("generate oauth state: %w", err)
	}
	now := s.runtime.Clock.Now().Unix()
	if err := s.oauths.CreateOneTimeToken(ctx, &model.OAuthOneTimeToken{
		Kind: "state", Digest: oauthTokenDigest(raw), Purpose: purpose,
		Provider: provider, UserID: userID, ReturnTo: returnTo,
		ExpiresAt: now + 10*60, Ctime: now,
	}); err != nil {
		return "", fmt.Errorf("store oauth state: %w", err)
	}
	return raw, nil
}

func (s *OAuthService) ConsumeState(ctx context.Context, raw string) (*OAuthState, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, appErr.ErrInvalid
	}
	item, err := s.oauths.ConsumeOneTimeToken(
		ctx, "state", oauthTokenDigest(raw), s.runtime.Clock.Now().Unix(),
	)
	if err != nil {
		if errors.Is(err, appErr.ErrNotFound) {
			return nil, appErr.ErrInvalid
		}
		return nil, fmt.Errorf("consume oauth state: %w", err)
	}
	return &OAuthState{
		Provider: item.Provider, Purpose: item.Purpose,
		UserID: item.UserID, ReturnTo: item.ReturnTo,
	}, nil
}

func (s *OAuthService) CreateExchange(ctx context.Context, user *model.User) (string, error) {
	if user == nil || user.ID == "" {
		return "", appErr.ErrInvalid
	}
	normalized, err := NormalizeEmail(user.Email)
	if err != nil {
		return "", err
	}
	raw, err := s.runtime.IDs.Token(16)
	if err != nil {
		return "", fmt.Errorf("generate oauth exchange: %w", err)
	}
	now := s.runtime.Clock.Now().Unix()
	if err := s.oauths.CreateOneTimeToken(ctx, &model.OAuthOneTimeToken{
		Kind: "exchange", Digest: oauthTokenDigest(raw), Purpose: "login",
		UserID: user.ID, EmailNormalized: normalized,
		ExpiresAt: now + 60, Ctime: now,
	}); err != nil {
		return "", fmt.Errorf("store oauth exchange: %w", err)
	}
	return raw, nil
}

func (s *OAuthService) ConsumeExchange(ctx context.Context, raw string) (*OAuthExchange, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, appErr.ErrInvalid
	}
	item, err := s.oauths.ConsumeOneTimeToken(
		ctx, "exchange", oauthTokenDigest(raw), s.runtime.Clock.Now().Unix(),
	)
	if err != nil {
		if errors.Is(err, appErr.ErrNotFound) {
			return nil, appErr.ErrInvalid
		}
		return nil, fmt.Errorf("consume oauth exchange: %w", err)
	}
	token, err := jwt.GenerateToken(item.UserID, item.EmailNormalized, s.jwtSecret, s.jwtTTL)
	if err != nil {
		return nil, fmt.Errorf("generate token: %w", err)
	}
	return &OAuthExchange{Token: token, Email: item.EmailNormalized}, nil
}

func oauthTokenDigest(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
