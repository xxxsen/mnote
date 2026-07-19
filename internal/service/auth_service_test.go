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
	createFn            func(ctx context.Context, user *model.User) error
	getByEmailFn        func(ctx context.Context, email string) (*model.User, error)
	hasCanonicalEmailFn func(ctx context.Context, email string) (bool, error)
	getByIDFn           func(ctx context.Context, id string) (*model.User, error)
	updatePasswordFn    func(ctx context.Context, id, passwordHash string, mtime int64) error
}

func (m *mockUserRepo) Create(ctx context.Context, user *model.User) error {
	return m.createFn(ctx, user)
}

func (m *mockUserRepo) GetByEmail(ctx context.Context, email string) (*model.User, error) {
	if m.getByEmailFn == nil {
		return nil, appErr.ErrNotFound
	}
	return m.getByEmailFn(ctx, email)
}

func (m *mockUserRepo) GetByNormalizedEmail(ctx context.Context, email string) (*model.User, error) {
	return m.GetByEmail(ctx, email)
}

func (m *mockUserRepo) GetLegacyByExactEmail(ctx context.Context, email string) (*model.User, error) {
	if m.getByEmailFn == nil {
		return nil, appErr.ErrNotFound
	}
	return m.getByEmailFn(ctx, email)
}

func (m *mockUserRepo) HasCanonicalEmail(ctx context.Context, email string) (bool, error) {
	if m.hasCanonicalEmailFn != nil {
		return m.hasCanonicalEmailFn(ctx, email)
	}
	if m.getByEmailFn == nil {
		return false, nil
	}
	_, err := m.getByEmailFn(ctx, email)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, appErr.ErrNotFound) {
		return false, nil
	}
	return false, err
}

func (m *mockUserRepo) GetByID(ctx context.Context, id string) (*model.User, error) {
	if m.getByIDFn == nil {
		return &model.User{ID: id, PasswordHash: "configured-password"}, nil
	}
	return m.getByIDFn(ctx, id)
}

func (m *mockUserRepo) GetByIDForUpdate(ctx context.Context, id string) (*model.User, error) {
	return m.GetByID(ctx, id)
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
		svc := NewAuthService(users, nil, []byte("test-jwt-secret"), time.Hour, false, testRuntime())
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
		svc := NewAuthService(users, nil, []byte("secret"), time.Hour, false, testRuntime())
		_, _, err := svc.Login(context.Background(), "a@b.com", "wrong")
		assert.ErrorIs(t, err, appErr.ErrUnauthorized)
	})

	t.Run("wrong_password", func(t *testing.T) {
		users := &mockUserRepo{
			getByEmailFn: func(context.Context, string) (*model.User, error) {
				return &model.User{ID: "u1", PasswordHash: hash}, nil
			},
		}
		svc := NewAuthService(users, nil, []byte("secret"), time.Hour, false, testRuntime())
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
		svc := NewAuthService(users, verify, []byte("jwt-secret"), time.Hour, true, testRuntime())
		user, token, err := svc.Register(context.Background(), "a@b.com", "password123", "123456")
		require.NoError(t, err)
		assert.NotEmpty(t, user.ID)
		assert.NotEmpty(t, token)
	})

	t.Run("register_disabled", func(t *testing.T) {
		svc := NewAuthService(&mockUserRepo{}, nil, []byte("secret"), time.Hour, false, testRuntime())
		_, _, err := svc.Register(context.Background(), "a@b.com", "pw", "code")
		assert.ErrorIs(t, err, appErr.ErrForbidden)
	})

	t.Run("nil_verify", func(t *testing.T) {
		svc := NewAuthService(&mockUserRepo{}, nil, []byte("secret"), time.Hour, true, testRuntime())
		_, _, err := svc.Register(context.Background(), "a@b.com", "pw", "code")
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})

	t.Run("verify_fails", func(t *testing.T) {
		verify := newMockVerificationService(appErr.ErrInvalid)
		svc := NewAuthService(&mockUserRepo{}, verify, []byte("secret"), time.Hour, true, testRuntime())
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
		svc := NewAuthService(users, verify, []byte("secret"), time.Hour, true, testRuntime())
		_, _, err := svc.Register(context.Background(), "a@b.com", "password123", "123456")
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
		svc := NewAuthService(users, verify, []byte("secret"), time.Hour, true, testRuntime())
		err := svc.SendRegisterCode(context.Background(), "new@b.com")
		require.NoError(t, err)
	})

	t.Run("register_disabled", func(t *testing.T) {
		svc := NewAuthService(&mockUserRepo{}, nil, []byte("secret"), time.Hour, false, testRuntime())
		err := svc.SendRegisterCode(context.Background(), "a@b.com")
		assert.ErrorIs(t, err, appErr.ErrForbidden)
	})

	t.Run("nil_verify", func(t *testing.T) {
		svc := NewAuthService(&mockUserRepo{}, nil, []byte("secret"), time.Hour, true, testRuntime())
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
		svc := NewAuthService(users, verify, []byte("secret"), time.Hour, true, testRuntime())
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
		svc := NewAuthService(users, verify, []byte("secret"), time.Hour, true, testRuntime())
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
		svc := NewAuthService(users, nil, []byte("secret"), time.Hour, false, testRuntime())
		err := svc.UpdatePassword(context.Background(), "u1", "oldpw", "newpass123")
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
		svc := NewAuthService(users, nil, []byte("secret"), time.Hour, false, testRuntime())
		err := svc.UpdatePassword(context.Background(), "u1", "", "newpass123")
		require.NoError(t, err)
	})

	t.Run("empty_new_password", func(t *testing.T) {
		svc := NewAuthService(&mockUserRepo{}, nil, []byte("secret"), time.Hour, false, testRuntime())
		err := svc.UpdatePassword(context.Background(), "u1", "old", "  ")
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})

	t.Run("wrong_current_password", func(t *testing.T) {
		users := &mockUserRepo{
			getByIDFn: func(context.Context, string) (*model.User, error) {
				return &model.User{ID: "u1", PasswordHash: hash}, nil
			},
		}
		svc := NewAuthService(users, nil, []byte("secret"), time.Hour, false, testRuntime())
		err := svc.UpdatePassword(context.Background(), "u1", "wrongpw", "newpass123")
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})

	t.Run("has_hash_but_empty_current", func(t *testing.T) {
		users := &mockUserRepo{
			getByIDFn: func(context.Context, string) (*model.User, error) {
				return &model.User{ID: "u1", PasswordHash: hash}, nil
			},
		}
		svc := NewAuthService(users, nil, []byte("secret"), time.Hour, false, testRuntime())
		err := svc.UpdatePassword(context.Background(), "u1", "", "newpass123")
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})

	t.Run("get_user_error", func(t *testing.T) {
		users := &mockUserRepo{
			getByIDFn: func(context.Context, string) (*model.User, error) {
				return nil, errors.New("db error")
			},
		}
		svc := NewAuthService(users, nil, []byte("secret"), time.Hour, false, testRuntime())
		err := svc.UpdatePassword(context.Background(), "u1", "old", "newpass123")
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
		svc := NewAuthService(users, nil, []byte("secret"), time.Hour, false, testRuntime())
		err := svc.UpdatePassword(context.Background(), "u1", "oldpw", "newpass123")
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
		sender:  &mockEmailSender{},
		runtime: testRuntime(),
	}
}

type mockEmailSender struct{}

func (m *mockEmailSender) Send(_, _, _ string) error { return nil }

type mockEmailVerificationRepo struct {
	createFn        func(ctx context.Context, v *model.EmailVerificationCode) error
	latestByEmailFn func(ctx context.Context, email, purpose string) (*model.EmailVerificationCode, error)
	markUsedFn      func(ctx context.Context, id string) error
	markStatusFn    func(ctx context.Context, id, status string) error
}

func (m *mockEmailVerificationRepo) Create(ctx context.Context, v *model.EmailVerificationCode) error {
	if m.createFn == nil {
		return nil
	}
	return m.createFn(ctx, v)
}

func (m *mockEmailVerificationRepo) LatestByEmail(ctx context.Context, email, purpose string) (*model.EmailVerificationCode, error) {
	return m.latestByEmailFn(ctx, email, purpose)
}

func (m *mockEmailVerificationRepo) MarkStatus(ctx context.Context, id, status string) error {
	if m.markStatusFn == nil {
		return nil
	}
	return m.markStatusFn(ctx, id, status)
}

func (m *mockEmailVerificationRepo) ConsumeIfUnused(ctx context.Context, id string, _ int64) error {
	if m.markUsedFn == nil {
		return nil
	}
	return m.markUsedFn(ctx, id)
}
