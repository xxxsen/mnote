package handler

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
)

func TestAuthHandler_Register_Success(t *testing.T) {
	mock := &mockAuthService{
		registerFn: func(_ context.Context, email, _, _ string) (*model.User, string, error) {
			return &model.User{ID: "u1", Email: email}, "jwt-token", nil
		},
	}
	h := &AuthHandler{auth: mock}
	r := newTestRouter()
	r.POST("/auth/register", h.Register)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/auth/register", map[string]string{
		"email": "user@example.com", "password": "pass123", "code": "123456",
	})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	resp := parseResponseT(t, w)
	data, ok := resp["data"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "jwt-token", data["token"])
}

func TestAuthHandler_Register_InvalidJSON(t *testing.T) {
	h := &AuthHandler{auth: &mockAuthService{}}
	r := newTestRouter()
	r.POST("/auth/register", h.Register)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/auth/register", nil)
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestAuthHandler_Register_EmptyFields(t *testing.T) {
	h := &AuthHandler{auth: &mockAuthService{}}
	r := newTestRouter()
	r.POST("/auth/register", h.Register)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/auth/register", map[string]string{
		"email": "user@example.com", "password": "", "code": "123456",
	})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestAuthHandler_Register_InvalidEmail(t *testing.T) {
	h := &AuthHandler{auth: &mockAuthService{}}
	r := newTestRouter()
	r.POST("/auth/register", h.Register)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/auth/register", map[string]string{
		"email": "invalid", "password": "pass123", "code": "123456",
	})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestAuthHandler_Register_MissingCode(t *testing.T) {
	h := &AuthHandler{auth: &mockAuthService{}}
	r := newTestRouter()
	r.POST("/auth/register", h.Register)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/auth/register", map[string]string{
		"email": "user@example.com", "password": "pass123",
	})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestAuthHandler_Register_ServiceError(t *testing.T) {
	mock := &mockAuthService{
		registerFn: func(_ context.Context, _, _, _ string) (*model.User, string, error) {
			return nil, "", errors.New("conflict")
		},
	}
	h := &AuthHandler{auth: mock}
	r := newTestRouter()
	r.POST("/auth/register", h.Register)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/auth/register", map[string]string{
		"email": "user@example.com", "password": "pass123", "code": "123456",
	})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestAuthHandler_Login_Success(t *testing.T) {
	mock := &mockAuthService{
		loginFn: func(_ context.Context, email, _ string) (*model.User, string, error) {
			return &model.User{ID: "u1", Email: email}, "jwt-tok", nil
		},
	}
	h := &AuthHandler{auth: mock}
	r := newTestRouter()
	r.POST("/auth/login", h.Login)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/auth/login", map[string]string{
		"email": "user@example.com", "password": "pass123",
	})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	resp := parseResponseT(t, w)
	data := resp["data"].(map[string]any)
	assert.Equal(t, "jwt-tok", data["token"])
}

func TestAuthHandler_Login_InvalidEmail(t *testing.T) {
	h := &AuthHandler{auth: &mockAuthService{}}
	r := newTestRouter()
	r.POST("/auth/login", h.Login)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/auth/login", map[string]string{
		"email": "bad", "password": "pass",
	})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestAuthHandler_Login_EmptyPassword(t *testing.T) {
	h := &AuthHandler{auth: &mockAuthService{}}
	r := newTestRouter()
	r.POST("/auth/login", h.Login)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/auth/login", map[string]string{
		"email": "user@example.com", "password": "",
	})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestAuthHandler_SendRegisterCode_Success(t *testing.T) {
	mock := &mockAuthService{
		sendRegCodeFn: func(_ context.Context, _ string) error { return nil },
	}
	h := &AuthHandler{auth: mock}
	r := newTestRouter()
	r.POST("/auth/register/code", h.SendRegisterCode)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/auth/register/code", map[string]string{
		"email": "user@example.com",
	})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	resp := parseResponseT(t, w)
	assert.Equal(t, float64(0), resp["code"])
}

func TestAuthHandler_SendRegisterCode_InvalidEmail(t *testing.T) {
	h := &AuthHandler{auth: &mockAuthService{}}
	r := newTestRouter()
	r.POST("/auth/register/code", h.SendRegisterCode)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/auth/register/code", map[string]string{"email": "noat"})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestAuthHandler_SendRegisterCode_Empty(t *testing.T) {
	h := &AuthHandler{auth: &mockAuthService{}}
	r := newTestRouter()
	r.POST("/auth/register/code", h.SendRegisterCode)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/auth/register/code", map[string]string{"email": ""})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestAuthHandler_Logout(t *testing.T) {
	h := &AuthHandler{auth: &mockAuthService{}}
	r := newTestRouter()
	r.POST("/auth/logout", h.Logout)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/auth/logout", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	resp := parseResponseT(t, w)
	assert.Equal(t, float64(0), resp["code"])
}

func TestAuthHandler_UpdatePassword_Success(t *testing.T) {
	mock := &mockAuthService{
		updatePasswordFn: func(_ context.Context, _, _, _ string) error { return nil },
	}
	h := &AuthHandler{auth: mock}
	r := newTestRouter()
	r.PUT("/auth/password", withUserID("u1"), h.UpdatePassword)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "PUT", "/auth/password", map[string]string{
		"current_password": "old", "password": "new",
	})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	resp := parseResponseT(t, w)
	assert.Equal(t, float64(0), resp["code"])
}

func TestAuthHandler_Login_ServiceError(t *testing.T) {
	mock := &mockAuthService{
		loginFn: func(_ context.Context, _, _ string) (*model.User, string, error) {
			return nil, "", errors.New("bad credentials")
		},
	}
	h := &AuthHandler{auth: mock}
	r := newTestRouter()
	r.POST("/auth/login", h.Login)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/auth/login", map[string]string{
		"email": "user@example.com", "password": "wrong",
	})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestAuthHandler_Login_InvalidJSON(t *testing.T) {
	h := &AuthHandler{auth: &mockAuthService{}}
	r := newTestRouter()
	r.POST("/auth/login", h.Login)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/auth/login", nil)
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestAuthHandler_SendRegisterCode_ServiceError(t *testing.T) {
	mock := &mockAuthService{
		sendRegCodeFn: func(_ context.Context, _ string) error {
			return errors.New("rate limited")
		},
	}
	h := &AuthHandler{auth: mock}
	r := newTestRouter()
	r.POST("/auth/register/code", h.SendRegisterCode)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/auth/register/code", map[string]string{"email": "user@example.com"})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestAuthHandler_SendRegisterCode_InvalidJSON(t *testing.T) {
	h := &AuthHandler{auth: &mockAuthService{}}
	r := newTestRouter()
	r.POST("/auth/register/code", h.SendRegisterCode)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/auth/register/code", nil)
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestAuthHandler_UpdatePassword_InvalidJSON(t *testing.T) {
	h := &AuthHandler{auth: &mockAuthService{}}
	r := newTestRouter()
	r.PUT("/auth/password", withUserID("u1"), h.UpdatePassword)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("PUT", "/auth/password", nil)
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestAuthHandler_IsEmailValid(t *testing.T) {
	assert.True(t, isEmailValid("user@example.com"))
	assert.False(t, isEmailValid("invalid"))
	assert.False(t, isEmailValid("a@b@c"))
	assert.False(t, isEmailValid(""))
}

func TestAuthHandler_UpdatePassword_ServiceError(t *testing.T) {
	mock := &mockAuthService{
		updatePasswordFn: func(_ context.Context, _, _, _ string) error {
			return errors.New("wrong password")
		},
	}
	h := &AuthHandler{auth: mock}
	r := newTestRouter()
	r.PUT("/auth/password", withUserID("u1"), h.UpdatePassword)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "PUT", "/auth/password", map[string]string{
		"current_password": "wrong", "password": "new",
	})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}
