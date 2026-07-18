package handler

import (
	"context"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/pkg/errcode"
	"github.com/xxxsen/mnote/internal/service"
)

func TestDocumentHandlerUpdateRequiresBaseRevision(t *testing.T) {
	called := false
	mock := newDocMock()
	mock.saveFn = func(context.Context, string, string, service.DocumentUpdateInput) (*model.SaveDocumentResult, error) {
		called = true
		return nil, nil
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.PUT("/documents/:id", withUserID("u1"), h.Update)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "PUT", "/documents/d1", map[string]any{
		"title":    "Updated",
		"content":  "Body",
		"save_seq": 2,
	})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.Equal(t, float64(errcode.ErrEditorClientUpgradeRequired), resp["code"])
	assert.Equal(t, "editor client update required", resp["message"])
	assert.False(t, called)
}
