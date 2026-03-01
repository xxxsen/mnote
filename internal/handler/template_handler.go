package handler

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/xxxsen/mnote/internal/pkg/errcode"
	"github.com/xxxsen/mnote/internal/pkg/response"
	"github.com/xxxsen/mnote/internal/service"
)

type TemplateHandler struct {
	templates *service.TemplateService
}

func NewTemplateHandler(templates *service.TemplateService) *TemplateHandler {
	return &TemplateHandler{templates: templates}
}

type templateRequest struct {
	Name          string   `json:"name"`
	Description   string   `json:"description"`
	Content       string   `json:"content"`
	DefaultTagIDs []string `json:"default_tag_ids"`
}

type createDocumentFromTemplateRequest struct {
	Title          string            `json:"title"`
	Variables      map[string]string `json:"variables"`
	PreviewContent string            `json:"preview_content"`
}

func (h *TemplateHandler) List(c *gin.Context) {
	items, err := h.templates.List(c.Request.Context(), getUserID(c))
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, items)
}

func (h *TemplateHandler) ListMeta(c *gin.Context) {
	limit := 20
	if raw := c.Query("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			response.Error(c, errcode.ErrInvalid, "invalid limit")
			return
		}
		limit = parsed
	}
	offset := 0
	if raw := c.Query("offset"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			response.Error(c, errcode.ErrInvalid, "invalid offset")
			return
		}
		offset = parsed
	}
	items, err := h.templates.ListMeta(c.Request.Context(), getUserID(c), limit, offset)
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, items)
}

func (h *TemplateHandler) Get(c *gin.Context) {
	item, err := h.templates.Get(c.Request.Context(), getUserID(c), c.Param("id"))
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, item)
}

func (h *TemplateHandler) Create(c *gin.Context) {
	var req templateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	item, err := h.templates.Create(c.Request.Context(), getUserID(c), service.CreateTemplateInput{
		Name:          req.Name,
		Description:   req.Description,
		Content:       req.Content,
		DefaultTagIDs: req.DefaultTagIDs,
	})
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, item)
}

func (h *TemplateHandler) Update(c *gin.Context) {
	var req templateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	if err := h.templates.Update(c.Request.Context(), getUserID(c), c.Param("id"), service.UpdateTemplateInput{
		Name:          req.Name,
		Description:   req.Description,
		Content:       req.Content,
		DefaultTagIDs: req.DefaultTagIDs,
	}); err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"ok": true})
}

func (h *TemplateHandler) Delete(c *gin.Context) {
	if err := h.templates.Delete(c.Request.Context(), getUserID(c), c.Param("id")); err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"ok": true})
}

func (h *TemplateHandler) CreateDocument(c *gin.Context) {
	var req createDocumentFromTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	doc, err := h.templates.CreateDocumentFromTemplate(c.Request.Context(), getUserID(c), service.CreateDocumentFromTemplateInput{
		TemplateID: c.Param("id"),
		Title:      req.Title,
		Variables:  req.Variables,
	})
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, doc)
}
