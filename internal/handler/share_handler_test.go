package handler

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"

	"github.com/xxxsen/mnote/internal/middleware"
	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/repo"
	"github.com/xxxsen/mnote/internal/service"
)

func newShareDocMock() *mockDocumentService {
	return &mockDocumentService{}
}

func TestShareHandler_Create_Success(t *testing.T) {
	mock := newShareDocMock()
	mock.createShareFn = func(_ context.Context, _, docID string) (*model.Share, error) {
		return &model.Share{ID: "s1", DocumentID: docID, Token: "tok123"}, nil
	}
	h := &ShareHandler{documents: mock}
	r := newTestRouter()
	r.POST("/documents/:id/share", withUserID("u1"), h.Create)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/documents/d1/share", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestShareHandler_Create_Error(t *testing.T) {
	mock := newShareDocMock()
	mock.createShareFn = func(_ context.Context, _, _ string) (*model.Share, error) {
		return nil, errors.New("not found")
	}
	h := &ShareHandler{documents: mock}
	r := newTestRouter()
	r.POST("/documents/:id/share", withUserID("u1"), h.Create)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/documents/d1/share", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestShareHandler_UpdateConfig_Success(t *testing.T) {
	mock := newShareDocMock()
	mock.updateShareConfigFn = func(_ context.Context, _, _ string, _ service.ShareConfigInput) (*model.Share, error) {
		return &model.Share{ID: "s1"}, nil
	}
	h := &ShareHandler{documents: mock}
	r := newTestRouter()
	r.PUT("/documents/:id/share", withUserID("u1"), h.UpdateConfig)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "PUT", "/documents/d1/share", updateShareConfigRequest{
		Permission: "comment",
	})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestShareHandler_UpdateConfig_InvalidPermission(t *testing.T) {
	h := &ShareHandler{documents: newShareDocMock()}
	r := newTestRouter()
	r.PUT("/documents/:id/share", withUserID("u1"), h.UpdateConfig)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "PUT", "/documents/d1/share", updateShareConfigRequest{
		Permission: "admin",
	})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestShareHandler_Revoke_Success(t *testing.T) {
	mock := newShareDocMock()
	mock.revokeShareFn = func(_ context.Context, _, _ string) error { return nil }
	h := &ShareHandler{documents: mock}
	r := newTestRouter()
	r.DELETE("/documents/:id/share", withUserID("u1"), h.Revoke)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("DELETE", "/documents/d1/share", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestShareHandler_GetActive_Success(t *testing.T) {
	mock := newShareDocMock()
	mock.getActiveShareFn = func(_ context.Context, _, _ string) (*model.Share, error) {
		return &model.Share{ID: "s1", Token: "tok"}, nil
	}
	h := &ShareHandler{documents: mock}
	r := newTestRouter()
	r.GET("/documents/:id/share", withUserID("u1"), h.GetActive)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/documents/d1/share", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestShareHandler_PublicGet_Success(t *testing.T) {
	mock := newShareDocMock()
	mock.getShareByTokenFn = func(_ context.Context, token, _ string) (*service.PublicShareDetail, error) {
		assert.Equal(t, "tok123", token)
		return &service.PublicShareDetail{Document: &model.Document{ID: "d1"}}, nil
	}
	h := &ShareHandler{documents: mock}
	r := newTestRouter()
	r.GET("/public/share/:token", h.PublicGet)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/public/share/tok123", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestShareHandler_PublicListComments_Success(t *testing.T) {
	mock := newShareDocMock()
	mock.listShareCommentsByTokenFn = func(_ context.Context, _, _ string, _, _ int) (*service.ShareCommentListResult, error) {
		return &service.ShareCommentListResult{
			Items: []service.ShareCommentWithReplies{},
			Total: 0,
		}, nil
	}
	h := &ShareHandler{documents: mock}
	r := newTestRouter()
	r.GET("/public/share/:token/comments", h.PublicListComments)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/public/share/tok123/comments", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestShareHandler_PublicListReplies_Success(t *testing.T) {
	mock := newShareDocMock()
	mock.listShareCommentRepliesByTokenFn = func(_ context.Context, _, _, _ string, _, _ int) ([]model.ShareComment, error) {
		return []model.ShareComment{}, nil
	}
	h := &ShareHandler{documents: mock}
	r := newTestRouter()
	r.GET("/public/share/:token/comments/:comment_id/replies", h.PublicListReplies)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/public/share/tok123/comments/c1/replies", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestShareHandler_CreateComment_Success(t *testing.T) {
	mock := newShareDocMock()
	mock.createShareCommentByTokenFn = func(_ context.Context, input service.CreateShareCommentInput) (*model.ShareComment, error) {
		return &model.ShareComment{ID: "c1", Content: input.Content, Author: input.Author}, nil
	}
	h := &ShareHandler{documents: mock}
	r := newTestRouter()
	r.POST("/public/share/:token/comments", h.CreateComment)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/public/share/tok123/comments", createShareCommentRequest{
		Content: "Great article!", Author: "John",
	})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestShareHandler_CreateComment_AutoAuthor(t *testing.T) {
	mock := newShareDocMock()
	mock.createShareCommentByTokenFn = func(_ context.Context, input service.CreateShareCommentInput) (*model.ShareComment, error) {
		return &model.ShareComment{ID: "c1", Author: input.Author}, nil
	}
	h := &ShareHandler{documents: mock}
	r := newTestRouter()
	r.POST("/public/share/:token/comments", func(c *gin.Context) {
		c.Set(middleware.ContextUserEmailKey, "user@example.com")
		c.Next()
	}, h.CreateComment)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/public/share/tok123/comments", createShareCommentRequest{
		Content: "Nice!",
	})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestShareHandler_UpdateConfig_ViewPermission(t *testing.T) {
	mock := newShareDocMock()
	mock.updateShareConfigFn = func(_ context.Context, _, _ string, input service.ShareConfigInput) (*model.Share, error) {
		assert.Equal(t, repo.SharePermissionView, input.Permission)
		return &model.Share{ID: "s1"}, nil
	}
	h := &ShareHandler{documents: mock}
	r := newTestRouter()
	r.PUT("/documents/:id/share", withUserID("u1"), h.UpdateConfig)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "PUT", "/documents/d1/share", updateShareConfigRequest{Permission: "view"})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestShareHandler_UpdateConfig_WithAllowDownload(t *testing.T) {
	mock := newShareDocMock()
	mock.updateShareConfigFn = func(_ context.Context, _, _ string, input service.ShareConfigInput) (*model.Share, error) {
		assert.False(t, input.AllowDownload)
		return &model.Share{ID: "s1"}, nil
	}
	h := &ShareHandler{documents: mock}
	r := newTestRouter()
	r.PUT("/documents/:id/share", withUserID("u1"), h.UpdateConfig)

	w := httptest.NewRecorder()
	allow := false
	req := jsonRequestT(t, "PUT", "/documents/d1/share", updateShareConfigRequest{
		AllowDownload: &allow,
	})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestShareHandler_UpdateConfig_ServiceError(t *testing.T) {
	mock := newShareDocMock()
	mock.updateShareConfigFn = func(_ context.Context, _, _ string, _ service.ShareConfigInput) (*model.Share, error) {
		return nil, errors.New("config error")
	}
	h := &ShareHandler{documents: mock}
	r := newTestRouter()
	r.PUT("/documents/:id/share", withUserID("u1"), h.UpdateConfig)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "PUT", "/documents/d1/share", updateShareConfigRequest{})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestShareHandler_UpdateConfig_InvalidJSON(t *testing.T) {
	h := &ShareHandler{documents: newShareDocMock()}
	r := newTestRouter()
	r.PUT("/documents/:id/share", withUserID("u1"), h.UpdateConfig)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("PUT", "/documents/d1/share", nil)
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestShareHandler_Revoke_Error(t *testing.T) {
	mock := newShareDocMock()
	mock.revokeShareFn = func(_ context.Context, _, _ string) error {
		return errors.New("revoke error")
	}
	h := &ShareHandler{documents: mock}
	r := newTestRouter()
	r.DELETE("/documents/:id/share", withUserID("u1"), h.Revoke)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("DELETE", "/documents/d1/share", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestShareHandler_GetActive_Error(t *testing.T) {
	mock := newShareDocMock()
	mock.getActiveShareFn = func(_ context.Context, _, _ string) (*model.Share, error) {
		return nil, errors.New("not found")
	}
	h := &ShareHandler{documents: mock}
	r := newTestRouter()
	r.GET("/documents/:id/share", withUserID("u1"), h.GetActive)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/documents/d1/share", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestShareHandler_PublicGet_Error(t *testing.T) {
	mock := newShareDocMock()
	mock.getShareByTokenFn = func(_ context.Context, _, _ string) (*service.PublicShareDetail, error) {
		return nil, errors.New("expired")
	}
	h := &ShareHandler{documents: mock}
	r := newTestRouter()
	r.GET("/public/share/:token", h.PublicGet)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/public/share/tok123", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestShareHandler_PublicListComments_WithParams(t *testing.T) {
	mock := newShareDocMock()
	mock.listShareCommentsByTokenFn = func(_ context.Context, _, _ string, limit, offset int) (*service.ShareCommentListResult, error) {
		assert.Equal(t, 10, limit)
		assert.Equal(t, 5, offset)
		return &service.ShareCommentListResult{Items: []service.ShareCommentWithReplies{}, Total: 0}, nil
	}
	h := &ShareHandler{documents: mock}
	r := newTestRouter()
	r.GET("/public/share/:token/comments", h.PublicListComments)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/public/share/tok123/comments?limit=10&offset=5", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestShareHandler_PublicListComments_Error(t *testing.T) {
	mock := newShareDocMock()
	mock.listShareCommentsByTokenFn = func(_ context.Context, _, _ string, _, _ int) (*service.ShareCommentListResult, error) {
		return nil, errors.New("comments error")
	}
	h := &ShareHandler{documents: mock}
	r := newTestRouter()
	r.GET("/public/share/:token/comments", h.PublicListComments)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/public/share/tok123/comments", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestShareHandler_PublicListReplies_Error(t *testing.T) {
	mock := newShareDocMock()
	mock.listShareCommentRepliesByTokenFn = func(_ context.Context, _, _, _ string, _, _ int) ([]model.ShareComment, error) {
		return nil, errors.New("replies error")
	}
	h := &ShareHandler{documents: mock}
	r := newTestRouter()
	r.GET("/public/share/:token/comments/:comment_id/replies", h.PublicListReplies)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/public/share/tok123/comments/c1/replies", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestShareHandler_PublicListReplies_WithLimit(t *testing.T) {
	mock := newShareDocMock()
	mock.listShareCommentRepliesByTokenFn = func(_ context.Context, _, _, _ string, limit, _ int) ([]model.ShareComment, error) {
		assert.Equal(t, 5, limit)
		return []model.ShareComment{}, nil
	}
	h := &ShareHandler{documents: mock}
	r := newTestRouter()
	r.GET("/public/share/:token/comments/:comment_id/replies", h.PublicListReplies)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/public/share/tok123/comments/c1/replies?limit=5", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestShareHandler_CreateComment_Error(t *testing.T) {
	mock := newShareDocMock()
	mock.createShareCommentByTokenFn = func(_ context.Context, _ service.CreateShareCommentInput) (*model.ShareComment, error) {
		return nil, errors.New("comment error")
	}
	h := &ShareHandler{documents: mock}
	r := newTestRouter()
	r.POST("/public/share/:token/comments", h.CreateComment)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/public/share/tok123/comments", createShareCommentRequest{
		Content: "Hello", Author: "John",
	})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestShareHandler_CreateComment_InvalidJSON(t *testing.T) {
	h := &ShareHandler{documents: newShareDocMock()}
	r := newTestRouter()
	r.POST("/public/share/:token/comments", h.CreateComment)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/public/share/tok123/comments", nil)
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestShareHandler_CreateComment_EmptyAuthorNoEmail(t *testing.T) {
	mock := newShareDocMock()
	mock.createShareCommentByTokenFn = func(_ context.Context, input service.CreateShareCommentInput) (*model.ShareComment, error) {
		assert.Empty(t, input.Author)
		return &model.ShareComment{ID: "c1"}, nil
	}
	h := &ShareHandler{documents: mock}
	r := newTestRouter()
	r.POST("/public/share/:token/comments", h.CreateComment)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/public/share/tok123/comments", createShareCommentRequest{
		Content: "Hello",
	})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestShareHandler_CreateComment_EmptyEmailValue(t *testing.T) {
	mock := newShareDocMock()
	mock.createShareCommentByTokenFn = func(_ context.Context, input service.CreateShareCommentInput) (*model.ShareComment, error) {
		assert.Empty(t, input.Author)
		return &model.ShareComment{ID: "c1"}, nil
	}
	h := &ShareHandler{documents: mock}
	r := newTestRouter()
	r.POST("/public/share/:token/comments", func(c *gin.Context) {
		c.Set(middleware.ContextUserEmailKey, "  ")
		c.Next()
	}, h.CreateComment)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/public/share/tok123/comments", createShareCommentRequest{
		Content: "Hello",
	})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestShareHandler_List_Error(t *testing.T) {
	mock := newShareDocMock()
	mock.listSharedDocumentsFn = func(_ context.Context, _, _ string) ([]service.SharedDocumentSummary, error) {
		return nil, errors.New("list error")
	}
	h := &ShareHandler{documents: mock}
	r := newTestRouter()
	r.GET("/shares", withUserID("u1"), h.List)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/shares", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestShareHandler_List_Success(t *testing.T) {
	mock := newShareDocMock()
	mock.listSharedDocumentsFn = func(_ context.Context, _, _ string) ([]service.SharedDocumentSummary, error) {
		return []service.SharedDocumentSummary{{ID: "d1", Title: "Shared Doc"}}, nil
	}
	h := &ShareHandler{documents: mock}
	r := newTestRouter()
	r.GET("/shares", withUserID("u1"), h.List)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/shares", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}
