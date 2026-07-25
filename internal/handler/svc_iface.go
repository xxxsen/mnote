package handler

import (
	"context"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/oauth"
	"github.com/xxxsen/mnote/internal/service"
)

type IAuthService interface {
	Register(ctx context.Context, email, password, code string) (*model.User, string, error)
	Login(ctx context.Context, email, password string) (*model.User, string, error)
	SendRegisterCode(ctx context.Context, email string) error
	UpdatePassword(ctx context.Context, userID, currentPassword, newPassword string) error
}

type oauthFlowService interface {
	GetAuthURL(provider, state string) (string, error)
	CreateState(ctx context.Context, provider, purpose, userID, returnTo string) (string, error)
	ConsumeState(ctx context.Context, state string) (*service.OAuthState, error)
	ExchangeCode(ctx context.Context, provider, code string) (*oauth.Profile, error)
}

type oauthLoginService interface {
	LoginOrCreate(ctx context.Context, profile *oauth.Profile) (*model.User, string, error)
	CreateExchange(ctx context.Context, user *model.User) (string, error)
	ConsumeExchange(ctx context.Context, code string) (*service.OAuthExchange, error)
}

type oauthBindingService interface {
	Bind(ctx context.Context, userID string, profile *oauth.Profile) error
	ListBindings(ctx context.Context, userID string) ([]model.OAuthAccount, error)
	Unbind(ctx context.Context, userID, provider string) error
}

type IOAuthService interface {
	oauthFlowService
	oauthLoginService
	oauthBindingService
}

type documentLookupService interface {
	Search(ctx context.Context, userID, query, tagID string,
		starred *int, limit, offset uint, orderBy string) ([]model.Document, error)
	Get(ctx context.Context, userID, docID string) (*model.Document, error)
	Overview(ctx context.Context, userID string, limit uint) (*service.DocumentOverview, error)
	GetBacklinks(ctx context.Context, userID, docID string) ([]model.Document, error)
	ListLinks(
		ctx context.Context,
		userID string,
		documentID string,
		input service.DocumentLinksInput,
	) (*model.DocumentLinksResult, error)
}

type documentTagQueryService interface {
	ListTagIDs(ctx context.Context, userID, docID string) ([]string, error)
	ListTagIDsByDocIDs(ctx context.Context, userID string, docIDs []string) (map[string][]string, error)
	ListTagsByIDs(ctx context.Context, userID string, ids []string) ([]model.Tag, error)
}

type documentContentWriteService interface {
	Create(ctx context.Context, userID string, input service.DocumentCreateInput) (*model.Document, error)
	Save(ctx context.Context, userID, docID string,
		input service.DocumentUpdateInput) (*model.SaveDocumentResult, error)
	UpdateTags(ctx context.Context, userID, docID string, tagIDs []string) error
}

type documentMetadataWriteService interface {
	UpdatePinned(ctx context.Context, userID, docID string, pinned int) error
	UpdateStarred(ctx context.Context, userID, docID string, starred int) error
	Delete(ctx context.Context, userID, docID string) error
}

type IDocumentService interface {
	documentLookupService
	documentTagQueryService
	documentContentWriteService
	documentMetadataWriteService
	SimilarDocuments(
		ctx context.Context,
		userID, documentID string,
		limit int,
	) (*service.SimilarDocumentList, error)
}

type IVersionHandlerService interface {
	ListVersions(ctx context.Context, userID, docID string) ([]model.DocumentVersionSummary, error)
	GetVersion(ctx context.Context, userID, docID string, version int) (*model.DocumentVersion, error)
}

type shareConfigService interface {
	CreateShare(ctx context.Context, userID, docID string) (*model.Share, error)
	UpdateShareConfig(ctx context.Context, userID, docID string, input service.ShareConfigInput) (*model.Share, error)
	RevokeShare(ctx context.Context, userID, docID string) error
	GetActiveShare(ctx context.Context, userID, docID string) (*model.Share, error)
}

type publicShareService interface {
	GetShareByToken(ctx context.Context, token, password string) (*service.PublicShareDetail, error)
	ListShareCommentsByToken(ctx context.Context, token, password string,
		limit, offset int) (*service.ShareCommentListResult, error)
	ListShareCommentRepliesByToken(ctx context.Context, token, password, rootID string,
		limit, offset int) ([]model.ShareComment, error)
	CreateShareCommentByToken(ctx context.Context, input service.CreateShareCommentInput) (*model.ShareComment, error)
}

type IShareHandlerService interface {
	shareConfigService
	publicShareService
	ListSharedDocuments(ctx context.Context, userID, query string) ([]service.SharedDocumentListItem, error)
}

type ISemanticSearchHandlerService interface {
	SemanticSearch(ctx context.Context, userID, query, tagID string,
		starred *int, limit, offset uint, orderBy, excludeID string,
	) ([]model.Document, []float32, error)
	SemanticSearchDetailed(
		ctx context.Context,
		userID, query string,
		limit uint,
		excludeID string,
	) ([]service.SemanticDocumentResult, error)
	ListTagIDs(ctx context.Context, userID, docID string) ([]string, error)
}

type tagWriteService interface {
	Create(ctx context.Context, userID, name string) (*model.Tag, error)
	CreateBatch(ctx context.Context, userID string, names []string) ([]model.Tag, error)
	Delete(ctx context.Context, userID, tagID string) error
	UpdatePinned(ctx context.Context, userID, tagID string, pinned int) error
}

type tagQueryService interface {
	List(ctx context.Context, userID string) ([]model.Tag, error)
	ListPage(ctx context.Context, userID, query string, limit, offset int) ([]model.Tag, error)
	ListByIDs(ctx context.Context, userID string, ids []string) ([]model.Tag, error)
	ListSummary(ctx context.Context, userID, query string, limit, offset int) ([]model.TagSummary, error)
}

type ITagService interface {
	tagWriteService
	tagQueryService
}

type IExportService interface {
	Export(ctx context.Context, userID string) (*service.ExportPayload, error)
	ExportNotesZip(ctx context.Context, userID string) (string, error)
	ConvertMarkdownToConfluenceHTML(ctx context.Context, userID, docID string) (string, error)
}

type IImportHandlerService interface {
	CreateHedgeDocJob(ctx context.Context, userID, filePath string) (*model.ImportJob, error)
	CreateNotesJob(ctx context.Context, userID, filePath string) (*model.ImportJob, error)
	Preview(ctx context.Context, userID, jobID string) (*service.ImportPreview, error)
	Confirm(ctx context.Context, userID, jobID, mode string) error
	Status(ctx context.Context, userID, jobID string) (*model.ImportJob, error)
}

type templateQueryService interface {
	List(ctx context.Context, userID string) ([]model.Template, error)
	ListMeta(ctx context.Context, userID, query string, limit, offset int) (*service.TemplateMetaListResult, error)
	Get(ctx context.Context, userID, templateID string) (*model.Template, error)
}

type templateWriteService interface {
	Create(ctx context.Context, userID string, input service.CreateTemplateInput) (*model.Template, error)
	Update(ctx context.Context, userID, templateID string, input service.UpdateTemplateInput) error
	Delete(ctx context.Context, userID, templateID string) error
	CreateDocumentFromTemplate(ctx context.Context, userID string,
		input service.CreateDocumentFromTemplateInput) (*model.Document, error)
}

type ITemplateHandlerService interface {
	templateQueryService
	templateWriteService
}

type IAssetHandlerService interface {
	List(ctx context.Context, userID, query string, limit, offset uint) ([]service.AssetListItem, error)
	ListReferences(ctx context.Context, userID, assetID string) ([]service.AssetReference, error)
	RecordUpload(ctx context.Context, userID, fileKey, url, name, contentType string, size int64) error
}

type ITodoHandlerService interface {
	CreateTodo(ctx context.Context, userID, content, dueDate string, done bool) (*model.Todo, error)
	ListByDateRange(ctx context.Context, userID, startDate, endDate string) ([]model.Todo, error)
	ToggleDone(ctx context.Context, userID, todoID string, done bool) error
	UpdateContent(ctx context.Context, userID, todoID, content string) (*model.Todo, error)
	DeleteTodo(ctx context.Context, userID, todoID string) error
}
