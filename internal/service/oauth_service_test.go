package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/oauth"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

type mockOAuthRepo struct {
	createFn               func(ctx context.Context, account *model.OAuthAccount) error
	getByProviderUserIDFn  func(ctx context.Context, provider, providerUserID string) (*model.OAuthAccount, error)
	getByUserProviderFn    func(ctx context.Context, userID, provider string) (*model.OAuthAccount, error)
	listByUserFn           func(ctx context.Context, userID string) ([]model.OAuthAccount, error)
	countByUserFn          func(ctx context.Context, userID string) (int, error)
	deleteByUserProviderFn func(ctx context.Context, userID, provider string) error
}

func (m *mockOAuthRepo) Create(ctx context.Context, account *model.OAuthAccount) error {
	return m.createFn(ctx, account)
}

func (m *mockOAuthRepo) GetByProviderUserID(ctx context.Context, provider, providerUserID string) (*model.OAuthAccount, error) {
	return m.getByProviderUserIDFn(ctx, provider, providerUserID)
}

func (m *mockOAuthRepo) GetByUserProvider(ctx context.Context, userID, provider string) (*model.OAuthAccount, error) {
	return m.getByUserProviderFn(ctx, userID, provider)
}

func (m *mockOAuthRepo) ListByUser(ctx context.Context, userID string) ([]model.OAuthAccount, error) {
	return m.listByUserFn(ctx, userID)
}

func (m *mockOAuthRepo) CountByUser(ctx context.Context, userID string) (int, error) {
	return m.countByUserFn(ctx, userID)
}

func (m *mockOAuthRepo) DeleteByUserProvider(ctx context.Context, userID, provider string) error {
	return m.deleteByUserProviderFn(ctx, userID, provider)
}

type mockOAuthProvider struct {
	authURLFn      func(state string) (string, error)
	exchangeCodeFn func(ctx context.Context, code string) (*oauth.Profile, error)
}

func (m *mockOAuthProvider) Name() string                         { return "mock" }
func (m *mockOAuthProvider) AuthURL(state string) (string, error) { return m.authURLFn(state) }
func (m *mockOAuthProvider) ExchangeCode(ctx context.Context, code string) (*oauth.Profile, error) {
	return m.exchangeCodeFn(ctx, code)
}

func newOAuthSvc(users userRepo, oauths oauthRepo, providers map[string]oauth.Provider) *OAuthService {
	return NewOAuthService(users, oauths, []byte("test-jwt"), time.Hour, providers)
}

func TestOAuthService_GetAuthURL(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		p := &mockOAuthProvider{
			authURLFn: func(state string) (string, error) {
				return "https://auth.example.com?state=" + state, nil
			},
		}
		svc := newOAuthSvc(nil, nil, map[string]oauth.Provider{"github": p})
		url, err := svc.GetAuthURL("github", "abc")
		require.NoError(t, err)
		assert.Contains(t, url, "abc")
	})

	t.Run("unknown_provider", func(t *testing.T) {
		svc := newOAuthSvc(nil, nil, nil)
		_, err := svc.GetAuthURL("unknown", "abc")
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})

	t.Run("provider_error", func(t *testing.T) {
		p := &mockOAuthProvider{
			authURLFn: func(_ string) (string, error) { return "", errors.New("fail") },
		}
		svc := newOAuthSvc(nil, nil, map[string]oauth.Provider{"github": p})
		_, err := svc.GetAuthURL("github", "abc")
		assert.Error(t, err)
	})
}

func TestOAuthService_ExchangeCode(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		profile := &oauth.Profile{Provider: "github", Email: "a@b.com", ProviderUserID: "g123"}
		p := &mockOAuthProvider{
			exchangeCodeFn: func(context.Context, string) (*oauth.Profile, error) {
				return profile, nil
			},
		}
		svc := newOAuthSvc(nil, nil, map[string]oauth.Provider{"github": p})
		result, err := svc.ExchangeCode(context.Background(), "github", "code123")
		require.NoError(t, err)
		assert.Equal(t, "a@b.com", result.Email)
	})

	t.Run("unknown_provider", func(t *testing.T) {
		svc := newOAuthSvc(nil, nil, nil)
		_, err := svc.ExchangeCode(context.Background(), "unknown", "code")
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})
}

func TestOAuthService_LoginOrCreate(t *testing.T) {
	profile := &oauth.Profile{Provider: "github", Email: "a@b.com", ProviderUserID: "g123"}

	t.Run("existing_oauth_user", func(t *testing.T) {
		oauths := &mockOAuthRepo{
			getByProviderUserIDFn: func(context.Context, string, string) (*model.OAuthAccount, error) {
				return &model.OAuthAccount{UserID: "u1"}, nil
			},
		}
		users := &mockUserRepo{
			getByIDFn: func(context.Context, string) (*model.User, error) {
				return &model.User{ID: "u1", Email: "a@b.com"}, nil
			},
		}
		svc := newOAuthSvc(users, oauths, nil)
		user, token, err := svc.LoginOrCreate(context.Background(), profile)
		require.NoError(t, err)
		assert.Equal(t, "u1", user.ID)
		assert.NotEmpty(t, token)
	})

	t.Run("new_user", func(t *testing.T) {
		oauths := &mockOAuthRepo{
			getByProviderUserIDFn: func(context.Context, string, string) (*model.OAuthAccount, error) {
				return nil, appErr.ErrNotFound
			},
			createFn: func(context.Context, *model.OAuthAccount) error { return nil },
		}
		users := &mockUserRepo{
			getByEmailFn: func(context.Context, string) (*model.User, error) {
				return nil, appErr.ErrNotFound
			},
			createFn: func(context.Context, *model.User) error { return nil },
		}
		svc := newOAuthSvc(users, oauths, nil)
		user, token, err := svc.LoginOrCreate(context.Background(), profile)
		require.NoError(t, err)
		assert.NotEmpty(t, user.ID)
		assert.NotEmpty(t, token)
	})

	t.Run("email_conflict", func(t *testing.T) {
		oauths := &mockOAuthRepo{
			getByProviderUserIDFn: func(context.Context, string, string) (*model.OAuthAccount, error) {
				return nil, appErr.ErrNotFound
			},
		}
		users := &mockUserRepo{
			getByEmailFn: func(context.Context, string) (*model.User, error) {
				return &model.User{ID: "existing"}, nil
			},
		}
		svc := newOAuthSvc(users, oauths, nil)
		_, _, err := svc.LoginOrCreate(context.Background(), profile)
		assert.ErrorIs(t, err, appErr.ErrConflict)
	})

	t.Run("nil_profile", func(t *testing.T) {
		svc := newOAuthSvc(nil, nil, nil)
		_, _, err := svc.LoginOrCreate(context.Background(), nil)
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})

	t.Run("empty_provider_user_id", func(t *testing.T) {
		svc := newOAuthSvc(nil, nil, nil)
		_, _, err := svc.LoginOrCreate(context.Background(), &oauth.Profile{Email: "a@b.com", Provider: "github"})
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})
}

func TestOAuthService_Bind(t *testing.T) {
	profile := &oauth.Profile{Provider: "github", Email: "a@b.com", ProviderUserID: "g123"}

	t.Run("success_new_binding", func(t *testing.T) {
		oauths := &mockOAuthRepo{
			getByProviderUserIDFn: func(context.Context, string, string) (*model.OAuthAccount, error) {
				return nil, appErr.ErrNotFound
			},
			getByUserProviderFn: func(context.Context, string, string) (*model.OAuthAccount, error) {
				return nil, appErr.ErrNotFound
			},
			createFn: func(_ context.Context, account *model.OAuthAccount) error {
				assert.Equal(t, "u1", account.UserID)
				return nil
			},
		}
		svc := newOAuthSvc(nil, oauths, nil)
		err := svc.Bind(context.Background(), "u1", profile)
		require.NoError(t, err)
	})

	t.Run("already_bound_same_user", func(t *testing.T) {
		oauths := &mockOAuthRepo{
			getByProviderUserIDFn: func(context.Context, string, string) (*model.OAuthAccount, error) {
				return &model.OAuthAccount{UserID: "u1"}, nil
			},
		}
		svc := newOAuthSvc(nil, oauths, nil)
		err := svc.Bind(context.Background(), "u1", profile)
		require.NoError(t, err)
	})

	t.Run("already_bound_different_user", func(t *testing.T) {
		oauths := &mockOAuthRepo{
			getByProviderUserIDFn: func(context.Context, string, string) (*model.OAuthAccount, error) {
				return &model.OAuthAccount{UserID: "other-user"}, nil
			},
		}
		svc := newOAuthSvc(nil, oauths, nil)
		err := svc.Bind(context.Background(), "u1", profile)
		assert.ErrorIs(t, err, appErr.ErrConflict)
	})

	t.Run("user_already_has_provider", func(t *testing.T) {
		oauths := &mockOAuthRepo{
			getByProviderUserIDFn: func(context.Context, string, string) (*model.OAuthAccount, error) {
				return nil, appErr.ErrNotFound
			},
			getByUserProviderFn: func(context.Context, string, string) (*model.OAuthAccount, error) {
				return &model.OAuthAccount{ProviderUserID: "different-id"}, nil
			},
		}
		svc := newOAuthSvc(nil, oauths, nil)
		err := svc.Bind(context.Background(), "u1", profile)
		assert.ErrorIs(t, err, appErr.ErrConflict)
	})

	t.Run("nil_profile", func(t *testing.T) {
		svc := newOAuthSvc(nil, nil, nil)
		err := svc.Bind(context.Background(), "u1", nil)
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})
}

func TestOAuthService_ListBindings(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		oauths := &mockOAuthRepo{
			listByUserFn: func(context.Context, string) ([]model.OAuthAccount, error) {
				return []model.OAuthAccount{{Provider: "github"}}, nil
			},
		}
		svc := newOAuthSvc(nil, oauths, nil)
		result, err := svc.ListBindings(context.Background(), "u1")
		require.NoError(t, err)
		assert.Len(t, result, 1)
	})

	t.Run("error", func(t *testing.T) {
		oauths := &mockOAuthRepo{
			listByUserFn: func(context.Context, string) ([]model.OAuthAccount, error) {
				return nil, errors.New("db error")
			},
		}
		svc := newOAuthSvc(nil, oauths, nil)
		_, err := svc.ListBindings(context.Background(), "u1")
		assert.Error(t, err)
	})
}

func TestOAuthService_Unbind(t *testing.T) {
	t.Run("success_multiple_bindings", func(t *testing.T) {
		oauths := &mockOAuthRepo{
			countByUserFn:          func(context.Context, string) (int, error) { return 2, nil },
			deleteByUserProviderFn: func(context.Context, string, string) error { return nil },
		}
		svc := newOAuthSvc(nil, oauths, nil)
		err := svc.Unbind(context.Background(), "u1", "github")
		require.NoError(t, err)
	})

	t.Run("last_binding_with_password", func(t *testing.T) {
		oauths := &mockOAuthRepo{
			countByUserFn:          func(context.Context, string) (int, error) { return 1, nil },
			deleteByUserProviderFn: func(context.Context, string, string) error { return nil },
		}
		users := &mockUserRepo{
			getByIDFn: func(context.Context, string) (*model.User, error) {
				return &model.User{ID: "u1", PasswordHash: "$2a$..."}, nil
			},
		}
		svc := newOAuthSvc(users, oauths, nil)
		err := svc.Unbind(context.Background(), "u1", "github")
		require.NoError(t, err)
	})

	t.Run("last_binding_no_password", func(t *testing.T) {
		oauths := &mockOAuthRepo{
			countByUserFn: func(context.Context, string) (int, error) { return 1, nil },
		}
		users := &mockUserRepo{
			getByIDFn: func(context.Context, string) (*model.User, error) {
				return &model.User{ID: "u1", PasswordHash: ""}, nil
			},
		}
		svc := newOAuthSvc(users, oauths, nil)
		err := svc.Unbind(context.Background(), "u1", "github")
		assert.ErrorIs(t, err, appErr.ErrConflict)
	})

	t.Run("count_error", func(t *testing.T) {
		oauths := &mockOAuthRepo{
			countByUserFn: func(context.Context, string) (int, error) { return 0, errors.New("db error") },
		}
		svc := newOAuthSvc(nil, oauths, nil)
		err := svc.Unbind(context.Background(), "u1", "github")
		assert.Error(t, err)
	})

	t.Run("get_user_error", func(t *testing.T) {
		oauths := &mockOAuthRepo{
			countByUserFn: func(context.Context, string) (int, error) { return 1, nil },
		}
		users := &mockUserRepo{
			getByIDFn: func(context.Context, string) (*model.User, error) { return nil, errors.New("db error") },
		}
		svc := newOAuthSvc(users, oauths, nil)
		err := svc.Unbind(context.Background(), "u1", "github")
		assert.Error(t, err)
	})

	t.Run("delete_error", func(t *testing.T) {
		oauths := &mockOAuthRepo{
			countByUserFn:          func(context.Context, string) (int, error) { return 2, nil },
			deleteByUserProviderFn: func(context.Context, string, string) error { return errors.New("db error") },
		}
		svc := newOAuthSvc(nil, oauths, nil)
		err := svc.Unbind(context.Background(), "u1", "github")
		assert.Error(t, err)
	})
}

func TestOAuthService_ExchangeCode_ProviderError(t *testing.T) {
	p := &mockOAuthProvider{
		exchangeCodeFn: func(context.Context, string) (*oauth.Profile, error) {
			return nil, errors.New("exchange fail")
		},
	}
	svc := newOAuthSvc(nil, nil, map[string]oauth.Provider{"github": p})
	_, err := svc.ExchangeCode(context.Background(), "github", "code")
	assert.Error(t, err)
}

func TestOAuthService_LoginOrCreate_LookupError(t *testing.T) {
	profile := &oauth.Profile{Provider: "github", Email: "a@b.com", ProviderUserID: "g123"}
	oauths := &mockOAuthRepo{
		getByProviderUserIDFn: func(context.Context, string, string) (*model.OAuthAccount, error) {
			return nil, errors.New("db error")
		},
	}
	svc := newOAuthSvc(nil, oauths, nil)
	_, _, err := svc.LoginOrCreate(context.Background(), profile)
	assert.Error(t, err)
}

func TestOAuthService_LoginOrCreate_CheckEmailError(t *testing.T) {
	profile := &oauth.Profile{Provider: "github", Email: "a@b.com", ProviderUserID: "g123"}
	oauths := &mockOAuthRepo{
		getByProviderUserIDFn: func(context.Context, string, string) (*model.OAuthAccount, error) {
			return nil, appErr.ErrNotFound
		},
	}
	users := &mockUserRepo{
		getByEmailFn: func(context.Context, string) (*model.User, error) { return nil, errors.New("db error") },
	}
	svc := newOAuthSvc(users, oauths, nil)
	_, _, err := svc.LoginOrCreate(context.Background(), profile)
	assert.Error(t, err)
}

func TestOAuthService_LoginOrCreate_CreateUserError(t *testing.T) {
	profile := &oauth.Profile{Provider: "github", Email: "a@b.com", ProviderUserID: "g123"}
	oauths := &mockOAuthRepo{
		getByProviderUserIDFn: func(context.Context, string, string) (*model.OAuthAccount, error) {
			return nil, appErr.ErrNotFound
		},
	}
	users := &mockUserRepo{
		getByEmailFn: func(context.Context, string) (*model.User, error) { return nil, appErr.ErrNotFound },
		createFn:     func(context.Context, *model.User) error { return errors.New("db error") },
	}
	svc := newOAuthSvc(users, oauths, nil)
	_, _, err := svc.LoginOrCreate(context.Background(), profile)
	assert.Error(t, err)
}

func TestOAuthService_LoginOrCreate_CreateOAuthError(t *testing.T) {
	profile := &oauth.Profile{Provider: "github", Email: "a@b.com", ProviderUserID: "g123"}
	oauths := &mockOAuthRepo{
		getByProviderUserIDFn: func(context.Context, string, string) (*model.OAuthAccount, error) {
			return nil, appErr.ErrNotFound
		},
		createFn: func(context.Context, *model.OAuthAccount) error { return errors.New("db error") },
	}
	users := &mockUserRepo{
		getByEmailFn: func(context.Context, string) (*model.User, error) { return nil, appErr.ErrNotFound },
		createFn:     func(context.Context, *model.User) error { return nil },
	}
	svc := newOAuthSvc(users, oauths, nil)
	_, _, err := svc.LoginOrCreate(context.Background(), profile)
	assert.Error(t, err)
}

func TestOAuthService_TryExistingOAuth_UserError(t *testing.T) {
	profile := &oauth.Profile{Provider: "github", Email: "a@b.com", ProviderUserID: "g123"}
	oauths := &mockOAuthRepo{
		getByProviderUserIDFn: func(context.Context, string, string) (*model.OAuthAccount, error) {
			return &model.OAuthAccount{UserID: "u1"}, nil
		},
	}
	users := &mockUserRepo{
		getByIDFn: func(context.Context, string) (*model.User, error) { return nil, errors.New("db error") },
	}
	svc := newOAuthSvc(users, oauths, nil)
	_, _, err := svc.LoginOrCreate(context.Background(), profile)
	assert.Error(t, err)
}

func TestOAuthService_Bind_ProviderIDError(t *testing.T) {
	profile := &oauth.Profile{Provider: "github", Email: "a@b.com", ProviderUserID: "g123"}
	oauths := &mockOAuthRepo{
		getByProviderUserIDFn: func(context.Context, string, string) (*model.OAuthAccount, error) {
			return nil, errors.New("db error")
		},
	}
	svc := newOAuthSvc(nil, oauths, nil)
	err := svc.Bind(context.Background(), "u1", profile)
	assert.Error(t, err)
}

func TestOAuthService_Bind_UserProviderError(t *testing.T) {
	profile := &oauth.Profile{Provider: "github", Email: "a@b.com", ProviderUserID: "g123"}
	oauths := &mockOAuthRepo{
		getByProviderUserIDFn: func(context.Context, string, string) (*model.OAuthAccount, error) {
			return nil, appErr.ErrNotFound
		},
		getByUserProviderFn: func(context.Context, string, string) (*model.OAuthAccount, error) {
			return nil, errors.New("db error")
		},
	}
	svc := newOAuthSvc(nil, oauths, nil)
	err := svc.Bind(context.Background(), "u1", profile)
	assert.Error(t, err)
}

func TestOAuthService_Bind_SameProviderUserID(t *testing.T) {
	profile := &oauth.Profile{Provider: "github", Email: "a@b.com", ProviderUserID: "g123"}
	oauths := &mockOAuthRepo{
		getByProviderUserIDFn: func(context.Context, string, string) (*model.OAuthAccount, error) {
			return nil, appErr.ErrNotFound
		},
		getByUserProviderFn: func(context.Context, string, string) (*model.OAuthAccount, error) {
			return &model.OAuthAccount{ProviderUserID: "g123"}, nil
		},
	}
	svc := newOAuthSvc(nil, oauths, nil)
	err := svc.Bind(context.Background(), "u1", profile)
	assert.NoError(t, err)
}

func TestOAuthService_Bind_CreateError(t *testing.T) {
	profile := &oauth.Profile{Provider: "github", Email: "a@b.com", ProviderUserID: "g123"}
	oauths := &mockOAuthRepo{
		getByProviderUserIDFn: func(context.Context, string, string) (*model.OAuthAccount, error) {
			return nil, appErr.ErrNotFound
		},
		getByUserProviderFn: func(context.Context, string, string) (*model.OAuthAccount, error) {
			return nil, appErr.ErrNotFound
		},
		createFn: func(context.Context, *model.OAuthAccount) error { return errors.New("db error") },
	}
	svc := newOAuthSvc(nil, oauths, nil)
	err := svc.Bind(context.Background(), "u1", profile)
	assert.Error(t, err)
}
