package middleware

import (
	"context"
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
	c1.Request = httptest.NewRequestWithContext(context.Background(), "POST", "/api/v1/public/share/token/comments", nil)
	limiter.handle(c1)
	require.False(t, c1.IsAborted())

	c2, _ := gin.CreateTestContext(httptest.NewRecorder())
	c2.Request = httptest.NewRequestWithContext(context.Background(), "POST", "/api/v1/public/share/token/comments", nil)
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

func TestRateLimit_ZeroWindow(t *testing.T) {
	handler := RateLimit(0)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequestWithContext(context.Background(), "GET", "/", nil)
	handler(c)
	require.False(t, c.IsAborted())
}

func TestRateLimiter_WithUserID(t *testing.T) {
	now := time.Now()
	limiter := &rateLimiter{
		window:        10 * time.Second,
		last:          make(map[string]time.Time),
		sweepInterval: 10 * time.Second,
		now:           func() time.Time { return now },
	}

	c1, _ := gin.CreateTestContext(httptest.NewRecorder())
	c1.Request = httptest.NewRequestWithContext(context.Background(), "GET", "/api/test", nil)
	c1.Set(ContextUserIDKey, "user1")
	limiter.handle(c1)
	require.False(t, c1.IsAborted())

	c2, _ := gin.CreateTestContext(httptest.NewRecorder())
	c2.Request = httptest.NewRequestWithContext(context.Background(), "GET", "/api/test", nil)
	c2.Set(ContextUserIDKey, "user2")
	limiter.handle(c2)
	require.False(t, c2.IsAborted(), "different user should not be blocked")
}

func TestRateLimiter_CleanupSkipWhenRecent(t *testing.T) {
	now := time.Now()
	limiter := &rateLimiter{
		window:        10 * time.Second,
		last:          map[string]time.Time{"k": now},
		sweepInterval: 10 * time.Second,
		lastSweep:     now,
		now:           time.Now,
	}
	limiter.mu.Lock()
	limiter.cleanupExpiredLocked(now.Add(1 * time.Second))
	limiter.mu.Unlock()
	require.Contains(t, limiter.last, "k", "should skip sweep if interval not reached")
}

func TestRateLimiter_CleanupEmptyMap(t *testing.T) {
	now := time.Now()
	limiter := &rateLimiter{
		window:        10 * time.Second,
		last:          make(map[string]time.Time),
		sweepInterval: 10 * time.Second,
		now:           time.Now,
	}
	limiter.mu.Lock()
	limiter.cleanupExpiredLocked(now)
	limiter.mu.Unlock()
	require.Equal(t, now, limiter.lastSweep)
}
