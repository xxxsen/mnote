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
		Auth:            &AuthHandler{auth: &mockAuthService{}},
		OAuth:           newOAuthHandler(&mockOAuthService{}),
		Properties:      NewPropertiesHandler(Properties{}, BannerConfig{}),
		Documents:       &DocumentHandler{documents: &mockDocumentService{}},
		Versions:        &VersionHandler{documents: &mockDocumentService{}},
		Shares:          &ShareHandler{documents: &mockDocumentService{}},
		Tags:            &TagHandler{tags: &mockTagService{}},
		Export:          &ExportHandler{export: &mockExportService{}},
		Files:           &FileHandler{store: &mockFileStore{}},
		SemanticSearch:  &SemanticSearchHandler{documents: &mockDocumentService{}},
		Import:          &ImportHandler{imports: &mockImportHandlerService{}},
		Templates:       &TemplateHandler{templates: &mockTemplateHandlerService{}},
		Assets:          &AssetHandler{assets: &mockAssetHandlerService{}},
		Todos:           &TodoHandler{todos: &mockTodoHandlerService{}},
		JWTSecret:       []byte("test-secret"),
		MaxJSONBodySize: 2 << 20,
	}

	assert.NotPanics(t, func() {
		RegisterRoutes(api, deps)
	})

	routes := r.Routes()
	assert.True(t, len(routes) > 30)

	var previewGET, previewHEAD bool
	removedRoutes := map[string]bool{
		"POST /api/v1/ai/polish":            false,
		"POST /api/v1/ai/generate":          false,
		"POST /api/v1/ai/summary":           false,
		"POST /api/v1/ai/tags":              false,
		"PUT /api/v1/documents/:id/summary": false,
	}
	for _, route := range routes {
		assert.NotContains(t, route.Path, "/saved-views",
			"saved views feature must not register routes after deprecation")
		key := route.Method + " " + route.Path
		if _, tracked := removedRoutes[key]; tracked {
			removedRoutes[key] = true
		}
		if route.Path == "/api/v1/files/:key/preview" {
			previewGET = previewGET || route.Method == "GET"
			previewHEAD = previewHEAD || route.Method == "HEAD"
		}
	}
	for route, registered := range removedRoutes {
		assert.False(t, registered, "%s must stay unregistered", route)
	}
	assert.True(t, previewGET, "public preview GET route must be registered")
	assert.True(t, previewHEAD, "public preview HEAD route must be registered")
}

func TestRouterDepsValidateRejectsMissingDependency(t *testing.T) {
	err := (RouterDeps{}).Validate()
	assert.Error(t, err)
}
