package handler

import (
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/xxxsen/mnote/internal/pkg/errcode"
	"github.com/xxxsen/mnote/internal/pkg/response"
	"github.com/xxxsen/mnote/internal/repo"
	"github.com/xxxsen/mnote/internal/service"
)

type ShareHandler struct {
	documents      *service.DocumentService
	commentLimiter *shareCommentRateLimiter
}

func NewShareHandler(documents *service.DocumentService) *ShareHandler {
	return &ShareHandler{
		documents:      documents,
		commentLimiter: newShareCommentRateLimiter(10 * time.Second),
	}
}

type shareCommentRateLimiter struct {
	mu     sync.Mutex
	window time.Duration
	last   map[string]time.Time
}

func newShareCommentRateLimiter(window time.Duration) *shareCommentRateLimiter {
	return &shareCommentRateLimiter{
		window: window,
		last:   make(map[string]time.Time),
	}
}

func (l *shareCommentRateLimiter) allow(actorID, kind string) bool {
	if l == nil || l.window <= 0 {
		return true
	}
	key := actorID + "|" + kind
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()
	if last, exists := l.last[key]; exists && now.Sub(last) < l.window {
		return false
	}
	l.last[key] = now
	return true
}

type updateShareConfigRequest struct {
	ExpiresAt     int64  `json:"expires_at"`
	Password      string `json:"password"`
	ClearPassword bool   `json:"clear_password"`
	Permission    string `json:"permission"`
	AllowDownload *bool  `json:"allow_download"`
}

type createShareCommentRequest struct {
	Password  string `json:"password"`
	Author    string `json:"author"`
	ReplyToID string `json:"reply_to_id"`
	Content   string `json:"content"`
}

func (h *ShareHandler) Create(c *gin.Context) {
	share, err := h.documents.CreateShare(c.Request.Context(), getUserID(c), c.Param("id"))
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, share)
}

func (h *ShareHandler) UpdateConfig(c *gin.Context) {
	var req updateShareConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	permission := repo.SharePermissionView
	switch strings.TrimSpace(strings.ToLower(req.Permission)) {
	case "", "view":
		permission = repo.SharePermissionView
	case "comment":
		permission = repo.SharePermissionComment
	default:
		response.Error(c, errcode.ErrInvalid, "invalid permission")
		return
	}
	allowDownload := true
	if req.AllowDownload != nil {
		allowDownload = *req.AllowDownload
	}
	share, err := h.documents.UpdateShareConfig(c.Request.Context(), getUserID(c), c.Param("id"), service.ShareConfigInput{
		ExpiresAt:     req.ExpiresAt,
		Password:      req.Password,
		ClearPassword: req.ClearPassword,
		Permission:    permission,
		AllowDownload: allowDownload,
	})
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, share)
}

func (h *ShareHandler) Revoke(c *gin.Context) {
	if err := h.documents.RevokeShare(c.Request.Context(), getUserID(c), c.Param("id")); err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"ok": true})
}

func (h *ShareHandler) GetActive(c *gin.Context) {
	share, err := h.documents.GetActiveShare(c.Request.Context(), getUserID(c), c.Param("id"))
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"share": share})
}

func (h *ShareHandler) PublicGet(c *gin.Context) {
	detail, err := h.documents.GetShareByToken(c.Request.Context(), c.Param("token"), c.Query("password"))
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, detail)
}

func (h *ShareHandler) PublicListComments(c *gin.Context) {
	limit := 50
	offset := 0
	if value := c.Query("limit"); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil {
			limit = parsed
		}
	}
	if value := c.Query("offset"); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil {
			offset = parsed
		}
	}
	result, err := h.documents.ListShareCommentsByToken(c.Request.Context(), c.Param("token"), c.Query("password"), limit, offset)
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, result)
}

func (h *ShareHandler) PublicListReplies(c *gin.Context) {
	limit, _ := strconv.Atoi(c.Query("limit"))
	if limit <= 0 {
		limit = 10
	}
	offset, _ := strconv.Atoi(c.Query("offset"))

	items, err := h.documents.ListShareCommentRepliesByToken(c.Request.Context(), c.Param("token"), c.Query("password"), c.Param("comment_id"), limit, offset)
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, items)
}

func (h *ShareHandler) CreateComment(c *gin.Context) {
	var req createShareCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	author := req.Author
	if strings.TrimSpace(author) == "" {
		if emailValue, exists := c.Get("user_email"); exists {
			if email, ok := emailValue.(string); ok && strings.TrimSpace(email) != "" {
				author = email
			}
		}
	}
	actorID := c.ClientIP()
	if uidValue, exists := c.Get("user_id"); exists {
		if uid, ok := uidValue.(string); ok && strings.TrimSpace(uid) != "" {
			actorID = uid
		}
	}
	kind := "comment"
	if strings.TrimSpace(req.ReplyToID) != "" {
		kind = "reply"
	}
	if !h.commentLimiter.allow(actorID, kind) {
		response.Error(c, errcode.ErrTooMany, http.StatusText(http.StatusTooManyRequests))
		return
	}
	item, err := h.documents.CreateShareCommentByToken(c.Request.Context(), service.CreateShareCommentInput{
		Token:     c.Param("token"),
		Password:  req.Password,
		Author:    author,
		ReplyToID: req.ReplyToID,
		Content:   req.Content,
	})
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, item)
}

func (h *ShareHandler) List(c *gin.Context) {
	query := c.Query("q")
	items, err := h.documents.ListSharedDocuments(c.Request.Context(), getUserID(c), query)
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"items": items})
}
