package handler

import (
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestRegisterRoutes(t *testing.T) {
	r := gin.New()
	api := r.Group("/api/v1")

	deps := RouterDeps{
		Auth:       &AuthHandler{auth: &mockAuthService{}},
		OAuth:      newOAuthHandler(&mockOAuthService{}),
		Properties: NewPropertiesHandler(Properties{}, BannerConfig{}),
		Documents:  &DocumentHandler{documents: &mockDocumentService{}},
		Versions:   &VersionHandler{documents: &mockDocumentService{}},
		Shares:     &ShareHandler{documents: &mockDocumentService{}},
		Tags:       &TagHandler{tags: &mockTagService{}},
		Export:     &ExportHandler{export: &mockExportService{}},
		Files:      &FileHandler{store: &mockFileStore{}},
		SavedViews: &SavedViewHandler{service: &mockSavedViewService{}},
		AI:         &AIHandler{ai: &mockAIHandlerService{}, documents: &mockDocumentService{}, tags: &mockTagService{}},
		Import:     &ImportHandler{imports: &mockImportHandlerService{}},
		Templates:  &TemplateHandler{templates: &mockTemplateHandlerService{}},
		Assets:     &AssetHandler{assets: &mockAssetHandlerService{}},
		Todos:      &TodoHandler{todos: &mockTodoHandlerService{}},
		JWTSecret:  []byte("test-secret"),
	}

	assert.NotPanics(t, func() {
		RegisterRoutes(api, deps)
	})

	routes := r.Routes()
	assert.True(t, len(routes) > 30)
}
