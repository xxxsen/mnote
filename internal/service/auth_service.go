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
)

type AuthService struct {
	users         userRepo
	jwtSecret     []byte
	jwtTTL        time.Duration
	verify        *EmailVerificationService
	allowRegister bool
	runtime       Runtime
}

func NewAuthService(
	users userRepo,
	verify *EmailVerificationService,
	secret []byte,
	ttl time.Duration,
	allowRegister bool,
	runtime Runtime,
) *AuthService {
	runtime = prepareRuntime(runtime)
	return &AuthService{
		users: users, verify: verify,
		jwtSecret: secret, jwtTTL: ttl,
		allowRegister: allowRegister,
		runtime:       runtime,
	}
}

func (s *AuthService) Register(
	ctx context.Context, email, plainPassword, code string,
) (*model.User, string, error) {
	if !s.allowRegister {
		return nil, "", appErr.ErrForbidden
	}
	if s.verify == nil {
		return nil, "", appErr.ErrInvalid
	}
	normalized, err := NormalizeEmail(email)
	if err != nil {
		return nil, "", err
	}
	if err := validateNewPassword(plainPassword); err != nil {
		return nil, "", err
	}
	verification, err := s.verify.ValidateRegisterCode(ctx, normalized, code)
	if err != nil {
		return nil, "", err
	}
	hash, err := password.Hash(plainPassword)
	if err != nil {
		return nil, "", fmt.Errorf("hash password: %w", err)
	}
	id, err := s.runtime.IDs.ID()
	if err != nil {
		return nil, "", fmt.Errorf("generate user id: %w", err)
	}
	now := s.runtime.Clock.Now().Unix()
	user := &model.User{
		ID:              id,
		Email:           normalized,
		EmailNormalized: normalized,
		PasswordHash:    hash,
		Ctime:           now,
		Mtime:           now,
	}
	if err := s.runtime.Transactor.WithinTransaction(ctx, func(txCtx context.Context) error {
		exists, err := s.users.HasCanonicalEmail(txCtx, normalized)
		if err != nil {
			return fmt.Errorf("check canonical email: %w", err)
		}
		if exists {
			return appErr.ErrConflict
		}
		if err := s.verify.repo.ConsumeIfUnused(txCtx, verification.ID, now); err != nil {
			return fmt.Errorf("consume verification code: %w", err)
		}
		if err := s.users.Create(txCtx, user); err != nil {
			return fmt.Errorf("create user: %w", err)
		}
		return nil
	}); err != nil {
		return nil, "", fmt.Errorf("register transaction: %w", err)
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
	normalized, err := NormalizeEmail(email)
	if err != nil {
		return err
	}
	exists, err := s.users.HasCanonicalEmail(ctx, normalized)
	if err != nil {
		return fmt.Errorf("check email: %w", err)
	}
	if exists {
		return appErr.ErrConflict
	}
	return s.verify.SendRegisterCode(ctx, normalized)
}

func (s *AuthService) Login(
	ctx context.Context, email, plainPassword string,
) (*model.User, string, error) {
	trimmed := strings.TrimSpace(email)
	normalized, normalizeErr := NormalizeEmail(trimmed)
	if normalizeErr != nil {
		return nil, "", appErr.ErrUnauthorized
	}
	user, err := s.users.GetByNormalizedEmail(ctx, normalized)
	if errors.Is(err, appErr.ErrNotFound) {
		user, err = s.users.GetLegacyByExactEmail(ctx, trimmed)
	}
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
	if err := validateNewPassword(newPassword); err != nil {
		return err
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
	if err := s.users.UpdatePassword(ctx, userID, passwordHash, s.runtime.Clock.Now().Unix()); err != nil {
		return fmt.Errorf("update password: %w", err)
	}
	return nil
}
