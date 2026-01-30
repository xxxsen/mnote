package handler

import (
	"github.com/gin-gonic/gin"

	"github.com/xxxsen/mnote/internal/middleware"
)

type RouterDeps struct {
	Auth      *AuthHandler
	Documents *DocumentHandler
	Versions  *VersionHandler
	Shares    *ShareHandler
	Tags      *TagHandler
	Export    *ExportHandler
	Files     *FileHandler
	AI        *AIHandler
	Import    *ImportHandler
	JWTSecret []byte
}

func RegisterRoutes(api *gin.RouterGroup, deps RouterDeps) {
	api.POST("/auth/register", deps.Auth.Register)
	api.POST("/auth/login", deps.Auth.Login)
	api.POST("/auth/logout", deps.Auth.Logout)

	authGroup := api.Group("")
	authGroup.Use(middleware.JWTAuth(deps.JWTSecret))
	authGroup.POST("/documents", deps.Documents.Create)
	authGroup.GET("/documents", deps.Documents.List)
	authGroup.GET("/documents/summary", deps.Documents.Summary)
	authGroup.GET("/documents/:id", deps.Documents.Get)
	authGroup.PUT("/documents/:id", deps.Documents.Update)
	authGroup.PUT("/documents/:id/tags", deps.Documents.UpdateTags)
	authGroup.PUT("/documents/:id/summary", deps.Documents.UpdateSummary)
	authGroup.PUT("/documents/:id/pin", deps.Documents.Pin)
	authGroup.PUT("/documents/:id/star", deps.Documents.Star)
	authGroup.DELETE("/documents/:id", deps.Documents.Delete)

	authGroup.GET("/documents/:id/versions", deps.Versions.List)
	authGroup.GET("/documents/:id/versions/:version", deps.Versions.Get)

	authGroup.POST("/documents/:id/share", deps.Shares.Create)
	authGroup.GET("/documents/:id/share", deps.Shares.GetActive)
	authGroup.DELETE("/documents/:id/share", deps.Shares.Revoke)

	authGroup.POST("/tags", deps.Tags.Create)
	authGroup.POST("/tags/batch", deps.Tags.CreateBatch)
	authGroup.POST("/tags/ids", deps.Tags.ListByIDs)
	authGroup.GET("/tags", deps.Tags.List)
	authGroup.GET("/tags/summary", deps.Tags.Summary)
	authGroup.PUT("/tags/:id/pin", deps.Tags.Pin)
	authGroup.DELETE("/tags/:id", deps.Tags.Delete)

	authGroup.GET("/export", deps.Export.Export)
	authGroup.POST("/files/upload", deps.Files.Upload)
	authGroup.POST("/ai/polish", deps.AI.Polish)
	authGroup.POST("/ai/generate", deps.AI.Generate)
	authGroup.POST("/ai/summary", deps.AI.Summary)
	authGroup.POST("/ai/tags", deps.AI.Tags)
	authGroup.POST("/import/hedgedoc/upload", deps.Import.HedgeDocUpload)
	authGroup.GET("/import/hedgedoc/:job_id/preview", deps.Import.HedgeDocPreview)
	authGroup.POST("/import/hedgedoc/:job_id/confirm", deps.Import.HedgeDocConfirm)
	authGroup.GET("/import/hedgedoc/:job_id/status", deps.Import.HedgeDocStatus)

	api.GET("/public/share/:token", deps.Shares.PublicGet)
	api.GET("/files/:key", deps.Files.Get)
}
