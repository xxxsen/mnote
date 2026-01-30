package service

import (
	"context"
	"strings"
	"time"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/oauth"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/jwt"
	"github.com/xxxsen/mnote/internal/pkg/timeutil"
	"github.com/xxxsen/mnote/internal/repo"
)

type OAuthService struct {
	users     *repo.UserRepo
	oauths    *repo.OAuthRepo
	jwtSecret []byte
	jwtTTL    time.Duration
	providers map[string]oauth.Provider
}

func NewOAuthService(users *repo.UserRepo, oauths *repo.OAuthRepo, secret []byte, ttl time.Duration, providers map[string]oauth.Provider) *OAuthService {
	if providers == nil {
		providers = map[string]oauth.Provider{}
	}
	return &OAuthService{
		users:     users,
		oauths:    oauths,
		jwtSecret: secret,
		jwtTTL:    ttl,
		providers: providers,
	}
}

func (s *OAuthService) GetAuthURL(provider, state string) (string, error) {
	impl := s.providers[strings.ToLower(provider)]
	if impl == nil {
		return "", appErr.ErrInvalid
	}
	return impl.AuthURL(state)
}

func (s *OAuthService) ExchangeCode(ctx context.Context, provider, code string) (*oauth.Profile, error) {
	impl := s.providers[strings.ToLower(provider)]
	if impl == nil {
		return nil, appErr.ErrInvalid
	}
	return impl.ExchangeCode(ctx, code)
}

func (s *OAuthService) LoginOrCreate(ctx context.Context, profile *oauth.Profile) (*model.User, string, error) {
	if profile == nil || profile.ProviderUserID == "" || profile.Email == "" || profile.Provider == "" {
		return nil, "", appErr.ErrInvalid
	}
	if account, err := s.oauths.GetByProviderUserID(ctx, profile.Provider, profile.ProviderUserID); err == nil {
		user, err := s.users.GetByID(ctx, account.UserID)
		if err != nil {
			return nil, "", err
		}
		token, err := jwt.GenerateToken(user.ID, s.jwtSecret, s.jwtTTL)
		if err != nil {
			return nil, "", err
		}
		return user, token, nil
	} else if err != appErr.ErrNotFound {
		return nil, "", err
	}
	if _, err := s.users.GetByEmail(ctx, profile.Email); err == nil {
		return nil, "", appErr.ErrConflict
	} else if err != appErr.ErrNotFound {
		return nil, "", err
	}
	now := timeutil.NowUnix()
	user := &model.User{
		ID:           newID(),
		Email:        profile.Email,
		PasswordHash: "",
		Ctime:        now,
		Mtime:        now,
	}
	if err := s.users.Create(ctx, user); err != nil {
		return nil, "", err
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
		return nil, "", err
	}
	token, err := jwt.GenerateToken(user.ID, s.jwtSecret, s.jwtTTL)
	if err != nil {
		return nil, "", err
	}
	return user, token, nil
}

func (s *OAuthService) Bind(ctx context.Context, userID string, profile *oauth.Profile) error {
	if profile == nil || profile.ProviderUserID == "" || profile.Email == "" || profile.Provider == "" {
		return appErr.ErrInvalid
	}
	if account, err := s.oauths.GetByProviderUserID(ctx, profile.Provider, profile.ProviderUserID); err == nil {
		if account.UserID != userID {
			return appErr.ErrConflict
		}
		return nil
	} else if err != appErr.ErrNotFound {
		return err
	}
	if existing, err := s.oauths.GetByUserProvider(ctx, userID, profile.Provider); err == nil {
		if existing.ProviderUserID != profile.ProviderUserID {
			return appErr.ErrConflict
		}
		return nil
	} else if err != appErr.ErrNotFound {
		return err
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
	return s.oauths.Create(ctx, account)
}

func (s *OAuthService) ListBindings(ctx context.Context, userID string) ([]model.OAuthAccount, error) {
	return s.oauths.ListByUser(ctx, userID)
}

func (s *OAuthService) Unbind(ctx context.Context, userID, provider string) error {
	count, err := s.oauths.CountByUser(ctx, userID)
	if err != nil {
		return err
	}
	if count <= 1 {
		user, err := s.users.GetByID(ctx, userID)
		if err != nil {
			return err
		}
		if strings.TrimSpace(user.PasswordHash) == "" {
			return appErr.ErrConflict
		}
	}
	return s.oauths.DeleteByUserProvider(ctx, userID, provider)
}
