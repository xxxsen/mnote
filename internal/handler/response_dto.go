package handler

import (
	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/service"
)

// Response DTOs deliberately enumerate the public HTTP contract. Repository
// models may gain internal columns without those fields becoming API output.

type userResponse struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Ctime int64  `json:"ctime"`
	Mtime int64  `json:"mtime"`
}

func toUserResponse(user *model.User) *userResponse {
	if user == nil {
		return nil
	}
	return &userResponse{
		ID: user.ID, Email: user.Email, Ctime: user.Ctime, Mtime: user.Mtime,
	}
}

type documentResponse struct {
	ID              string `json:"id"`
	UserID          string `json:"user_id"`
	Title           string `json:"title"`
	Content         string `json:"content"`
	Summary         string `json:"summary"`
	State           int    `json:"state"`
	Pinned          int    `json:"pinned"`
	Starred         int    `json:"starred"`
	Ctime           int64  `json:"ctime"`
	Mtime           int64  `json:"mtime"`
	ContentHash     string `json:"content_hash"`
	ContentMtime    int64  `json:"content_mtime"`
	ContentRevision int64  `json:"content_revision"`
}

func toDocumentResponse(doc model.Document) documentResponse {
	return documentResponse{
		ID:              doc.ID,
		UserID:          doc.UserID,
		Title:           doc.Title,
		Content:         doc.Content,
		Summary:         doc.Summary,
		State:           doc.State,
		Pinned:          doc.Pinned,
		Starred:         doc.Starred,
		Ctime:           doc.Ctime,
		Mtime:           doc.Mtime,
		ContentHash:     doc.ContentHash,
		ContentMtime:    doc.ContentMtime,
		ContentRevision: doc.ContentRevision,
	}
}

func toDocumentResponses(docs []model.Document) []documentResponse {
	items := make([]documentResponse, 0, len(docs))
	for _, doc := range docs {
		items = append(items, toDocumentResponse(doc))
	}
	return items
}

type tagResponse struct {
	ID     string `json:"id"`
	UserID string `json:"user_id"`
	Name   string `json:"name"`
	Pinned int    `json:"pinned"`
	Ctime  int64  `json:"ctime"`
	Mtime  int64  `json:"mtime"`
}

func toTagResponse(tag model.Tag) tagResponse {
	return tagResponse{
		ID: tag.ID, UserID: tag.UserID, Name: tag.Name, Pinned: tag.Pinned,
		Ctime: tag.Ctime, Mtime: tag.Mtime,
	}
}

func toTagResponses(tags []model.Tag) []tagResponse {
	items := make([]tagResponse, 0, len(tags))
	for _, tag := range tags {
		items = append(items, toTagResponse(tag))
	}
	return items
}

type tagSummaryResponse struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Pinned int    `json:"pinned"`
	Count  int    `json:"count"`
}

func toTagSummaryResponses(tags []model.TagSummary) []tagSummaryResponse {
	items := make([]tagSummaryResponse, 0, len(tags))
	for _, tag := range tags {
		items = append(items, tagSummaryResponse{
			ID: tag.ID, Name: tag.Name, Pinned: tag.Pinned, Count: tag.Count,
		})
	}
	return items
}

type todoResponse struct {
	ID      string `json:"id"`
	UserID  string `json:"user_id"`
	Content string `json:"content"`
	DueDate string `json:"due_date"`
	Done    int    `json:"done"`
	Ctime   int64  `json:"ctime"`
	Mtime   int64  `json:"mtime"`
}

func toTodoResponse(todo model.Todo) todoResponse {
	return todoResponse{
		ID: todo.ID, UserID: todo.UserID, Content: todo.Content,
		DueDate: todo.DueDate, Done: todo.Done, Ctime: todo.Ctime, Mtime: todo.Mtime,
	}
}

func toTodoResponses(todos []model.Todo) []todoResponse {
	items := make([]todoResponse, 0, len(todos))
	for _, todo := range todos {
		items = append(items, toTodoResponse(todo))
	}
	return items
}

type templateResponse struct {
	ID            string   `json:"id"`
	UserID        string   `json:"user_id"`
	Name          string   `json:"name"`
	Description   string   `json:"description"`
	Content       string   `json:"content"`
	DefaultTagIDs []string `json:"default_tag_ids"`
	BuiltIn       int      `json:"built_in"`
	Ctime         int64    `json:"ctime"`
	Mtime         int64    `json:"mtime"`
}

func toTemplateResponse(item model.Template) templateResponse {
	return templateResponse{
		ID: item.ID, UserID: item.UserID, Name: item.Name,
		Description: item.Description, Content: item.Content,
		DefaultTagIDs: item.DefaultTagIDs, BuiltIn: item.BuiltIn,
		Ctime: item.Ctime, Mtime: item.Mtime,
	}
}

func toTemplateResponses(items []model.Template) []templateResponse {
	result := make([]templateResponse, 0, len(items))
	for _, item := range items {
		result = append(result, toTemplateResponse(item))
	}
	return result
}

type templateMetaResponse struct {
	ID            string   `json:"id"`
	UserID        string   `json:"user_id"`
	Name          string   `json:"name"`
	Description   string   `json:"description"`
	DefaultTagIDs []string `json:"default_tag_ids"`
	BuiltIn       int      `json:"built_in"`
	Ctime         int64    `json:"ctime"`
	Mtime         int64    `json:"mtime"`
}

type templateMetaListResponse struct {
	Items []templateMetaResponse `json:"items"`
	Total int                    `json:"total"`
}

func toTemplateMetaListResponse(
	result *service.TemplateMetaListResult,
) *templateMetaListResponse {
	if result == nil {
		return nil
	}
	items := make([]templateMetaResponse, 0, len(result.Items))
	for _, item := range result.Items {
		items = append(items, templateMetaResponse{
			ID: item.ID, UserID: item.UserID, Name: item.Name,
			Description: item.Description, DefaultTagIDs: item.DefaultTagIDs,
			BuiltIn: item.BuiltIn, Ctime: item.Ctime, Mtime: item.Mtime,
		})
	}
	return &templateMetaListResponse{Items: items, Total: result.Total}
}

type shareResponse struct {
	ID            string `json:"id"`
	UserID        string `json:"user_id"`
	DocumentID    string `json:"document_id"`
	Token         string `json:"token"`
	State         int    `json:"state"`
	ExpiresAt     int64  `json:"expires_at"`
	Password      string `json:"password,omitempty"`
	HasPassword   bool   `json:"has_password"`
	Permission    int    `json:"permission"`
	AllowDownload int    `json:"allow_download"`
	Ctime         int64  `json:"ctime"`
	Mtime         int64  `json:"mtime"`
}

func toShareResponse(share *model.Share) *shareResponse {
	if share == nil {
		return nil
	}
	return &shareResponse{
		ID: share.ID, UserID: share.UserID, DocumentID: share.DocumentID,
		Token: share.Token, State: share.State, ExpiresAt: share.ExpiresAt,
		Password: share.Password, HasPassword: share.HasPassword,
		Permission: share.Permission, AllowDownload: share.AllowDownload,
		Ctime: share.Ctime, Mtime: share.Mtime,
	}
}

type shareCommentResponse struct {
	ID         string `json:"id"`
	ShareID    string `json:"share_id"`
	DocumentID string `json:"document_id"`
	RootID     string `json:"root_id"`
	ReplyToID  string `json:"reply_to_id"`
	Author     string `json:"author"`
	Content    string `json:"content"`
	State      int    `json:"state"`
	ReplyCount int    `json:"reply_count"`
	Ctime      int64  `json:"ctime"`
	Mtime      int64  `json:"mtime"`
}

func toShareCommentResponse(item model.ShareComment) shareCommentResponse {
	return shareCommentResponse{
		ID: item.ID, ShareID: item.ShareID, DocumentID: item.DocumentID,
		RootID: item.RootID, ReplyToID: item.ReplyToID, Author: item.Author,
		Content: item.Content, State: item.State, ReplyCount: item.ReplyCount,
		Ctime: item.Ctime, Mtime: item.Mtime,
	}
}

func toShareCommentResponses(items []model.ShareComment) []shareCommentResponse {
	result := make([]shareCommentResponse, 0, len(items))
	for _, item := range items {
		result = append(result, toShareCommentResponse(item))
	}
	return result
}

type shareCommentWithRepliesResponse struct {
	shareCommentResponse
	Replies []shareCommentResponse `json:"replies"`
}

type shareCommentListResponse struct {
	Items []shareCommentWithRepliesResponse `json:"items"`
	Total int                               `json:"total"`
}

func toShareCommentListResponse(
	result *service.ShareCommentListResult,
) *shareCommentListResponse {
	if result == nil {
		return nil
	}
	items := make([]shareCommentWithRepliesResponse, 0, len(result.Items))
	for _, item := range result.Items {
		items = append(items, shareCommentWithRepliesResponse{
			shareCommentResponse: toShareCommentResponse(item.ShareComment),
			Replies:              toShareCommentResponses(item.Replies),
		})
	}
	return &shareCommentListResponse{Items: items, Total: result.Total}
}

type publicShareDetailResponse struct {
	Document      *documentResponse `json:"document"`
	Author        string            `json:"author"`
	Tags          []tagResponse     `json:"tags"`
	Permission    int               `json:"permission"`
	AllowDownload int               `json:"allow_download"`
	ExpiresAt     int64             `json:"expires_at"`
}

func toPublicShareDetailResponse(
	detail *service.PublicShareDetail,
) *publicShareDetailResponse {
	if detail == nil {
		return nil
	}
	var document *documentResponse
	if detail.Document != nil {
		value := toDocumentResponse(*detail.Document)
		document = &value
	}
	return &publicShareDetailResponse{
		Document: document, Author: detail.Author, Tags: toTagResponses(detail.Tags),
		Permission: detail.Permission, AllowDownload: detail.AllowDownload,
		ExpiresAt: detail.ExpiresAt,
	}
}

type documentVersionResponse struct {
	ID         string `json:"id"`
	UserID     string `json:"user_id"`
	DocumentID string `json:"document_id"`
	Version    int    `json:"version"`
	Title      string `json:"title"`
	Content    string `json:"content"`
	Ctime      int64  `json:"ctime"`
}

func toDocumentVersionResponse(item model.DocumentVersion) documentVersionResponse {
	return documentVersionResponse{
		ID: item.ID, UserID: item.UserID, DocumentID: item.DocumentID,
		Version: item.Version, Title: item.Title, Content: item.Content, Ctime: item.Ctime,
	}
}

type documentVersionSummaryResponse struct {
	ID         string `json:"id"`
	DocumentID string `json:"document_id"`
	Version    int    `json:"version"`
	Title      string `json:"title"`
	Ctime      int64  `json:"ctime"`
}

func toDocumentVersionSummaryResponses(
	items []model.DocumentVersionSummary,
) []documentVersionSummaryResponse {
	result := make([]documentVersionSummaryResponse, 0, len(items))
	for _, item := range items {
		result = append(result, documentVersionSummaryResponse{
			ID: item.ID, DocumentID: item.DocumentID, Version: item.Version,
			Title: item.Title, Ctime: item.Ctime,
		})
	}
	return result
}

type assetListResponse struct {
	ID          string `json:"id"`
	UserID      string `json:"user_id"`
	FileKey     string `json:"file_key"`
	URL         string `json:"url"`
	Name        string `json:"name"`
	ContentType string `json:"content_type"`
	Size        int64  `json:"size"`
	Ctime       int64  `json:"ctime"`
	Mtime       int64  `json:"mtime"`
	RefCount    int    `json:"ref_count"`
}

func toAssetListResponses(items []service.AssetListItem) []assetListResponse {
	result := make([]assetListResponse, 0, len(items))
	for _, item := range items {
		result = append(result, assetListResponse{
			ID: item.ID, UserID: item.UserID, FileKey: item.FileKey, URL: item.URL,
			Name: item.Name, ContentType: item.ContentType, Size: item.Size,
			Ctime: item.Ctime, Mtime: item.Mtime, RefCount: item.RefCount,
		})
	}
	return result
}

type documentTagResponse struct {
	UserID     string `json:"user_id"`
	DocumentID string `json:"document_id"`
	TagID      string `json:"tag_id"`
}

type exportPayloadResponse struct {
	Documents []documentResponse        `json:"documents"`
	Versions  []documentVersionResponse `json:"versions"`
	Tags      []tagResponse             `json:"tags"`
	DocTags   []documentTagResponse     `json:"document_tags"`
}

func toExportPayloadResponse(payload *service.ExportPayload) *exportPayloadResponse {
	if payload == nil {
		return nil
	}
	versions := make([]documentVersionResponse, 0, len(payload.Versions))
	for _, item := range payload.Versions {
		versions = append(versions, toDocumentVersionResponse(item))
	}
	docTags := make([]documentTagResponse, 0, len(payload.DocTags))
	for _, item := range payload.DocTags {
		docTags = append(docTags, documentTagResponse{
			UserID: item.UserID, DocumentID: item.DocumentID, TagID: item.TagID,
		})
	}
	return &exportPayloadResponse{
		Documents: toDocumentResponses(payload.Documents),
		Versions:  versions,
		Tags:      toTagResponses(payload.Tags),
		DocTags:   docTags,
	}
}
