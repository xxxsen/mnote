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

func TestMetricsEndpointUsesDedicatedRootRoute(t *testing.T) {
	db, _, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })
	instance, err := New(Config{
		Address: "127.0.0.1:0",
		Handler: http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
			http.NotFound(writer, nil)
		}),
		DB: db,
		MetricsHandler: http.HandlerFunc(
			func(writer http.ResponseWriter, _ *http.Request) {
				_, _ = writer.Write([]byte("metric 1\n"))
			},
		),
	})
	require.NoError(t, err)

	recorder := httptest.NewRecorder()
	instance.Handler().ServeHTTP(
		recorder,
		httptest.NewRequest(http.MethodGet, "/metrics", nil),
	)
	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(t, "metric 1\n", recorder.Body.String())
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
