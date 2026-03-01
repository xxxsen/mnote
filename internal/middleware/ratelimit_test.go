package middleware

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestRateLimiterHandle_BlocksWithinWindow(t *testing.T) {
	gin.SetMode(gin.TestMode)
	now := time.Now()
	limiter := &rateLimiter{
		window:        10 * time.Second,
		last:          make(map[string]time.Time),
		sweepInterval: 10 * time.Second,
		now: func() time.Time {
			return now
		},
	}

	c1, _ := gin.CreateTestContext(httptest.NewRecorder())
	c1.Request = httptest.NewRequest("POST", "/api/v1/public/share/token/comments", nil)
	limiter.handle(c1)
	require.False(t, c1.IsAborted())

	c2, _ := gin.CreateTestContext(httptest.NewRecorder())
	c2.Request = httptest.NewRequest("POST", "/api/v1/public/share/token/comments", nil)
	limiter.handle(c2)
	require.True(t, c2.IsAborted())
}

func TestRateLimiterCleanupExpiredLocked_RemovesExpiredEntries(t *testing.T) {
	base := time.Now()
	limiter := &rateLimiter{
		window:        10 * time.Second,
		last:          make(map[string]time.Time),
		sweepInterval: 10 * time.Second,
		now:           time.Now,
	}
	limiter.last["expired"] = base.Add(-20 * time.Second)
	limiter.last["active"] = base.Add(-2 * time.Second)

	limiter.mu.Lock()
	limiter.cleanupExpiredLocked(base)
	limiter.mu.Unlock()

	require.NotContains(t, limiter.last, "expired")
	require.Contains(t, limiter.last, "active")
	require.False(t, limiter.lastSweep.IsZero())
}
