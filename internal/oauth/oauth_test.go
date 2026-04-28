package oauth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

// --- provider.go ---

func TestRegister_EmptyName(t *testing.T) {
	before := len(registry)
	Register("", func(_ any) (Provider, error) { return nil, ErrUnsupportedOAuth })
	assert.Equal(t, before, len(registry))
}

func TestRegister_NilFactory(t *testing.T) {
	before := len(registry)
	Register("test_nil", nil)
	assert.Equal(t, before, len(registry))
}

func TestNewProvider_EmptyName(t *testing.T) {
	_, err := NewProvider("", nil)
	assert.ErrorIs(t, err, ErrProviderRequired)
}

func TestNewProvider_Unknown(t *testing.T) {
	_, err := NewProvider("nonexistent_xyz", nil)
	assert.ErrorIs(t, err, ErrUnsupportedOAuth)
}

func TestNewProvider_GitHub(t *testing.T) {
	p, err := NewProvider("github", nil)
	require.NoError(t, err)
	assert.Equal(t, "github", p.Name())
}

func TestNewProvider_Google(t *testing.T) {
	p, err := NewProvider("google", nil)
	require.NoError(t, err)
	assert.Equal(t, "google", p.Name())
}

// --- providers.go ---

func TestDecodeProviderArgs_Nil(t *testing.T) {
	args := decodeProviderArgs(nil)
	assert.Empty(t, args.Config.ClientID)
}

func TestDecodeProviderArgs_WrongType(t *testing.T) {
	args := decodeProviderArgs("not a ProviderArgs")
	assert.Empty(t, args.Config.ClientID)
}

func TestDecodeProviderArgs_Valid(t *testing.T) {
	in := ProviderArgs{
		Config: ProviderConfig{
			ClientID:     "  id  ",
			ClientSecret: "  sec  ",
			RedirectURL:  "  http://localhost  ",
		},
	}
	out := decodeProviderArgs(in)
	assert.Equal(t, "id", out.Config.ClientID)
	assert.Equal(t, "sec", out.Config.ClientSecret)
	assert.Equal(t, "http://localhost", out.Config.RedirectURL)
}

// --- github_provider.go ---

func TestGitHub_Name(t *testing.T) {
	p := &githubProvider{}
	assert.Equal(t, "github", p.Name())
}

func TestGitHub_AuthURL_MissingConfig(t *testing.T) {
	p := &githubProvider{}
	_, err := p.AuthURL("state")
	assert.ErrorIs(t, err, appErr.ErrInvalid)
}

func TestGitHub_AuthURL_Valid(t *testing.T) {
	p := &githubProvider{cfg: ProviderArgs{Config: ProviderConfig{
		ClientID: "cid", RedirectURL: "http://localhost/cb",
		Scopes: []string{"user:email"},
	}}}
	u, err := p.AuthURL("mystate")
	require.NoError(t, err)
	assert.Contains(t, u, "client_id=cid")
	assert.Contains(t, u, "state=mystate")
}

func TestGitHub_ExchangeCode_MissingConfig(t *testing.T) {
	p := &githubProvider{}
	_, err := p.ExchangeCode(context.Background(), "code")
	assert.ErrorIs(t, err, appErr.ErrInvalid)
}

func TestGitHub_ExchangeCode_FullFlow(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/login/oauth/access_token", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(githubTokenResponse{AccessToken: "tok123"})
	})
	mux.HandleFunc("/user", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(githubUserResponse{ID: 42, Email: "user@example.com"})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	p := &githubProvider{
		cfg: ProviderArgs{Config: ProviderConfig{
			ClientID: "cid", ClientSecret: "csec", RedirectURL: "http://cb",
		}},
		client: &http.Client{Transport: &rewriteTransport{base: srv}},
	}

	profile, err := p.ExchangeCode(context.Background(), "code123")
	require.NoError(t, err)
	assert.Equal(t, "github", profile.Provider)
	assert.Equal(t, "42", profile.ProviderUserID)
	assert.Equal(t, "user@example.com", profile.Email)
}

func TestGitHub_ExchangeCode_EmptyEmail_FallbackToPrimary(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/login/oauth/access_token", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(githubTokenResponse{AccessToken: "tok"})
	})
	mux.HandleFunc("/user", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(githubUserResponse{ID: 1})
	})
	mux.HandleFunc("/user/emails", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode([]githubEmailResponse{
			{Email: "notprimary@test.com", Primary: false, Verified: true},
			{Email: "primary@test.com", Primary: true, Verified: true},
		})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	p := &githubProvider{
		cfg: ProviderArgs{Config: ProviderConfig{
			ClientID: "cid", ClientSecret: "csec", RedirectURL: "http://cb",
		}},
		client: &http.Client{Transport: &rewriteTransport{base: srv}},
	}
	profile, err := p.ExchangeCode(context.Background(), "code")
	require.NoError(t, err)
	assert.Equal(t, "primary@test.com", profile.Email)
}

func TestGitHub_ExchangeCode_NoEmail(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/login/oauth/access_token", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(githubTokenResponse{AccessToken: "tok"})
	})
	mux.HandleFunc("/user", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(githubUserResponse{ID: 1})
	})
	mux.HandleFunc("/user/emails", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode([]githubEmailResponse{})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	p := &githubProvider{
		cfg: ProviderArgs{Config: ProviderConfig{
			ClientID: "cid", ClientSecret: "csec", RedirectURL: "http://cb",
		}},
		client: &http.Client{Transport: &rewriteTransport{base: srv}},
	}
	_, err := p.ExchangeCode(context.Background(), "code")
	assert.ErrorIs(t, err, appErr.ErrInvalid)
}

func TestGitHub_Token_EmptyAccessToken(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/login/oauth/access_token", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(githubTokenResponse{AccessToken: ""})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	p := &githubProvider{
		cfg: ProviderArgs{Config: ProviderConfig{
			ClientID: "cid", ClientSecret: "csec", RedirectURL: "http://cb",
		}},
		client: &http.Client{Transport: &rewriteTransport{base: srv}},
	}
	_, err := p.ExchangeCode(context.Background(), "code")
	assert.Error(t, err)
}

func TestGitHub_Token_ServerError(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/login/oauth/access_token", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("internal error"))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	p := &githubProvider{
		cfg: ProviderArgs{Config: ProviderConfig{
			ClientID: "cid", ClientSecret: "csec", RedirectURL: "http://cb",
		}},
		client: &http.Client{Transport: &rewriteTransport{base: srv}},
	}
	_, err := p.ExchangeCode(context.Background(), "code")
	assert.ErrorIs(t, err, ErrRequestFailed)
}

func TestGitHub_PrimaryEmail_VerifiedFallback(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/login/oauth/access_token", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(githubTokenResponse{AccessToken: "tok"})
	})
	mux.HandleFunc("/user", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(githubUserResponse{ID: 1})
	})
	mux.HandleFunc("/user/emails", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode([]githubEmailResponse{
			{Email: "verified@test.com", Primary: false, Verified: true},
		})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	p := &githubProvider{
		cfg: ProviderArgs{Config: ProviderConfig{
			ClientID: "cid", ClientSecret: "csec", RedirectURL: "http://cb",
		}},
		client: &http.Client{Transport: &rewriteTransport{base: srv}},
	}
	profile, err := p.ExchangeCode(context.Background(), "code")
	require.NoError(t, err)
	assert.Equal(t, "verified@test.com", profile.Email)
}

func TestGitHub_PrimaryEmail_FirstFallback(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/login/oauth/access_token", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(githubTokenResponse{AccessToken: "tok"})
	})
	mux.HandleFunc("/user", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(githubUserResponse{ID: 1})
	})
	mux.HandleFunc("/user/emails", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode([]githubEmailResponse{
			{Email: "unverified@test.com", Primary: false, Verified: false},
		})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	p := &githubProvider{
		cfg: ProviderArgs{Config: ProviderConfig{
			ClientID: "cid", ClientSecret: "csec", RedirectURL: "http://cb",
		}},
		client: &http.Client{Transport: &rewriteTransport{base: srv}},
	}
	profile, err := p.ExchangeCode(context.Background(), "code")
	require.NoError(t, err)
	assert.Equal(t, "unverified@test.com", profile.Email)
}

// --- google_provider.go ---

func TestGoogle_Name(t *testing.T) {
	p := &googleProvider{}
	assert.Equal(t, "google", p.Name())
}

func TestGoogle_AuthURL_MissingConfig(t *testing.T) {
	p := &googleProvider{}
	_, err := p.AuthURL("state")
	assert.ErrorIs(t, err, appErr.ErrInvalid)
}

func TestGoogle_AuthURL_Valid(t *testing.T) {
	p := &googleProvider{cfg: ProviderArgs{Config: ProviderConfig{
		ClientID: "gcid", RedirectURL: "http://localhost/gcb",
		Scopes: []string{"openid", "email"},
	}}}
	u, err := p.AuthURL("gstate")
	require.NoError(t, err)
	assert.Contains(t, u, "client_id=gcid")
	assert.Contains(t, u, "response_type=code")
	assert.Contains(t, u, "state=gstate")
}

func TestGoogle_ExchangeCode_MissingConfig(t *testing.T) {
	p := &googleProvider{}
	_, err := p.ExchangeCode(context.Background(), "code")
	assert.ErrorIs(t, err, appErr.ErrInvalid)
}

func TestGoogle_ExchangeCode_FullFlow(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/token", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(googleTokenResponse{AccessToken: "gtoken"})
	})
	mux.HandleFunc("/v1/userinfo", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(googleUserResponse{Sub: "sub123", Email: "g@test.com"})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	p := &googleProvider{
		cfg: ProviderArgs{Config: ProviderConfig{
			ClientID: "gcid", ClientSecret: "gsec", RedirectURL: "http://cb",
		}},
		client: &http.Client{Transport: &rewriteTransport{base: srv}},
	}
	profile, err := p.ExchangeCode(context.Background(), "code")
	require.NoError(t, err)
	assert.Equal(t, "google", profile.Provider)
	assert.Equal(t, "sub123", profile.ProviderUserID)
	assert.Equal(t, "g@test.com", profile.Email)
}

func TestGoogle_ExchangeCode_EmptySub(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/token", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(googleTokenResponse{AccessToken: "gtoken"})
	})
	mux.HandleFunc("/v1/userinfo", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(googleUserResponse{Sub: "", Email: "g@test.com"})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	p := &googleProvider{
		cfg: ProviderArgs{Config: ProviderConfig{
			ClientID: "gcid", ClientSecret: "gsec", RedirectURL: "http://cb",
		}},
		client: &http.Client{Transport: &rewriteTransport{base: srv}},
	}
	_, err := p.ExchangeCode(context.Background(), "code")
	assert.ErrorIs(t, err, appErr.ErrInvalid)
}

func TestGoogle_ExchangeCode_EmptyEmail(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/token", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(googleTokenResponse{AccessToken: "gtoken"})
	})
	mux.HandleFunc("/v1/userinfo", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(googleUserResponse{Sub: "s", Email: ""})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	p := &googleProvider{
		cfg: ProviderArgs{Config: ProviderConfig{
			ClientID: "gcid", ClientSecret: "gsec", RedirectURL: "http://cb",
		}},
		client: &http.Client{Transport: &rewriteTransport{base: srv}},
	}
	_, err := p.ExchangeCode(context.Background(), "code")
	assert.ErrorIs(t, err, appErr.ErrInvalid)
}

func TestGoogle_Token_ServerError(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/token", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte("bad"))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	p := &googleProvider{
		cfg: ProviderArgs{Config: ProviderConfig{
			ClientID: "gcid", ClientSecret: "gsec", RedirectURL: "http://cb",
		}},
		client: &http.Client{Transport: &rewriteTransport{base: srv}},
	}
	_, err := p.ExchangeCode(context.Background(), "code")
	assert.ErrorIs(t, err, ErrRequestFailed)
}

func TestGoogle_Token_EmptyAccessToken(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/token", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(googleTokenResponse{AccessToken: ""})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	p := &googleProvider{
		cfg: ProviderArgs{Config: ProviderConfig{
			ClientID: "gcid", ClientSecret: "gsec", RedirectURL: "http://cb",
		}},
		client: &http.Client{Transport: &rewriteTransport{base: srv}},
	}
	_, err := p.ExchangeCode(context.Background(), "code")
	assert.Error(t, err)
}

func TestGoogle_User_ServerError(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/token", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(googleTokenResponse{AccessToken: "tok"})
	})
	mux.HandleFunc("/v1/userinfo", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	p := &googleProvider{
		cfg: ProviderArgs{Config: ProviderConfig{
			ClientID: "gcid", ClientSecret: "gsec", RedirectURL: "http://cb",
		}},
		client: &http.Client{Transport: &rewriteTransport{base: srv}},
	}
	_, err := p.ExchangeCode(context.Background(), "code")
	assert.ErrorIs(t, err, ErrRequestFailed)
}

func TestGitHub_User_ServerError(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/login/oauth/access_token", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(githubTokenResponse{AccessToken: "tok"})
	})
	mux.HandleFunc("/user", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte("unauthorized"))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	p := &githubProvider{
		cfg: ProviderArgs{Config: ProviderConfig{
			ClientID: "cid", ClientSecret: "csec", RedirectURL: "http://cb",
		}},
		client: &http.Client{Transport: &rewriteTransport{base: srv}},
	}
	_, err := p.ExchangeCode(context.Background(), "code")
	assert.ErrorIs(t, err, ErrRequestFailed)
}

func TestGitHub_User_InvalidJSON(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/login/oauth/access_token", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(githubTokenResponse{AccessToken: "tok"})
	})
	mux.HandleFunc("/user", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("not-json"))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	p := &githubProvider{
		cfg: ProviderArgs{Config: ProviderConfig{
			ClientID: "cid", ClientSecret: "csec", RedirectURL: "http://cb",
		}},
		client: &http.Client{Transport: &rewriteTransport{base: srv}},
	}
	_, err := p.ExchangeCode(context.Background(), "code")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "decode")
}

func TestGitHub_Token_InvalidJSON(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/login/oauth/access_token", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("bad-json"))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	p := &githubProvider{
		cfg: ProviderArgs{Config: ProviderConfig{
			ClientID: "cid", ClientSecret: "csec", RedirectURL: "http://cb",
		}},
		client: &http.Client{Transport: &rewriteTransport{base: srv}},
	}
	_, err := p.ExchangeCode(context.Background(), "code")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "decode")
}

func TestGitHub_PrimaryEmail_ServerError(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/login/oauth/access_token", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(githubTokenResponse{AccessToken: "tok"})
	})
	mux.HandleFunc("/user", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(githubUserResponse{ID: 1})
	})
	mux.HandleFunc("/user/emails", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	p := &githubProvider{
		cfg: ProviderArgs{Config: ProviderConfig{
			ClientID: "cid", ClientSecret: "csec", RedirectURL: "http://cb",
		}},
		client: &http.Client{Transport: &rewriteTransport{base: srv}},
	}
	_, err := p.ExchangeCode(context.Background(), "code")
	assert.ErrorIs(t, err, ErrRequestFailed)
}

func TestGitHub_PrimaryEmail_InvalidJSON(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/login/oauth/access_token", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(githubTokenResponse{AccessToken: "tok"})
	})
	mux.HandleFunc("/user", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(githubUserResponse{ID: 1})
	})
	mux.HandleFunc("/user/emails", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("nope"))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	p := &githubProvider{
		cfg: ProviderArgs{Config: ProviderConfig{
			ClientID: "cid", ClientSecret: "csec", RedirectURL: "http://cb",
		}},
		client: &http.Client{Transport: &rewriteTransport{base: srv}},
	}
	_, err := p.ExchangeCode(context.Background(), "code")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "decode")
}

func TestGoogle_Token_InvalidJSON(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/token", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("bad"))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	p := &googleProvider{
		cfg: ProviderArgs{Config: ProviderConfig{
			ClientID: "gcid", ClientSecret: "gsec", RedirectURL: "http://cb",
		}},
		client: &http.Client{Transport: &rewriteTransport{base: srv}},
	}
	_, err := p.ExchangeCode(context.Background(), "code")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "decode")
}

func TestGoogle_User_InvalidJSON(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/token", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(googleTokenResponse{AccessToken: "tok"})
	})
	mux.HandleFunc("/v1/userinfo", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("bad"))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	p := &googleProvider{
		cfg: ProviderArgs{Config: ProviderConfig{
			ClientID: "gcid", ClientSecret: "gsec", RedirectURL: "http://cb",
		}},
		client: &http.Client{Transport: &rewriteTransport{base: srv}},
	}
	_, err := p.ExchangeCode(context.Background(), "code")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "decode")
}

func TestGitHub_Token_CanceledContext(t *testing.T) {
	srv := httptest.NewServer(http.NewServeMux())
	t.Cleanup(srv.Close)

	p := &githubProvider{
		cfg: ProviderArgs{Config: ProviderConfig{
			ClientID: "cid", ClientSecret: "csec", RedirectURL: "http://cb",
		}},
		client: &http.Client{Transport: &rewriteTransport{base: srv}},
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := p.ExchangeCode(ctx, "code")
	assert.Error(t, err)
}

func TestGoogle_Token_CanceledContext(t *testing.T) {
	srv := httptest.NewServer(http.NewServeMux())
	t.Cleanup(srv.Close)

	p := &googleProvider{
		cfg: ProviderArgs{Config: ProviderConfig{
			ClientID: "gcid", ClientSecret: "gsec", RedirectURL: "http://cb",
		}},
		client: &http.Client{Transport: &rewriteTransport{base: srv}},
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := p.ExchangeCode(ctx, "code")
	assert.Error(t, err)
}

func TestGitHub_User_CanceledContext(t *testing.T) {
	callCount := 0
	mux := http.NewServeMux()
	mux.HandleFunc("/login/oauth/access_token", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(githubTokenResponse{AccessToken: "tok"})
	})
	mux.HandleFunc("/user", func(w http.ResponseWriter, _ *http.Request) {
		callCount++
		w.WriteHeader(http.StatusGatewayTimeout)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	p := &githubProvider{
		cfg: ProviderArgs{Config: ProviderConfig{
			ClientID: "cid", ClientSecret: "csec", RedirectURL: "http://cb",
		}},
		client: &http.Client{Transport: &rewriteTransport{base: srv}},
	}
	_, err := p.ExchangeCode(context.Background(), "code")
	assert.Error(t, err)
}

func TestGitHub_PrimaryEmail_CanceledContext(t *testing.T) {
	reqCount := 0
	mux := http.NewServeMux()
	mux.HandleFunc("/login/oauth/access_token", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(githubTokenResponse{AccessToken: "tok"})
	})
	mux.HandleFunc("/user", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(githubUserResponse{ID: 1})
	})
	mux.HandleFunc("/user/emails", func(w http.ResponseWriter, _ *http.Request) {
		reqCount++
		w.WriteHeader(http.StatusServiceUnavailable)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	p := &githubProvider{
		cfg: ProviderArgs{Config: ProviderConfig{
			ClientID: "cid", ClientSecret: "csec", RedirectURL: "http://cb",
		}},
		client: &http.Client{Transport: &rewriteTransport{base: srv}},
	}
	_, err := p.ExchangeCode(context.Background(), "code")
	assert.Error(t, err)
}

// --- factory tests ---

func TestNewGithubProvider_NilArgs(t *testing.T) {
	p, err := newGithubProvider(nil)
	require.NoError(t, err)
	assert.Equal(t, "github", p.Name())
}

func TestNewGoogleProvider_NilArgs(t *testing.T) {
	p, err := newGoogleProvider(nil)
	require.NoError(t, err)
	assert.Equal(t, "google", p.Name())
}

func TestNewGithubProvider_CustomClient(t *testing.T) {
	c := &http.Client{}
	p, err := newGithubProvider(ProviderArgs{Client: c})
	require.NoError(t, err)
	gp := p.(*githubProvider)
	assert.Equal(t, c, gp.client)
}

func TestNewGoogleProvider_CustomClient(t *testing.T) {
	c := &http.Client{}
	p, err := newGoogleProvider(ProviderArgs{Client: c})
	require.NoError(t, err)
	gp := p.(*googleProvider)
	assert.Equal(t, c, gp.client)
}

// rewriteTransport redirects all requests to the test server.
type rewriteTransport struct {
	base *httptest.Server
}

func (rt *rewriteTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	u := *req.URL
	redir, _ := http.NewRequestWithContext(
		req.Context(), req.Method, rt.base.URL+u.Path, req.Body,
	)
	redir.Header = req.Header
	return http.DefaultTransport.RoundTrip(redir)
}
