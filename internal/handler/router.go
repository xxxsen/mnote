package handler

import (
	"errors"
	"fmt"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/xxxsen/mnote/internal/middleware"
)

var (
	errMissingRouterDependency = errors.New("router dependency is required")
	errMissingRouterJWTSecret  = errors.New("router JWT secret is required")
	errInvalidJSONBodyLimit    = errors.New("router max JSON body size must be positive")
)

type RouterDeps struct {
	Auth            *AuthHandler
	OAuth           *OAuthHandler
	Properties      *PropertiesHandler
	Documents       *DocumentHandler
	Versions        *VersionHandler
	Shares          *ShareHandler
	Tags            *TagHandler
	Export          *ExportHandler
	Files           *FileHandler
	SemanticSearch  *SemanticSearchHandler
	Import          *ImportHandler
	Templates       *TemplateHandler
	Assets          *AssetHandler
	Todos           *TodoHandler
	JWTSecret       []byte
	MaxJSONBodySize int64
}

func (deps RouterDeps) Validate() error {
	required := []struct {
		name       string
		dependency any
	}{
		{name: "auth", dependency: deps.Auth},
		{name: "oauth", dependency: deps.OAuth},
		{name: "properties", dependency: deps.Properties},
		{name: "documents", dependency: deps.Documents},
		{name: "versions", dependency: deps.Versions},
		{name: "shares", dependency: deps.Shares},
		{name: "tags", dependency: deps.Tags},
		{name: "export", dependency: deps.Export},
		{name: "files", dependency: deps.Files},
		{name: "semantic search", dependency: deps.SemanticSearch},
		{name: "import", dependency: deps.Import},
		{name: "templates", dependency: deps.Templates},
		{name: "assets", dependency: deps.Assets},
		{name: "todos", dependency: deps.Todos},
	}
	for _, item := range required {
		if item.dependency == nil {
			return fmt.Errorf("%w: %s", errMissingRouterDependency, item.name)
		}
	}
	if len(deps.JWTSecret) == 0 {
		return errMissingRouterJWTSecret
	}
	if deps.MaxJSONBodySize <= 0 {
		return errInvalidJSONBodyLimit
	}
	return nil
}

func RegisterRoutes(api *gin.RouterGroup, deps RouterDeps) {
	if err := deps.Validate(); err != nil {
		panic(err)
	}
	api.Use(func(c *gin.Context) {
		c.Set(maxJSONBodySizeContextKey, deps.MaxJSONBodySize)
		c.Next()
	})
	registerPublicRoutes(api, deps)
	authGroup := api.Group("")
	authGroup.Use(middleware.JWTAuth(deps.JWTSecret))
	registerAuthRoutes(authGroup, deps)
	registerDocumentRoutes(authGroup, deps)
	registerFeatureRoutes(authGroup, deps)
}

func registerPublicRoutes(api *gin.RouterGroup, deps RouterDeps) {
	api.POST("/auth/register", middleware.RateLimit(5*time.Second), deps.Auth.Register)
	api.POST("/auth/register/code", middleware.RateLimit(30*time.Second), deps.Auth.SendRegisterCode)
	api.POST("/auth/login", middleware.RateLimit(5*time.Second), deps.Auth.Login)
	api.POST("/auth/logout", middleware.RateLimit(5*time.Second), deps.Auth.Logout)
	api.GET("/properties", deps.Properties.Get)
	api.GET("/auth/oauth/:provider/url", deps.OAuth.AuthURL)
	api.GET("/auth/oauth/:provider/callback", deps.OAuth.Callback)
	api.POST("/auth/oauth/exchange", middleware.RateLimit(5*time.Second), deps.OAuth.Exchange)
	api.GET("/public/share/:token", middleware.RateLimit(3*time.Second), deps.Shares.PublicGet)
	api.GET("/public/share/:token/comments", middleware.RateLimit(1*time.Second), deps.Shares.PublicListComments)
	api.GET("/public/share/:token/comments/:comment_id/replies",
		middleware.RateLimit(1*time.Second), deps.Shares.PublicListReplies)
	api.POST("/public/share/:token/comments", middleware.OptionalJWTAuth(deps.JWTSecret),
		middleware.RateLimit(10*time.Second), deps.Shares.CreateComment)
	api.GET("/files/:key", deps.Files.Get)
	api.HEAD("/files/:key/preview", deps.Files.Preview)
	api.GET("/files/:key/preview", deps.Files.Preview)
}

func registerAuthRoutes(g *gin.RouterGroup, deps RouterDeps) {
	g.PUT("/auth/password", middleware.RateLimit(5*time.Second), deps.Auth.UpdatePassword)
	g.GET("/auth/oauth/bindings", deps.OAuth.ListBindings)
	g.GET("/auth/oauth/:provider/bind/url", deps.OAuth.BindURL)
	g.DELETE("/auth/oauth/:provider/bind", deps.OAuth.Unbind)
}

func registerDocumentRoutes(g *gin.RouterGroup, deps RouterDeps) {
	g.POST("/documents", deps.Documents.Create)
	g.GET("/documents", deps.Documents.List)
	g.GET("/documents/summary", deps.Documents.Summary)
	g.GET("/documents/:id", deps.Documents.Get)
	g.PUT("/documents/:id", deps.Documents.Update)
	g.PUT("/documents/:id/tags", deps.Documents.UpdateTags)
	g.PUT("/documents/:id/pin", deps.Documents.Pin)
	g.PUT("/documents/:id/star", deps.Documents.Star)
	g.DELETE("/documents/:id", deps.Documents.Delete)
	g.GET("/documents/:id/backlinks", deps.Documents.Backlinks)
	g.GET("/documents/:id/links", deps.Documents.Links)
	g.GET("/documents/:id/similar", deps.Documents.Similar)
	g.GET("/documents/:id/versions", deps.Versions.List)
	g.GET("/documents/:id/versions/:version", deps.Versions.Get)
	g.POST("/documents/:id/share", deps.Shares.Create)
	g.PUT("/documents/:id/share", deps.Shares.UpdateConfig)
	g.GET("/documents/:id/share", deps.Shares.GetActive)
	g.DELETE("/documents/:id/share", deps.Shares.Revoke)
	g.GET("/shares", deps.Shares.List)
}

func registerFeatureRoutes(g *gin.RouterGroup, deps RouterDeps) {
	g.POST("/tags", deps.Tags.Create)
	g.POST("/tags/batch", deps.Tags.CreateBatch)
	g.POST("/tags/ids", deps.Tags.ListByIDs)
	g.GET("/tags", deps.Tags.List)
	g.GET("/tags/summary", deps.Tags.Summary)
	g.PUT("/tags/:id/pin", deps.Tags.Pin)
	g.DELETE("/tags/:id", deps.Tags.Delete)
	g.GET("/export", deps.Export.Export)
	g.GET("/export/notes", deps.Export.ExportNotes)
	g.POST("/export/confluence-html", deps.Export.ConvertMarkdownToConfluenceHTML)
	g.POST("/files/upload", deps.Files.Upload)
	g.GET("/ai/search", deps.SemanticSearch.Search)
	g.POST("/import/hedgedoc/upload", deps.Import.HedgeDocUpload)
	g.GET("/import/hedgedoc/:job_id/preview", deps.Import.HedgeDocPreview)
	g.POST("/import/hedgedoc/:job_id/confirm", deps.Import.HedgeDocConfirm)
	g.GET("/import/hedgedoc/:job_id/status", deps.Import.HedgeDocStatus)
	g.POST("/import/notes/upload", deps.Import.NotesUpload)
	g.GET("/import/notes/:job_id/preview", deps.Import.NotesPreview)
	g.POST("/import/notes/:job_id/confirm", deps.Import.NotesConfirm)
	g.GET("/import/notes/:job_id/status", deps.Import.NotesStatus)
	g.GET("/templates", deps.Templates.List)
	g.GET("/templates/meta", deps.Templates.ListMeta)
	g.GET("/templates/:id", deps.Templates.Get)
	g.POST("/templates", deps.Templates.Create)
	g.PUT("/templates/:id", deps.Templates.Update)
	g.DELETE("/templates/:id", deps.Templates.Delete)
	g.POST("/templates/:id/create", deps.Templates.CreateDocument)
	g.GET("/assets", deps.Assets.List)
	g.GET("/assets/:id/references", deps.Assets.References)
	g.POST("/todos", deps.Todos.Create)
	g.GET("/todos", deps.Todos.List)
	g.PUT("/todos/:id", deps.Todos.Update)
	g.PUT("/todos/:id/done", deps.Todos.ToggleDone)
	g.DELETE("/todos/:id", deps.Todos.Delete)
}
