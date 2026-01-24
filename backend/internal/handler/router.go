package handler

import (
	"github.com/gin-gonic/gin"

	"mnote/internal/middleware"
)

type RouterDeps struct {
	Auth      *AuthHandler
	Documents *DocumentHandler
	Versions  *VersionHandler
	Shares    *ShareHandler
	Tags      *TagHandler
	Export    *ExportHandler
	JWTSecret []byte
}

func NewRouter(deps RouterDeps) *gin.Engine {
	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(middleware.RequestID())
	router.Use(middleware.CORS())

	api := router.Group("/api/v1")
	api.POST("/auth/register", deps.Auth.Register)
	api.POST("/auth/login", deps.Auth.Login)
	api.POST("/auth/logout", deps.Auth.Logout)

	authGroup := api.Group("")
	authGroup.Use(middleware.JWTAuth(deps.JWTSecret))
	authGroup.POST("/documents", deps.Documents.Create)
	authGroup.GET("/documents", deps.Documents.List)
	authGroup.GET("/documents/:id", deps.Documents.Get)
	authGroup.PUT("/documents/:id", deps.Documents.Update)
	authGroup.DELETE("/documents/:id", deps.Documents.Delete)

	authGroup.GET("/documents/:id/versions", deps.Versions.List)
	authGroup.GET("/documents/:id/versions/:version", deps.Versions.Get)

	authGroup.POST("/documents/:id/share", deps.Shares.Create)
	authGroup.DELETE("/documents/:id/share", deps.Shares.Revoke)

	authGroup.POST("/tags", deps.Tags.Create)
	authGroup.GET("/tags", deps.Tags.List)
	authGroup.DELETE("/tags/:id", deps.Tags.Delete)

	authGroup.GET("/export", deps.Export.Export)

	api.GET("/public/share/:token", deps.Shares.PublicGet)

	return router
}
