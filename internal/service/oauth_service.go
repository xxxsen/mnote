package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/oauth"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/jwt"
	"github.com/xxxsen/mnote/internal/pkg/timeutil"
)

type OAuthService struct {
	users     userRepo
	oauths    oauthRepo
	jwtSecret []byte
	jwtTTL    time.Duration
	providers map[string]oauth.Provider
}

func NewOAuthService(
	users userRepo,
	oauths oauthRepo,
	secret []byte,
	ttl time.Duration,
	providers map[string]oauth.Provider,
) *OAuthService {
	if providers == nil {
		providers = map[string]oauth.Provider{}
	}
	return &OAuthService{
		users: users, oauths: oauths,
		jwtSecret: secret, jwtTTL: ttl,
		providers: providers,
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
	if profile == nil || profile.ProviderUserID == "" ||
		profile.Email == "" || profile.Provider == "" {
		return nil, "", appErr.ErrInvalid
	}

	user, token, err := s.tryExistingOAuth(ctx, profile)
	if err == nil {
		return user, token, nil
	}
	if !errors.Is(err, appErr.ErrNotFound) {
		return nil, "", fmt.Errorf("lookup oauth: %w", err)
	}

	if _, err := s.users.GetByEmail(ctx, profile.Email); err == nil {
		return nil, "", appErr.ErrConflict
	} else if !errors.Is(err, appErr.ErrNotFound) {
		return nil, "", fmt.Errorf("check email: %w", err)
	}

	return s.createOAuthUser(ctx, profile)
}

func (s *OAuthService) tryExistingOAuth(
	ctx context.Context, profile *oauth.Profile,
) (*model.User, string, error) {
	account, err := s.oauths.GetByProviderUserID(
		ctx, profile.Provider, profile.ProviderUserID,
	)
	if err != nil {
		return nil, "", fmt.Errorf("get by provider user: %w", err)
	}
	user, err := s.users.GetByID(ctx, account.UserID)
	if err != nil {
		return nil, "", fmt.Errorf("get user: %w", err)
	}
	token, err := jwt.GenerateToken(
		user.ID, user.Email, s.jwtSecret, s.jwtTTL,
	)
	if err != nil {
		return nil, "", fmt.Errorf("generate token: %w", err)
	}
	return user, token, nil
}

func (s *OAuthService) createOAuthUser(
	ctx context.Context, profile *oauth.Profile,
) (*model.User, string, error) {
	now := timeutil.NowUnix()
	user := &model.User{
		ID:    newID(),
		Email: profile.Email,
		Ctime: now,
		Mtime: now,
	}
	if err := s.users.Create(ctx, user); err != nil {
		return nil, "", fmt.Errorf("create user: %w", err)
	}
	account := &model.OAuthAccount{
		ID:             newID(),
		UserID:         user.ID,
		Provider:       profile.Provider,
		ProviderUserID: profile.ProviderUserID,
		Email:          profile.Email,
		Ctime:          now,
		Mtime:          now,
	}
	if err := s.oauths.Create(ctx, account); err != nil {
		return nil, "", fmt.Errorf("create oauth account: %w", err)
	}
	token, err := jwt.GenerateToken(
		user.ID, user.Email, s.jwtSecret, s.jwtTTL,
	)
	if err != nil {
		return nil, "", fmt.Errorf("generate token: %w", err)
	}
	return user, token, nil
}

func (s *OAuthService) Bind(
	ctx context.Context, userID string, profile *oauth.Profile,
) error {
	if profile == nil || profile.ProviderUserID == "" ||
		profile.Email == "" || profile.Provider == "" {
		return appErr.ErrInvalid
	}
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
	now := timeutil.NowUnix()
	account := &model.OAuthAccount{
		ID:             newID(),
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
	count, err := s.oauths.CountByUser(ctx, userID)
	if err != nil {
		return fmt.Errorf("count bindings: %w", err)
	}
	if count <= 1 {
		user, err := s.users.GetByID(ctx, userID)
		if err != nil {
			return fmt.Errorf("get user: %w", err)
		}
		if strings.TrimSpace(user.PasswordHash) == "" {
			return appErr.ErrConflict
		}
	}
	if err := s.oauths.DeleteByUserProvider(ctx, userID, provider); err != nil {
		return fmt.Errorf("delete binding: %w", err)
	}
	return nil
}
