package service

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/password"
	"github.com/xxxsen/mnote/internal/pkg/timeutil"
)

func TestEmailVerificationService_SendRegisterCode(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		sendCalled := false
		repo := &mockEmailVerificationRepo{
			latestByEmailFn: func(context.Context, string, string) (*model.EmailVerificationCode, error) {
				return nil, appErr.ErrNotFound
			},
			createFn: func(_ context.Context, v *model.EmailVerificationCode) error {
				assert.NotEmpty(t, v.ID)
				assert.Equal(t, "a@b.com", v.Email)
				assert.Equal(t, "register", v.Purpose)
				assert.NotEmpty(t, v.CodeHash)
				return nil
			},
		}
		sender := &funcEmailSender{fn: func(to, subject, _ string) error {
			sendCalled = true
			assert.Equal(t, "a@b.com", to)
			assert.Contains(t, subject, "verification")
			return nil
		}}
		svc := NewEmailVerificationService(repo, sender)
		err := svc.SendRegisterCode(context.Background(), "a@b.com")
		require.NoError(t, err)
		assert.True(t, sendCalled)
	})

	t.Run("empty_email", func(t *testing.T) {
		svc := NewEmailVerificationService(&mockEmailVerificationRepo{}, &mockEmailSender{})
		err := svc.SendRegisterCode(context.Background(), "  ")
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})

	t.Run("cooldown", func(t *testing.T) {
		repo := &mockEmailVerificationRepo{
			latestByEmailFn: func(context.Context, string, string) (*model.EmailVerificationCode, error) {
				return &model.EmailVerificationCode{Ctime: timeutil.NowUnix()}, nil
			},
		}
		svc := NewEmailVerificationService(repo, &mockEmailSender{})
		err := svc.SendRegisterCode(context.Background(), "a@b.com")
		assert.ErrorIs(t, err, appErr.ErrTooMany)
	})

	t.Run("create_error", func(t *testing.T) {
		repo := &mockEmailVerificationRepo{
			latestByEmailFn: func(context.Context, string, string) (*model.EmailVerificationCode, error) {
				return nil, appErr.ErrNotFound
			},
			createFn: func(context.Context, *model.EmailVerificationCode) error {
				return errors.New("db error")
			},
		}
		svc := NewEmailVerificationService(repo, &mockEmailSender{})
		err := svc.SendRegisterCode(context.Background(), "a@b.com")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "create")
	})

	t.Run("send_error", func(t *testing.T) {
		repo := &mockEmailVerificationRepo{
			latestByEmailFn: func(context.Context, string, string) (*model.EmailVerificationCode, error) {
				return nil, appErr.ErrNotFound
			},
			createFn: func(context.Context, *model.EmailVerificationCode) error { return nil },
		}
		sender := &funcEmailSender{fn: func(_, _, _ string) error {
			return errors.New("smtp error")
		}}
		svc := NewEmailVerificationService(repo, sender)
		err := svc.SendRegisterCode(context.Background(), "a@b.com")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "send verification email")
	})
}

func TestEmailVerificationService_VerifyRegisterCode(t *testing.T) {
	hash, _ := password.Hash("123456")

	t.Run("success", func(t *testing.T) {
		markUsedCalled := false
		repo := &mockEmailVerificationRepo{
			latestByEmailFn: func(context.Context, string, string) (*model.EmailVerificationCode, error) {
				return &model.EmailVerificationCode{
					ID:        "v1",
					CodeHash:  hash,
					Used:      0,
					ExpiresAt: timeutil.NowUnix() + 600,
				}, nil
			},
			markUsedFn: func(_ context.Context, id string) error {
				markUsedCalled = true
				assert.Equal(t, "v1", id)
				return nil
			},
		}
		svc := NewEmailVerificationService(repo, &mockEmailSender{})
		err := svc.VerifyRegisterCode(context.Background(), "a@b.com", "123456")
		require.NoError(t, err)
		assert.True(t, markUsedCalled)
	})

	t.Run("empty_email_or_code", func(t *testing.T) {
		svc := NewEmailVerificationService(&mockEmailVerificationRepo{}, &mockEmailSender{})
		assert.ErrorIs(t, svc.VerifyRegisterCode(context.Background(), "", "123456"), appErr.ErrInvalid)
		assert.ErrorIs(t, svc.VerifyRegisterCode(context.Background(), "a@b.com", ""), appErr.ErrInvalid)
	})

	t.Run("already_used", func(t *testing.T) {
		repo := &mockEmailVerificationRepo{
			latestByEmailFn: func(context.Context, string, string) (*model.EmailVerificationCode, error) {
				return &model.EmailVerificationCode{Used: 1, ExpiresAt: timeutil.NowUnix() + 600, CodeHash: hash}, nil
			},
		}
		svc := NewEmailVerificationService(repo, &mockEmailSender{})
		err := svc.VerifyRegisterCode(context.Background(), "a@b.com", "123456")
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})

	t.Run("expired", func(t *testing.T) {
		repo := &mockEmailVerificationRepo{
			latestByEmailFn: func(context.Context, string, string) (*model.EmailVerificationCode, error) {
				return &model.EmailVerificationCode{Used: 0, ExpiresAt: timeutil.NowUnix() - 1, CodeHash: hash}, nil
			},
		}
		svc := NewEmailVerificationService(repo, &mockEmailSender{})
		err := svc.VerifyRegisterCode(context.Background(), "a@b.com", "123456")
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})

	t.Run("wrong_code", func(t *testing.T) {
		repo := &mockEmailVerificationRepo{
			latestByEmailFn: func(context.Context, string, string) (*model.EmailVerificationCode, error) {
				return &model.EmailVerificationCode{Used: 0, ExpiresAt: timeutil.NowUnix() + 600, CodeHash: hash}, nil
			},
		}
		svc := NewEmailVerificationService(repo, &mockEmailSender{})
		err := svc.VerifyRegisterCode(context.Background(), "a@b.com", "999999")
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})

	t.Run("not_found", func(t *testing.T) {
		repo := &mockEmailVerificationRepo{
			latestByEmailFn: func(context.Context, string, string) (*model.EmailVerificationCode, error) {
				return nil, appErr.ErrNotFound
			},
		}
		svc := NewEmailVerificationService(repo, &mockEmailSender{})
		err := svc.VerifyRegisterCode(context.Background(), "a@b.com", "123456")
		assert.Error(t, err)
	})

	t.Run("mark_used_error", func(t *testing.T) {
		repo := &mockEmailVerificationRepo{
			latestByEmailFn: func(context.Context, string, string) (*model.EmailVerificationCode, error) {
				return &model.EmailVerificationCode{
					ID: "v1", Used: 0, ExpiresAt: timeutil.NowUnix() + 600, CodeHash: hash,
				}, nil
			},
			markUsedFn: func(context.Context, string) error {
				return errors.New("db error")
			},
		}
		svc := NewEmailVerificationService(repo, &mockEmailSender{})
		err := svc.VerifyRegisterCode(context.Background(), "a@b.com", "123456")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "mark used")
	})
}

func TestEmailVerificationService_EnsureCooldown_DBError(t *testing.T) {
	repo := &mockEmailVerificationRepo{
		latestByEmailFn: func(context.Context, string, string) (*model.EmailVerificationCode, error) {
			return nil, errors.New("db error")
		},
	}
	svc := NewEmailVerificationService(repo, &mockEmailSender{})
	err := svc.SendRegisterCode(context.Background(), "a@b.com")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "ensure cooldown")
}

func TestEmailVerificationService_EnsureCooldown_Passed(t *testing.T) {
	repo := &mockEmailVerificationRepo{
		latestByEmailFn: func(context.Context, string, string) (*model.EmailVerificationCode, error) {
			return &model.EmailVerificationCode{Ctime: timeutil.NowUnix() - 120}, nil
		},
		createFn: func(context.Context, *model.EmailVerificationCode) error { return nil },
	}
	sender := &funcEmailSender{fn: func(_, _, _ string) error { return nil }}
	svc := NewEmailVerificationService(repo, sender)
	err := svc.SendRegisterCode(context.Background(), "a@b.com")
	require.NoError(t, err)
}

type funcEmailSender struct {
	fn func(to, subject, body string) error
}

func (f *funcEmailSender) Send(to, subject, body string) error {
	return f.fn(to, subject, body)
}
