package handler

import (
	"github.com/gin-gonic/gin"

	"github.com/xxxsen/mnote/internal/config"
	"github.com/xxxsen/mnote/internal/pkg/response"
)

type PropertiesHandler struct {
	properties config.Properties
}

func NewPropertiesHandler(properties config.Properties) *PropertiesHandler {
	return &PropertiesHandler{properties: properties}
}

func (h *PropertiesHandler) Get(c *gin.Context) {
	response.Success(c, gin.H{"properties": h.properties})
}
