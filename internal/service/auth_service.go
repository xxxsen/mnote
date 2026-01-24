package service

import (
	"context"
	"errors"
	"time"

	sqlite "modernc.org/sqlite"
	sqlite3 "modernc.org/sqlite/lib"

	"mnote/internal/model"
	appErr "mnote/internal/pkg/errors"
	"mnote/internal/pkg/jwt"
	"mnote/internal/pkg/password"
	"mnote/internal/pkg/timeutil"
	"mnote/internal/repo"
)

type AuthService struct {
	users     *repo.UserRepo
	jwtSecret []byte
	jwtTTL    time.Duration
}

func NewAuthService(users *repo.UserRepo, secret []byte, ttl time.Duration) *AuthService {
	return &AuthService{users: users, jwtSecret: secret, jwtTTL: ttl}
}

func (s *AuthService) Register(ctx context.Context, email, plainPassword string) (*model.User, string, error) {
	now := timeutil.NowUnix()
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
