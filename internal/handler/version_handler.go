package handler

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/xxxsen/mnote/internal/pkg/errcode"
	"github.com/xxxsen/mnote/internal/pkg/response"
	"github.com/xxxsen/mnote/internal/service"
)

type VersionHandler struct {
	documents *service.DocumentService
}

func NewVersionHandler(documents *service.DocumentService) *VersionHandler {
	return &VersionHandler{documents: documents}
}

func (h *VersionHandler) List(c *gin.Context) {
	versions, err := h.documents.ListVersions(c.Request.Context(), getUserID(c), c.Param("id"))
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, versions)
}

func (h *VersionHandler) Get(c *gin.Context) {
	versionNumber, err := strconv.Atoi(c.Param("version"))
	if err != nil || versionNumber <= 0 {
		response.Error(c, errcode.ErrInvalid, "invalid version")
		return
	}
	version, err := h.documents.GetVersion(c.Request.Context(), getUserID(c), c.Param("id"), versionNumber)
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, version)
}
