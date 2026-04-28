package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/jwt"
	"github.com/xxxsen/mnote/internal/pkg/password"
	"github.com/xxxsen/mnote/internal/pkg/timeutil"
)

type AuthService struct {
	users         userRepo
	jwtSecret     []byte
	jwtTTL        time.Duration
	verify        *EmailVerificationService
	allowRegister bool
}

func NewAuthService(
	users userRepo,
	verify *EmailVerificationService,
	secret []byte,
	ttl time.Duration,
	allowRegister bool,
) *AuthService {
	return &AuthService{
		users: users, verify: verify,
		jwtSecret: secret, jwtTTL: ttl,
		allowRegister: allowRegister,
	}
}

func (s *AuthService) Register(
	ctx context.Context, email, plainPassword, code string,
) (*model.User, string, error) {
	now := timeutil.NowUnix()
	if !s.allowRegister {
		return nil, "", appErr.ErrForbidden
	}
	if s.verify == nil {
		return nil, "", appErr.ErrInvalid
	}
	if err := s.verify.VerifyRegisterCode(ctx, email, code); err != nil {
		return nil, "", err
	}
	hash, err := password.Hash(plainPassword)
	if err != nil {
		return nil, "", fmt.Errorf("hash password: %w", err)
	}
	user := &model.User{
		ID:           newID(),
		Email:        email,
		PasswordHash: hash,
		Ctime:        now,
		Mtime:        now,
	}
	if err := s.users.Create(ctx, user); err != nil {
		return nil, "", fmt.Errorf("create user: %w", err)
	}
	token, err := jwt.GenerateToken(user.ID, user.Email, s.jwtSecret, s.jwtTTL)
	if err != nil {
		return nil, "", fmt.Errorf("generate token: %w", err)
	}
	return user, token, nil
}

func (s *AuthService) SendRegisterCode(ctx context.Context, email string) error {
	if !s.allowRegister {
		return appErr.ErrForbidden
	}
	if s.verify == nil {
		return appErr.ErrInvalid
	}
	if _, err := s.users.GetByEmail(ctx, email); err == nil {
		return appErr.ErrConflict
	} else if !errors.Is(err, appErr.ErrNotFound) {
		return fmt.Errorf("check email: %w", err)
	}
	return s.verify.SendRegisterCode(ctx, email)
}

func (s *AuthService) Login(
	ctx context.Context, email, plainPassword string,
) (*model.User, string, error) {
	user, err := s.users.GetByEmail(ctx, email)
	if err != nil {
		return nil, "", appErr.ErrUnauthorized
	}
	if err := password.Compare(user.PasswordHash, plainPassword); err != nil {
		return nil, "", appErr.ErrUnauthorized
	}
	token, err := jwt.GenerateToken(user.ID, user.Email, s.jwtSecret, s.jwtTTL)
	if err != nil {
		return nil, "", fmt.Errorf("generate token: %w", err)
	}
	return user, token, nil
}

func (s *AuthService) UpdatePassword(
	ctx context.Context, userID, currentPassword, newPassword string,
) error {
	newPassword = strings.TrimSpace(newPassword)
	if newPassword == "" {
		return appErr.ErrInvalid
	}
	user, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return fmt.Errorf("get user: %w", err)
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
		return fmt.Errorf("hash password: %w", err)
	}
	if err := s.users.UpdatePassword(ctx, userID, passwordHash, timeutil.NowUnix()); err != nil {
		return fmt.Errorf("update password: %w", err)
	}
	return nil
}
