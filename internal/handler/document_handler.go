package handler

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/pkg/errcode"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/response"
	"github.com/xxxsen/mnote/internal/pkg/safeconv"
	"github.com/xxxsen/mnote/internal/service"
)

type DocumentHandler struct {
	documents IDocumentService
}

func NewDocumentHandler(documents IDocumentService) *DocumentHandler {
	return &DocumentHandler{documents: documents}
}

type documentRequest struct {
	Title   string    `json:"title"`
	Content string    `json:"content"`
	TagIDs  *[]string `json:"tag_ids"`
	// BaseRevision is the optimistic-lock precondition. SaveSeq is retained
	// during rolling upgrades but does not decide conflicts on this HTTP path.
	BaseRevision *int64 `json:"base_revision,omitempty"`
	SaveSeq      *int64 `json:"save_seq,omitempty"`
}

type tagUpdateRequest struct {
	TagIDs *[]string `json:"tag_ids"`
}

type documentListItem struct {
	documentResponse
	TagIDs []string      `json:"tag_ids"`
	Tags   []tagResponse `json:"tags,omitempty"`
}

type linkedDocumentResponse struct {
	ID     string `json:"id"`
	Title  string `json:"title"`
	Mtime  int64  `json:"mtime"`
	Mutual bool   `json:"mutual"`
}

type documentLinkPageResponse struct {
	Items      []linkedDocumentResponse `json:"items"`
	NextCursor string                   `json:"next_cursor"`
}

type documentLinkCountsResponse struct {
	Incoming int64 `json:"incoming"`
	Outgoing int64 `json:"outgoing"`
	Unique   int64 `json:"unique"`
}

type documentLinksResponse struct {
	Counts   documentLinkCountsResponse `json:"counts"`
	Incoming *documentLinkPageResponse  `json:"incoming,omitempty"`
	Outgoing *documentLinkPageResponse  `json:"outgoing,omitempty"`
}

func (h *DocumentHandler) Create(c *gin.Context) {
	var req documentRequest
	if err := bindJSON(c, &req); err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	if req.Title == "" {
		response.Error(c, errcode.ErrInvalid, "title required")
		return
	}
	var tagIDs []string
	if req.TagIDs != nil {
		tagIDs = *req.TagIDs
	}
	doc, err := h.documents.Create(c.Request.Context(), getUserID(c), service.DocumentCreateInput{
		Title:   req.Title,
		Content: req.Content,
		TagIDs:  tagIDs,
	})
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, toDocumentResponse(*doc))
}

type listParams struct {
	query       string
	tagID       string
	starred     *int
	limit       uint
	offset      uint
	orderBy     string
	includeTags bool
}

func parseListParams(c *gin.Context) (listParams, error) {
	p := listParams{
		query: c.Query("q"),
		tagID: c.Query("tag_id"),
	}
	if value, exists := c.GetQuery("starred"); exists {
		parsed, err := strconv.Atoi(value)
		if err != nil || (parsed != 0 && parsed != 1) {
			return listParams{}, appErr.ErrInvalid
		}
		p.starred = &parsed
	}
	page, err := parsePage(c, 50, 200)
	if err != nil {
		return listParams{}, err
	}
	p.limit = safeconv.IntToUint(page.Limit)
	p.offset = safeconv.IntToUint(page.Offset)
	if c.Query("order") == "mtime" {
		p.orderBy = "mtime desc"
	}
	if value := c.Query("include"); value != "" {
		for _, part := range strings.Split(value, ",") {
			if strings.TrimSpace(part) == "tags" {
				p.includeTags = true
				break
			}
		}
	}
	return p, nil
}

func buildListItems(
	docs []model.Document, tagMap map[string][]string,
	tagIndex map[string]model.Tag, includeTags bool,
) []documentListItem {
	items := make([]documentListItem, 0, len(docs))
	for _, doc := range docs {
		tagIDs := tagMap[doc.ID]
		if tagIDs == nil {
			tagIDs = []string{}
		}
		item := documentListItem{
			documentResponse: toDocumentResponse(doc),
			TagIDs:           tagIDs,
		}
		if includeTags {
			tags := make([]tagResponse, 0, len(tagIDs))
			for _, id := range tagIDs {
				if tag, ok := tagIndex[id]; ok {
					tags = append(tags, toTagResponse(tag))
				}
			}
			item.Tags = tags
		}
		items = append(items, item)
	}
	return items
}

func (h *DocumentHandler) List(c *gin.Context) {
	userID := getUserID(c)
	p, err := parseListParams(c)
	if err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid pagination")
		return
	}
	docs, err := h.documents.Search(
		c.Request.Context(), userID, p.query, p.tagID,
		p.starred, p.limit, p.offset, p.orderBy,
	)
	if err != nil {
		handleError(c, err)
		return
	}
	ids := make([]string, 0, len(docs))
	for _, doc := range docs {
		ids = append(ids, doc.ID)
	}
	tagMap, err := h.documents.ListTagIDsByDocIDs(c.Request.Context(), userID, ids)
	if err != nil {
		handleError(c, err)
		return
	}
	var tagIndex map[string]model.Tag
	if p.includeTags {
		tagIndex, err = h.buildTagIndex(c, userID, tagMap)
		if err != nil {
			handleError(c, err)
			return
		}
	}
	response.Success(c, buildListItems(docs, tagMap, tagIndex, p.includeTags))
}

func (h *DocumentHandler) buildTagIndex(
	c *gin.Context, userID string, tagMap map[string][]string,
) (map[string]model.Tag, error) {
	uniqueIDs := collectUniqueTagIDs(tagMap)
	if len(uniqueIDs) == 0 {
		return map[string]model.Tag{}, nil
	}
	tags, err := h.documents.ListTagsByIDs(c.Request.Context(), userID, uniqueIDs)
	if err != nil {
		return nil, fmt.Errorf("list tags: %w", err)
	}
	idx := make(map[string]model.Tag, len(tags))
	for _, tag := range tags {
		idx[tag.ID] = tag
	}
	return idx, nil
}

func collectUniqueTagIDs(tagMap map[string][]string) []string {
	seen := make(map[string]struct{})
	out := make([]string, 0)
	for _, ids := range tagMap {
		for _, id := range ids {
			if _, ok := seen[id]; ok {
				continue
			}
			seen[id] = struct{}{}
			out = append(out, id)
		}
	}
	return out
}

func (h *DocumentHandler) Get(c *gin.Context) {
	userID := getUserID(c)
	includeTags := false
	if value := c.Query("include"); value != "" {
		for _, part := range strings.Split(value, ",") {
			if strings.TrimSpace(part) == "tags" {
				includeTags = true
				break
			}
		}
	}
	doc, err := h.documents.Get(c.Request.Context(), userID, c.Param("id"))
	if err != nil {
		handleError(c, err)
		return
	}
	tagIDs, err := h.documents.ListTagIDs(c.Request.Context(), userID, c.Param("id"))
	if err != nil {
		handleError(c, err)
		return
	}
	if includeTags && len(tagIDs) > 0 {
		tags, err := h.documents.ListTagsByIDs(c.Request.Context(), userID, tagIDs)
		if err != nil {
			handleError(c, err)
			return
		}
		response.Success(c, gin.H{
			"document": toDocumentResponse(*doc),
			"tag_ids":  tagIDs,
			"tags":     toTagResponses(tags),
		})
		return
	}
	response.Success(c, gin.H{"document": toDocumentResponse(*doc), "tag_ids": tagIDs})
}

func (h *DocumentHandler) Update(c *gin.Context) {
	var req documentRequest
	if err := bindJSON(c, &req); err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	if req.Title == "" {
		response.Error(c, errcode.ErrInvalid, "title required")
		return
	}
	if req.BaseRevision == nil || *req.BaseRevision <= 0 {
		response.Error(c, errcode.ErrEditorClientUpgradeRequired, "editor client update required")
		return
	}
	if req.SaveSeq == nil || *req.SaveSeq <= 0 {
		response.Error(c, errcode.ErrInvalid, "save_seq required")
		return
	}
	var tagIDs []string
	if req.TagIDs != nil {
		tagIDs = *req.TagIDs
	}
	result, err := h.documents.Save(c.Request.Context(), getUserID(c), c.Param("id"),
		service.DocumentUpdateInput{
			Title:        req.Title,
			Content:      req.Content,
			TagIDs:       tagIDs,
			BaseRevision: *req.BaseRevision,
			SaveSeq:      *req.SaveSeq,
		},
	)
	if err != nil {
		handleError(c, err)
		return
	}
	// The response is metadata-only. On conflict the client keeps its local
	// draft and fetches the current server body through the read endpoint.
	response.Success(c, gin.H{
		"id":               result.ID,
		"accepted":         result.Accepted,
		"reason":           result.Reason,
		"version":          result.ContentRevision,
		"content_revision": result.ContentRevision,
		"content_hash":     result.ContentHash,
		"content_mtime":    result.ContentMtime,
		"mtime":            result.Mtime,
	})
}

func (h *DocumentHandler) UpdateTags(c *gin.Context) {
	var req tagUpdateRequest
	if err := bindJSON(c, &req); err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	if req.TagIDs == nil {
		response.Error(c, errcode.ErrInvalid, "tag_ids required")
		return
	}
	if err := h.documents.UpdateTags(c.Request.Context(), getUserID(c), c.Param("id"), *req.TagIDs); err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"ok": true})
}

type pinRequest struct {
	Pinned bool `json:"pinned"`
}

func (h *DocumentHandler) Pin(c *gin.Context) {
	var req pinRequest
	if err := bindJSON(c, &req); err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	pinnedValue := 0
	if req.Pinned {
		pinnedValue = 1
	}
	if err := h.documents.UpdatePinned(c.Request.Context(), getUserID(c), c.Param("id"), pinnedValue); err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"ok": true})
}

type starRequest struct {
	Starred bool `json:"starred"`
}

func (h *DocumentHandler) Star(c *gin.Context) {
	var req starRequest
	if err := bindJSON(c, &req); err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	starredValue := 0
	if req.Starred {
		starredValue = 1
	}
	if err := h.documents.UpdateStarred(c.Request.Context(), getUserID(c), c.Param("id"), starredValue); err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"ok": true})
}

func (h *DocumentHandler) Delete(c *gin.Context) {
	if err := h.documents.Delete(c.Request.Context(), getUserID(c), c.Param("id")); err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"ok": true})
}

func (h *DocumentHandler) Summary(c *gin.Context) {
	page, err := parsePage(c, 5, 20)
	if err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid pagination")
		return
	}
	result, err := h.documents.Overview(
		c.Request.Context(), getUserID(c), safeconv.IntToUint(page.Limit),
	)
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{
		"recent":        toDocumentResponses(result.Recent),
		"tag_counts":    result.TagCounts,
		"total":         result.Total,
		"starred_total": result.StarredTotal,
	})
}

func (h *DocumentHandler) Backlinks(c *gin.Context) {
	docs, err := h.documents.GetBacklinks(c.Request.Context(), getUserID(c), c.Param("id"))
	if err != nil {
		handleError(c, err)
		return
	}

	docIDs := make([]string, 0, len(docs))
	for _, doc := range docs {
		docIDs = append(docIDs, doc.ID)
	}

	tagIDsByDoc, err := h.documents.ListTagIDsByDocIDs(c.Request.Context(), getUserID(c), docIDs)
	if err != nil {
		handleError(c, err)
		return
	}

	var allTagIDs []string
	seenTags := make(map[string]bool)
	for _, tagIDs := range tagIDsByDoc {
		for _, tid := range tagIDs {
			if !seenTags[tid] {
				seenTags[tid] = true
				allTagIDs = append(allTagIDs, tid)
			}
		}
	}

	tags, err := h.documents.ListTagsByIDs(c.Request.Context(), getUserID(c), allTagIDs)
	if err != nil {
		handleError(c, err)
		return
	}
	tagMap := make(map[string]model.Tag)
	for _, t := range tags {
		tagMap[t.ID] = t
	}

	items := make([]documentListItem, 0, len(docs))
	for _, doc := range docs {
		docTagIDs := tagIDsByDoc[doc.ID]
		if docTagIDs == nil {
			docTagIDs = []string{}
		}
		docTags := make([]tagResponse, 0, len(docTagIDs))
		for _, tid := range docTagIDs {
			if t, ok := tagMap[tid]; ok {
				docTags = append(docTags, toTagResponse(t))
			}
		}
		items = append(items, documentListItem{
			documentResponse: toDocumentResponse(doc),
			Tags:             docTags,
			TagIDs:           docTagIDs,
		})
	}

	response.Success(c, items)
}

func toDocumentLinkPageResponse(
	page *model.DocumentLinkPage,
) *documentLinkPageResponse {
	if page == nil {
		return nil
	}
	items := make([]linkedDocumentResponse, 0, len(page.Items))
	for _, item := range page.Items {
		items = append(items, linkedDocumentResponse{
			ID: item.ID, Title: item.Title, Mtime: item.Mtime, Mutual: item.Mutual,
		})
	}
	return &documentLinkPageResponse{
		Items:      items,
		NextCursor: page.NextCursor,
	}
}

func (h *DocumentHandler) Links(c *gin.Context) {
	if _, exists := c.GetQuery("offset"); exists {
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	include, includeProvided := c.GetQuery("include")
	if includeProvided && strings.TrimSpace(include) == "" {
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	limit := service.DefaultDocumentLinksLimit
	if raw, exists := c.GetQuery("limit"); exists {
		value, err := strconv.Atoi(raw)
		if err != nil ||
			value < 1 ||
			value > service.MaxDocumentLinksLimit {
			response.Error(c, errcode.ErrInvalid, "invalid request")
			return
		}
		limit = value
	}
	result, err := h.documents.ListLinks(
		c.Request.Context(),
		getUserID(c),
		c.Param("id"),
		service.DocumentLinksInput{
			Include:        include,
			Limit:          limit,
			IncomingCursor: c.Query("incoming_cursor"),
			OutgoingCursor: c.Query("outgoing_cursor"),
		},
	)
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, documentLinksResponse{
		Counts: documentLinkCountsResponse{
			Incoming: result.Counts.Incoming,
			Outgoing: result.Counts.Outgoing,
			Unique:   result.Counts.Unique,
		},
		Incoming: toDocumentLinkPageResponse(result.Incoming),
		Outgoing: toDocumentLinkPageResponse(result.Outgoing),
	})
}

func (h *DocumentHandler) Similar(c *gin.Context) {
	page, err := parsePage(c, 5, 20)
	if err != nil || page.Offset != 0 {
		response.Error(c, errcode.ErrInvalid, "invalid pagination")
		return
	}
	result, err := h.documents.SimilarDocuments(
		c.Request.Context(),
		getUserID(c),
		c.Param("id"),
		page.Limit,
	)
	if err != nil {
		handleError(c, err)
		return
	}
	type similarDocumentResponse struct {
		documentResponse
		Score float32 `json:"score"`
	}
	items := make([]similarDocumentResponse, 0, len(result.Documents))
	for index, document := range result.Documents {
		score := float32(0)
		if index < len(result.Scores) {
			score = result.Scores[index]
		}
		items = append(items, similarDocumentResponse{
			documentResponse: toDocumentResponse(document),
			Score:            score,
		})
	}
	response.Success(c, gin.H{
		"items":        items,
		"index_status": result.IndexStatus,
	})
}
