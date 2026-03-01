package middleware

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/xxxsen/common/logutil"
	"go.uber.org/zap"

	"github.com/xxxsen/mnote/internal/pkg/errcode"
	"github.com/xxxsen/mnote/internal/pkg/response"
)

type rateLimiter struct {
	mu            sync.Mutex
	window        time.Duration
	last          map[string]time.Time
	lastSweep     time.Time
	sweepInterval time.Duration
	now           func() time.Time
}

func RateLimit(window time.Duration) gin.HandlerFunc {
	limiter := &rateLimiter{
		window:        window,
		last:          make(map[string]time.Time),
		sweepInterval: window,
		now:           time.Now,
	}
	return limiter.handle
}

func (l *rateLimiter) handle(c *gin.Context) {
	if l.window <= 0 {
		c.Next()
		return
	}
	ip := c.ClientIP() //TODO: 这里需要换成X-Real-IP
	uid := "0"
	if v, ok := c.Get(ContextUserIDKey); ok {
		if id, ok := v.(string); ok && id != "" {
			uid = id
		}
	}
	path := c.FullPath()
	if path == "" {
		path = c.Request.URL.Path
	}
	key := strings.Join([]string{ip, uid, path}, "|")

	now := l.now()
	l.mu.Lock()
	l.cleanupExpiredLocked(now)
	last, exists := l.last[key]
	if exists && now.Sub(last) < l.window {
		l.mu.Unlock()
		logutil.GetLogger(c.Request.Context()).Warn("rate limit hit",
			zap.String("ip", ip),
			zap.String("user_id", uid),
			zap.String("path", path),
		)
		response.Error(c, errcode.ErrTooMany, http.StatusText(http.StatusTooManyRequests))
		c.Abort()
		return
	}
	l.last[key] = now
	l.mu.Unlock()
	c.Next()
}

func (l *rateLimiter) cleanupExpiredLocked(now time.Time) {
	if len(l.last) == 0 {
		l.lastSweep = now
		return
	}
	if l.sweepInterval > 0 && !l.lastSweep.IsZero() && now.Sub(l.lastSweep) < l.sweepInterval {
		return
	}
	for key, ts := range l.last {
		if now.After(ts) && now.Sub(ts) >= l.window {
			delete(l.last, key)
		}
	}
	l.lastSweep = now
}
