package handler

import (
	"github.com/gin-gonic/gin"

	"github.com/xxxsen/mnote/internal/pkg/response"
)

type Properties struct {
	EnableGithubOauth   bool `json:"enable_github_oauth"`
	EnableGoogleOauth   bool `json:"enable_google_oauth"`
	EnableUserRegister  bool `json:"enable_user_register"`
	EnableEmailRegister bool `json:"enable_email_register"`
	EnableTestMode      bool `json:"enable_test_mode"`
}

type BannerConfig struct {
	Enable   bool   `json:"enable"`
	Title    string `json:"title"`
	Wording  string `json:"wording"`
	Redirect string `json:"redirect"`
}

type PropertiesHandler struct {
	properties Properties
	banner     BannerConfig
}

func NewPropertiesHandler(properties Properties, banner BannerConfig) *PropertiesHandler {
	return &PropertiesHandler{properties: properties, banner: banner}
}

func (h *PropertiesHandler) Get(c *gin.Context) {
	response.Success(c, gin.H{"properties": h.properties, "banner": h.banner})
}
