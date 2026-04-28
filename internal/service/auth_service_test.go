package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/password"
)

type mockUserRepo struct {
	createFn         func(ctx context.Context, user *model.User) error
	getByEmailFn     func(ctx context.Context, email string) (*model.User, error)
	getByIDFn        func(ctx context.Context, id string) (*model.User, error)
	updatePasswordFn func(ctx context.Context, id, passwordHash string, mtime int64) error
}

func (m *mockUserRepo) Create(ctx context.Context, user *model.User) error {
	return m.createFn(ctx, user)
}

func (m *mockUserRepo) GetByEmail(ctx context.Context, email string) (*model.User, error) {
	return m.getByEmailFn(ctx, email)
}

func (m *mockUserRepo) GetByID(ctx context.Context, id string) (*model.User, error) {
	return m.getByIDFn(ctx, id)
}

func (m *mockUserRepo) UpdatePassword(ctx context.Context, id, passwordHash string, mtime int64) error {
	return m.updatePasswordFn(ctx, id, passwordHash, mtime)
}

func TestAuthService_Login(t *testing.T) {
	hash, _ := password.Hash("secret123")

	t.Run("success", func(t *testing.T) {
		users := &mockUserRepo{
			getByEmailFn: func(_ context.Context, email string) (*model.User, error) {
				return &model.User{ID: "u1", Email: email, PasswordHash: hash}, nil
			},
		}
		svc := NewAuthService(users, nil, []byte("test-jwt-secret"), time.Hour, false)
		user, token, err := svc.Login(context.Background(), "a@b.com", "secret123")
		require.NoError(t, err)
		assert.Equal(t, "u1", user.ID)
		assert.NotEmpty(t, token)
	})

	t.Run("user_not_found", func(t *testing.T) {
		users := &mockUserRepo{
			getByEmailFn: func(context.Context, string) (*model.User, error) {
				return nil, appErr.ErrNotFound
			},
		}
		svc := NewAuthService(users, nil, []byte("secret"), time.Hour, false)
		_, _, err := svc.Login(context.Background(), "a@b.com", "wrong")
		assert.ErrorIs(t, err, appErr.ErrUnauthorized)
	})

	t.Run("wrong_password", func(t *testing.T) {
		users := &mockUserRepo{
			getByEmailFn: func(context.Context, string) (*model.User, error) {
				return &model.User{ID: "u1", PasswordHash: hash}, nil
			},
		}
		svc := NewAuthService(users, nil, []byte("secret"), time.Hour, false)
		_, _, err := svc.Login(context.Background(), "a@b.com", "wrong-password")
		assert.ErrorIs(t, err, appErr.ErrUnauthorized)
	})
}

func TestAuthService_Register(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		users := &mockUserRepo{
			createFn: func(_ context.Context, user *model.User) error {
				assert.Equal(t, "a@b.com", user.Email)
				assert.NotEmpty(t, user.PasswordHash)
				return nil
			},
		}
		verify := newMockVerificationService(nil)
		svc := NewAuthService(users, verify, []byte("jwt-secret"), time.Hour, true)
		user, token, err := svc.Register(context.Background(), "a@b.com", "password123", "123456")
		require.NoError(t, err)
		assert.NotEmpty(t, user.ID)
		assert.NotEmpty(t, token)
	})

	t.Run("register_disabled", func(t *testing.T) {
		svc := NewAuthService(&mockUserRepo{}, nil, []byte("secret"), time.Hour, false)
		_, _, err := svc.Register(context.Background(), "a@b.com", "pw", "code")
		assert.ErrorIs(t, err, appErr.ErrForbidden)
	})

	t.Run("nil_verify", func(t *testing.T) {
		svc := NewAuthService(&mockUserRepo{}, nil, []byte("secret"), time.Hour, true)
		_, _, err := svc.Register(context.Background(), "a@b.com", "pw", "code")
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})

	t.Run("verify_fails", func(t *testing.T) {
		verify := newMockVerificationService(appErr.ErrInvalid)
		svc := NewAuthService(&mockUserRepo{}, verify, []byte("secret"), time.Hour, true)
		_, _, err := svc.Register(context.Background(), "a@b.com", "pw", "bad-code")
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})

	t.Run("create_user_error", func(t *testing.T) {
		users := &mockUserRepo{
			createFn: func(context.Context, *model.User) error {
				return errors.New("db error")
			},
		}
		verify := newMockVerificationService(nil)
		svc := NewAuthService(users, verify, []byte("secret"), time.Hour, true)
		_, _, err := svc.Register(context.Background(), "a@b.com", "pw", "123456")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "create user")
	})
}

func TestAuthService_SendRegisterCode(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		users := &mockUserRepo{
			getByEmailFn: func(context.Context, string) (*model.User, error) {
				return nil, appErr.ErrNotFound
			},
		}
		verify := newMockVerificationService(nil)
		svc := NewAuthService(users, verify, []byte("secret"), time.Hour, true)
		err := svc.SendRegisterCode(context.Background(), "new@b.com")
		require.NoError(t, err)
	})

	t.Run("register_disabled", func(t *testing.T) {
		svc := NewAuthService(&mockUserRepo{}, nil, []byte("secret"), time.Hour, false)
		err := svc.SendRegisterCode(context.Background(), "a@b.com")
		assert.ErrorIs(t, err, appErr.ErrForbidden)
	})

	t.Run("nil_verify", func(t *testing.T) {
		svc := NewAuthService(&mockUserRepo{}, nil, []byte("secret"), time.Hour, true)
		err := svc.SendRegisterCode(context.Background(), "a@b.com")
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})

	t.Run("email_already_exists", func(t *testing.T) {
		users := &mockUserRepo{
			getByEmailFn: func(context.Context, string) (*model.User, error) {
				return &model.User{ID: "u1"}, nil
			},
		}
		verify := newMockVerificationService(nil)
		svc := NewAuthService(users, verify, []byte("secret"), time.Hour, true)
		err := svc.SendRegisterCode(context.Background(), "exists@b.com")
		assert.ErrorIs(t, err, appErr.ErrConflict)
	})

	t.Run("check_email_error", func(t *testing.T) {
		users := &mockUserRepo{
			getByEmailFn: func(context.Context, string) (*model.User, error) {
				return nil, errors.New("db error")
			},
		}
		verify := newMockVerificationService(nil)
		svc := NewAuthService(users, verify, []byte("secret"), time.Hour, true)
		err := svc.SendRegisterCode(context.Background(), "a@b.com")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "check email")
	})
}

func TestAuthService_UpdatePassword(t *testing.T) {
	hash, _ := password.Hash("oldpw")

	t.Run("success_with_current_pw", func(t *testing.T) {
		users := &mockUserRepo{
			getByIDFn: func(context.Context, string) (*model.User, error) {
				return &model.User{ID: "u1", PasswordHash: hash}, nil
			},
			updatePasswordFn: func(_ context.Context, id, newHash string, _ int64) error {
				assert.Equal(t, "u1", id)
				assert.NotEmpty(t, newHash)
				return nil
			},
		}
		svc := NewAuthService(users, nil, []byte("secret"), time.Hour, false)
		err := svc.UpdatePassword(context.Background(), "u1", "oldpw", "newpw")
		require.NoError(t, err)
	})

	t.Run("oauth_user_no_current_pw", func(t *testing.T) {
		users := &mockUserRepo{
			getByIDFn: func(context.Context, string) (*model.User, error) {
				return &model.User{ID: "u1", PasswordHash: ""}, nil
			},
			updatePasswordFn: func(context.Context, string, string, int64) error {
				return nil
			},
		}
		svc := NewAuthService(users, nil, []byte("secret"), time.Hour, false)
		err := svc.UpdatePassword(context.Background(), "u1", "", "newpw")
		require.NoError(t, err)
	})

	t.Run("empty_new_password", func(t *testing.T) {
		svc := NewAuthService(&mockUserRepo{}, nil, []byte("secret"), time.Hour, false)
		err := svc.UpdatePassword(context.Background(), "u1", "old", "  ")
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})

	t.Run("wrong_current_password", func(t *testing.T) {
		users := &mockUserRepo{
			getByIDFn: func(context.Context, string) (*model.User, error) {
				return &model.User{ID: "u1", PasswordHash: hash}, nil
			},
		}
		svc := NewAuthService(users, nil, []byte("secret"), time.Hour, false)
		err := svc.UpdatePassword(context.Background(), "u1", "wrongpw", "newpw")
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})

	t.Run("has_hash_but_empty_current", func(t *testing.T) {
		users := &mockUserRepo{
			getByIDFn: func(context.Context, string) (*model.User, error) {
				return &model.User{ID: "u1", PasswordHash: hash}, nil
			},
		}
		svc := NewAuthService(users, nil, []byte("secret"), time.Hour, false)
		err := svc.UpdatePassword(context.Background(), "u1", "", "newpw")
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})

	t.Run("get_user_error", func(t *testing.T) {
		users := &mockUserRepo{
			getByIDFn: func(context.Context, string) (*model.User, error) {
				return nil, errors.New("db error")
			},
		}
		svc := NewAuthService(users, nil, []byte("secret"), time.Hour, false)
		err := svc.UpdatePassword(context.Background(), "u1", "old", "new")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "get user")
	})

	t.Run("update_error", func(t *testing.T) {
		users := &mockUserRepo{
			getByIDFn: func(context.Context, string) (*model.User, error) {
				return &model.User{ID: "u1", PasswordHash: hash}, nil
			},
			updatePasswordFn: func(context.Context, string, string, int64) error {
				return errors.New("db error")
			},
		}
		svc := NewAuthService(users, nil, []byte("secret"), time.Hour, false)
		err := svc.UpdatePassword(context.Background(), "u1", "oldpw", "newpw")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "update password")
	})
}

func newMockVerificationService(verifyErr error) *EmailVerificationService {
	return &EmailVerificationService{
		repo: &mockEmailVerificationRepo{
			latestByEmailFn: func(context.Context, string, string) (*model.EmailVerificationCode, error) {
				if verifyErr != nil {
					return nil, verifyErr
				}
				hash, _ := password.Hash("123456")
				return &model.EmailVerificationCode{
					ID:        "v1",
					CodeHash:  hash,
					Used:      0,
					ExpiresAt: 9999999999,
				}, nil
			},
			markUsedFn: func(context.Context, string) error { return nil },
			createFn:   func(context.Context, *model.EmailVerificationCode) error { return nil },
		},
		sender: &mockEmailSender{},
	}
}

type mockEmailSender struct{}

func (m *mockEmailSender) Send(_, _, _ string) error { return nil }

type mockEmailVerificationRepo struct {
	createFn        func(ctx context.Context, v *model.EmailVerificationCode) error
	latestByEmailFn func(ctx context.Context, email, purpose string) (*model.EmailVerificationCode, error)
	markUsedFn      func(ctx context.Context, id string) error
}

func (m *mockEmailVerificationRepo) Create(ctx context.Context, v *model.EmailVerificationCode) error {
	return m.createFn(ctx, v)
}

func (m *mockEmailVerificationRepo) LatestByEmail(ctx context.Context, email, purpose string) (*model.EmailVerificationCode, error) {
	return m.latestByEmailFn(ctx, email, purpose)
}

func (m *mockEmailVerificationRepo) MarkUsed(ctx context.Context, id string) error {
	return m.markUsedFn(ctx, id)
}
