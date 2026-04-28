package handler

import (
	"time"

	"github.com/gin-gonic/gin"

	"github.com/xxxsen/mnote/internal/middleware"
)

type RouterDeps struct {
	Auth       *AuthHandler
	OAuth      *OAuthHandler
	Properties *PropertiesHandler
	Documents  *DocumentHandler
	Versions   *VersionHandler
	Shares     *ShareHandler
	Tags       *TagHandler
	Export     *ExportHandler
	Files      *FileHandler
	SavedViews *SavedViewHandler
	AI         *AIHandler
	Import     *ImportHandler
	Templates  *TemplateHandler
	Assets     *AssetHandler
	Todos      *TodoHandler
	JWTSecret  []byte
}

func RegisterRoutes(api *gin.RouterGroup, deps RouterDeps) {
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
	g.PUT("/documents/:id/summary", deps.Documents.UpdateSummary)
	g.PUT("/documents/:id/pin", deps.Documents.Pin)
	g.PUT("/documents/:id/star", deps.Documents.Star)
	g.DELETE("/documents/:id", deps.Documents.Delete)
	g.GET("/documents/:id/backlinks", deps.Documents.Backlinks)
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
	g.GET("/saved-views", deps.SavedViews.List)
	g.POST("/saved-views", deps.SavedViews.Create)
	g.DELETE("/saved-views/:id", deps.SavedViews.Delete)
	g.POST("/ai/polish", deps.AI.Polish)
	g.POST("/ai/generate", deps.AI.Generate)
	g.POST("/ai/summary", deps.AI.Summary)
	g.POST("/ai/tags", deps.AI.Tags)
	g.GET("/ai/search", deps.AI.Search)
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
