package service

import (
	"context"
	"errors"
	"strings"
	"time"

	sqlite "modernc.org/sqlite"
	sqlite3 "modernc.org/sqlite/lib"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/jwt"
	"github.com/xxxsen/mnote/internal/pkg/password"
	"github.com/xxxsen/mnote/internal/pkg/timeutil"
	"github.com/xxxsen/mnote/internal/repo"
)

type AuthService struct {
	users     *repo.UserRepo
	jwtSecret []byte
	jwtTTL    time.Duration
	verify    *EmailVerificationService
}

func NewAuthService(users *repo.UserRepo, verify *EmailVerificationService, secret []byte, ttl time.Duration) *AuthService {
	return &AuthService{users: users, verify: verify, jwtSecret: secret, jwtTTL: ttl}
}

func (s *AuthService) Register(ctx context.Context, email, plainPassword, code string) (*model.User, string, error) {
	now := timeutil.NowUnix()
	if s.verify == nil {
		return nil, "", appErr.ErrInvalid
	}
	if err := s.verify.VerifyRegisterCode(ctx, email, code); err != nil {
		return nil, "", err
	}
	hash, err := password.Hash(plainPassword)
	if err != nil {
		return nil, "", err
	}
	user := &model.User{
		ID:           newID(),
		Email:        email,
		PasswordHash: hash,
		Ctime:        now,
		Mtime:        now,
	}
	if err := s.users.Create(ctx, user); err != nil {
		var sqlErr *sqlite.Error
		if errors.As(err, &sqlErr) {
			if sqlErr.Code() == sqlite3.SQLITE_CONSTRAINT_UNIQUE || sqlErr.Code() == sqlite3.SQLITE_CONSTRAINT {
				return nil, "", appErr.ErrConflict
			}
		}
		return nil, "", err
	}
	token, err := jwt.GenerateToken(user.ID, s.jwtSecret, s.jwtTTL)
	if err != nil {
		return nil, "", err
	}
	return user, token, nil
}

func (s *AuthService) SendRegisterCode(ctx context.Context, email string) error {
	if s.verify == nil {
		return appErr.ErrInvalid
	}
	if _, err := s.users.GetByEmail(ctx, email); err == nil {
		return appErr.ErrConflict
	} else if err != appErr.ErrNotFound {
		return err
	}
	return s.verify.SendRegisterCode(ctx, email)
}

func (s *AuthService) Login(ctx context.Context, email, plainPassword string) (*model.User, string, error) {
	user, err := s.users.GetByEmail(ctx, email)
	if err != nil {
		return nil, "", appErr.ErrUnauthorized
	}
	if err := password.Compare(user.PasswordHash, plainPassword); err != nil {
		return nil, "", appErr.ErrUnauthorized
	}
	token, err := jwt.GenerateToken(user.ID, s.jwtSecret, s.jwtTTL)
	if err != nil {
		return nil, "", err
	}
	return user, token, nil
}

func (s *AuthService) UpdatePassword(ctx context.Context, userID, currentPassword, newPassword string) error {
	newPassword = strings.TrimSpace(newPassword)
	if newPassword == "" {
		return appErr.ErrInvalid
	}
	user, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	if user.PasswordHash != "" {
		if strings.TrimSpace(currentPassword) == "" {
			return appErr.ErrInvalid
		}
		if err := password.Compare(user.PasswordHash, currentPassword); err != nil {
			return appErr.ErrInvalid
		}
	}
	passwordHash, err := password.Hash(newPassword)
	if err != nil {
		return err
	}
	return s.users.UpdatePassword(ctx, userID, passwordHash, timeutil.NowUnix())
}
