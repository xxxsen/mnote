package app

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTestApp(t *testing.T, address string) (*App, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, err := sqlmock.New(sqlmock.MonitorPingsOption(true))
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })
	instance, err := New(Config{
		Address: address,
		Handler: http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
			writer.WriteHeader(http.StatusNoContent)
		}),
		DB: db,
	})
	require.NoError(t, err)
	return instance, mock
}

func TestHealthEndpoints(t *testing.T) {
	instance, mock := newTestApp(t, "127.0.0.1:0")

	live := httptest.NewRecorder()
	instance.Handler().ServeHTTP(live, httptest.NewRequest("GET", "/health/live", nil))
	assert.Equal(t, http.StatusOK, live.Code)

	notReady := httptest.NewRecorder()
	instance.Handler().ServeHTTP(notReady, httptest.NewRequest("GET", "/health/ready", nil))
	assert.Equal(t, http.StatusServiceUnavailable, notReady.Code)

	instance.ready.Store(true)
	mock.ExpectPing()
	ready := httptest.NewRecorder()
	instance.Handler().ServeHTTP(ready, httptest.NewRequest("GET", "/health/ready", nil))
	assert.Equal(t, http.StatusOK, ready.Code)
}

func TestRunReturnsListenFailure(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	defer listener.Close()

	instance, _ := newTestApp(t, listener.Addr().String())
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	err = instance.Run(ctx)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "listen and serve")
}
