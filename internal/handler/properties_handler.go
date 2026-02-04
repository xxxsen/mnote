package handler

import (
	"github.com/gin-gonic/gin"

	"github.com/xxxsen/mnote/internal/config"
	"github.com/xxxsen/mnote/internal/pkg/response"
)

type PropertiesHandler struct {
	properties config.Properties
	banner     config.BannerConfig
}

func NewPropertiesHandler(properties config.Properties, banner config.BannerConfig) *PropertiesHandler {
	return &PropertiesHandler{properties: properties, banner: banner}
}

func (h *PropertiesHandler) Get(c *gin.Context) {
	response.Success(c, gin.H{"properties": h.properties, "banner": h.banner})
}
