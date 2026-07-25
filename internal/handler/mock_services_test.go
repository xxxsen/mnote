package handler

import (
	"context"
	"io"

	"github.com/xxxsen/mnote/internal/filestore"
	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/oauth"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/service"
)

// --- IAuthService mock ---

type mockAuthService struct {
	registerFn       func(ctx context.Context, email, password, code string) (*model.User, string, error)
	loginFn          func(ctx context.Context, email, password string) (*model.User, string, error)
	sendRegCodeFn    func(ctx context.Context, email string) error
	updatePasswordFn func(ctx context.Context, userID, current, newPass string) error
}

func (m *mockAuthService) Register(ctx context.Context, email, password, code string) (*model.User, string, error) {
	if m.registerFn == nil {
		panic("mockAuthService.Register not configured")
	}
	return m.registerFn(ctx, email, password, code)
}

func (m *mockAuthService) Login(ctx context.Context, email, password string) (*model.User, string, error) {
	if m.loginFn == nil {
		panic("mockAuthService.Login not configured")
	}
	return m.loginFn(ctx, email, password)
}

func (m *mockAuthService) SendRegisterCode(ctx context.Context, email string) error {
	if m.sendRegCodeFn == nil {
		panic("mockAuthService.SendRegisterCode not configured")
	}
	return m.sendRegCodeFn(ctx, email)
}

func (m *mockAuthService) UpdatePassword(ctx context.Context, userID, current, newPass string) error {
	if m.updatePasswordFn == nil {
		panic("mockAuthService.UpdatePassword not configured")
	}
	return m.updatePasswordFn(ctx, userID, current, newPass)
}

// --- IOAuthService mock ---

type mockOAuthService struct {
	getAuthURLFn      func(provider, state string) (string, error)
	createStateFn     func(ctx context.Context, provider, purpose, userID, returnTo string) (string, error)
	consumeStateFn    func(ctx context.Context, state string) (*service.OAuthState, error)
	exchangeCodeFn    func(ctx context.Context, provider, code string) (*oauth.Profile, error)
	bindFn            func(ctx context.Context, userID string, profile *oauth.Profile) error
	loginOrCreateFn   func(ctx context.Context, profile *oauth.Profile) (*model.User, string, error)
	createExchangeFn  func(ctx context.Context, user *model.User) (string, error)
	consumeExchangeFn func(ctx context.Context, code string) (*service.OAuthExchange, error)
	listBindingsFn    func(ctx context.Context, userID string) ([]model.OAuthAccount, error)
	unbindFn          func(ctx context.Context, userID, provider string) error
}

func (m *mockOAuthService) GetAuthURL(provider, state string) (string, error) {
	if m.getAuthURLFn == nil {
		panic("mockOAuthService.GetAuthURL not configured")
	}
	return m.getAuthURLFn(provider, state)
}

func (m *mockOAuthService) CreateState(
	ctx context.Context, provider, purpose, userID, returnTo string,
) (string, error) {
	if m.createStateFn == nil {
		return "test-state", nil
	}
	return m.createStateFn(ctx, provider, purpose, userID, returnTo)
}

func (m *mockOAuthService) ConsumeState(ctx context.Context, state string) (*service.OAuthState, error) {
	if m.consumeStateFn == nil {
		return nil, appErr.ErrInvalid
	}
	return m.consumeStateFn(ctx, state)
}

func (m *mockOAuthService) ExchangeCode(ctx context.Context, provider, code string) (*oauth.Profile, error) {
	if m.exchangeCodeFn == nil {
		panic("mockOAuthService.ExchangeCode not configured")
	}
	return m.exchangeCodeFn(ctx, provider, code)
}

func (m *mockOAuthService) Bind(ctx context.Context, userID string, profile *oauth.Profile) error {
	if m.bindFn == nil {
		panic("mockOAuthService.Bind not configured")
	}
	return m.bindFn(ctx, userID, profile)
}

func (m *mockOAuthService) LoginOrCreate(ctx context.Context, profile *oauth.Profile) (*model.User, string, error) {
	if m.loginOrCreateFn == nil {
		panic("mockOAuthService.LoginOrCreate not configured")
	}
	return m.loginOrCreateFn(ctx, profile)
}

func (m *mockOAuthService) CreateExchange(ctx context.Context, user *model.User) (string, error) {
	if m.createExchangeFn == nil {
		return "test-exchange", nil
	}
	return m.createExchangeFn(ctx, user)
}

func (m *mockOAuthService) ConsumeExchange(ctx context.Context, code string) (*service.OAuthExchange, error) {
	if m.consumeExchangeFn == nil {
		return nil, appErr.ErrInvalid
	}
	return m.consumeExchangeFn(ctx, code)
}

func (m *mockOAuthService) ListBindings(ctx context.Context, userID string) ([]model.OAuthAccount, error) {
	if m.listBindingsFn == nil {
		panic("mockOAuthService.ListBindings not configured")
	}
	return m.listBindingsFn(ctx, userID)
}

func (m *mockOAuthService) Unbind(ctx context.Context, userID, provider string) error {
	if m.unbindFn == nil {
		panic("mockOAuthService.Unbind not configured")
	}
	return m.unbindFn(ctx, userID, provider)
}

// --- IDocumentService mock ---

type mockDocumentService struct {
	createFn                         func(ctx context.Context, userID string, input service.DocumentCreateInput) (*model.Document, error)
	searchFn                         func(ctx context.Context, userID, query, tagID string, starred *int, limit, offset uint, orderBy string) ([]model.Document, error)
	getFn                            func(ctx context.Context, userID, docID string) (*model.Document, error)
	updateFn                         func(ctx context.Context, userID, docID string, input service.DocumentUpdateInput) error
	saveFn                           func(ctx context.Context, userID, docID string, input service.DocumentUpdateInput) (*model.SaveDocumentResult, error)
	updateTagsFn                     func(ctx context.Context, userID, docID string, tagIDs []string) error
	updatePinnedFn                   func(ctx context.Context, userID, docID string, pinned int) error
	updateStarredFn                  func(ctx context.Context, userID, docID string, starred int) error
	deleteFn                         func(ctx context.Context, userID, docID string) error
	overviewFn                       func(ctx context.Context, userID string, limit uint) (*service.DocumentOverview, error)
	getBacklinksFn                   func(ctx context.Context, userID, docID string) ([]model.Document, error)
	listLinksFn                      func(ctx context.Context, userID, documentID string, input service.DocumentLinksInput) (*model.DocumentLinksResult, error)
	listTagIDsFn                     func(ctx context.Context, userID, docID string) ([]string, error)
	listTagIDsByDocIDsFn             func(ctx context.Context, userID string, docIDs []string) (map[string][]string, error)
	listTagsByIDsFn                  func(ctx context.Context, userID string, ids []string) ([]model.Tag, error)
	listVersionsFn                   func(ctx context.Context, userID, docID string) ([]model.DocumentVersionSummary, error)
	getVersionFn                     func(ctx context.Context, userID, docID string, version int) (*model.DocumentVersion, error)
	createShareFn                    func(ctx context.Context, userID, docID string) (*model.Share, error)
	updateShareConfigFn              func(ctx context.Context, userID, docID string, input service.ShareConfigInput) (*model.Share, error)
	revokeShareFn                    func(ctx context.Context, userID, docID string) error
	getActiveShareFn                 func(ctx context.Context, userID, docID string) (*model.Share, error)
	getShareByTokenFn                func(ctx context.Context, token, password string) (*service.PublicShareDetail, error)
	listShareCommentsByTokenFn       func(ctx context.Context, token, password string, limit, offset int) (*service.ShareCommentListResult, error)
	listShareCommentRepliesByTokenFn func(ctx context.Context, token, password, rootID string, limit, offset int) ([]model.ShareComment, error)
	createShareCommentByTokenFn      func(ctx context.Context, input service.CreateShareCommentInput) (*model.ShareComment, error)
	listSharedDocumentsFn            func(ctx context.Context, userID, query string) ([]service.SharedDocumentListItem, error)
	semanticSearchFn                 func(ctx context.Context, userID, query, tagID string, starred *int, limit, offset uint, orderBy, excludeID string) ([]model.Document, []float32, error)
	semanticSearchDetailedFn         func(ctx context.Context, userID, query string, limit uint, excludeID string) ([]service.SemanticDocumentResult, error)
	similarDocumentsFn               func(ctx context.Context, userID, documentID string, limit int) (*service.SimilarDocumentList, error)
}

func (m *mockDocumentService) SemanticSearchDetailed(
	ctx context.Context,
	userID, query string,
	limit uint,
	excludeID string,
) ([]service.SemanticDocumentResult, error) {
	if m.semanticSearchDetailedFn != nil {
		return m.semanticSearchDetailedFn(ctx, userID, query, limit, excludeID)
	}
	documents, scores, err := m.SemanticSearch(
		ctx,
		userID,
		query,
		"",
		nil,
		limit,
		0,
		"",
		excludeID,
	)
	if err != nil {
		return nil, err
	}
	result := make([]service.SemanticDocumentResult, 0, len(documents))
	for index, document := range documents {
		score := float32(0)
		if index < len(scores) {
			score = scores[index]
		}
		result = append(result, service.SemanticDocumentResult{
			Document: document,
			Score:    score,
		})
	}
	return result, nil
}

func (m *mockDocumentService) Create(ctx context.Context, userID string, input service.DocumentCreateInput) (*model.Document, error) {
	if m.createFn == nil {
		panic("mockDocumentService.Create not configured")
	}
	return m.createFn(ctx, userID, input)
}

func (m *mockDocumentService) Search(ctx context.Context, userID, query, tagID string, starred *int, limit, offset uint, orderBy string) ([]model.Document, error) {
	if m.searchFn == nil {
		panic("mockDocumentService.Search not configured")
	}
	return m.searchFn(ctx, userID, query, tagID, starred, limit, offset, orderBy)
}

func (m *mockDocumentService) Get(ctx context.Context, userID, docID string) (*model.Document, error) {
	if m.getFn == nil {
		panic("mockDocumentService.Get not configured")
	}
	return m.getFn(ctx, userID, docID)
}

func (m *mockDocumentService) Update(ctx context.Context, userID, docID string, input service.DocumentUpdateInput) error {
	if m.updateFn == nil {
		panic("mockDocumentService.Update not configured")
	}
	return m.updateFn(ctx, userID, docID, input)
}

func (m *mockDocumentService) Save(
	ctx context.Context, userID, docID string, input service.DocumentUpdateInput,
) (*model.SaveDocumentResult, error) {
	if m.saveFn != nil {
		return m.saveFn(ctx, userID, docID, input)
	}
	if m.updateFn != nil {
		if err := m.updateFn(ctx, userID, docID, input); err != nil {
			return nil, err
		}
		return &model.SaveDocumentResult{
			ID:              docID,
			Accepted:        true,
			ContentRevision: input.SaveSeq,
		}, nil
	}
	panic("mockDocumentService.Save not configured")
}

func (m *mockDocumentService) UpdateTags(ctx context.Context, userID, docID string, tagIDs []string) error {
	if m.updateTagsFn == nil {
		panic("mockDocumentService.UpdateTags not configured")
	}
	return m.updateTagsFn(ctx, userID, docID, tagIDs)
}

func (m *mockDocumentService) UpdatePinned(ctx context.Context, userID, docID string, pinned int) error {
	if m.updatePinnedFn == nil {
		panic("mockDocumentService.UpdatePinned not configured")
	}
	return m.updatePinnedFn(ctx, userID, docID, pinned)
}

func (m *mockDocumentService) UpdateStarred(ctx context.Context, userID, docID string, starred int) error {
	if m.updateStarredFn == nil {
		panic("mockDocumentService.UpdateStarred not configured")
	}
	return m.updateStarredFn(ctx, userID, docID, starred)
}

func (m *mockDocumentService) Delete(ctx context.Context, userID, docID string) error {
	if m.deleteFn == nil {
		panic("mockDocumentService.Delete not configured")
	}
	return m.deleteFn(ctx, userID, docID)
}

func (m *mockDocumentService) Overview(ctx context.Context, userID string, limit uint) (*service.DocumentOverview, error) {
	if m.overviewFn == nil {
		panic("mockDocumentService.Overview not configured")
	}
	return m.overviewFn(ctx, userID, limit)
}

func (m *mockDocumentService) GetBacklinks(ctx context.Context, userID, docID string) ([]model.Document, error) {
	if m.getBacklinksFn == nil {
		panic("mockDocumentService.GetBacklinks not configured")
	}
	return m.getBacklinksFn(ctx, userID, docID)
}

func (m *mockDocumentService) ListLinks(
	ctx context.Context,
	userID string,
	documentID string,
	input service.DocumentLinksInput,
) (*model.DocumentLinksResult, error) {
	if m.listLinksFn == nil {
		panic("mockDocumentService.ListLinks not configured")
	}
	return m.listLinksFn(ctx, userID, documentID, input)
}

func (m *mockDocumentService) ListTagIDs(ctx context.Context, userID, docID string) ([]string, error) {
	if m.listTagIDsFn == nil {
		panic("mockDocumentService.ListTagIDs not configured")
	}
	return m.listTagIDsFn(ctx, userID, docID)
}

func (m *mockDocumentService) ListTagIDsByDocIDs(ctx context.Context, userID string, docIDs []string) (map[string][]string, error) {
	if m.listTagIDsByDocIDsFn == nil {
		panic("mockDocumentService.ListTagIDsByDocIDs not configured")
	}
	return m.listTagIDsByDocIDsFn(ctx, userID, docIDs)
}

func (m *mockDocumentService) ListTagsByIDs(ctx context.Context, userID string, ids []string) ([]model.Tag, error) {
	if m.listTagsByIDsFn == nil {
		panic("mockDocumentService.ListTagsByIDs not configured")
	}
	return m.listTagsByIDsFn(ctx, userID, ids)
}

func (m *mockDocumentService) ListVersions(ctx context.Context, userID, docID string) ([]model.DocumentVersionSummary, error) {
	if m.listVersionsFn == nil {
		panic("mockDocumentService.ListVersions not configured")
	}
	return m.listVersionsFn(ctx, userID, docID)
}

func (m *mockDocumentService) GetVersion(ctx context.Context, userID, docID string, version int) (*model.DocumentVersion, error) {
	if m.getVersionFn == nil {
		panic("mockDocumentService.GetVersion not configured")
	}
	return m.getVersionFn(ctx, userID, docID, version)
}

func (m *mockDocumentService) CreateShare(ctx context.Context, userID, docID string) (*model.Share, error) {
	if m.createShareFn == nil {
		panic("mockDocumentService.CreateShare not configured")
	}
	return m.createShareFn(ctx, userID, docID)
}

func (m *mockDocumentService) UpdateShareConfig(
	ctx context.Context, userID, docID string, input service.ShareConfigInput,
) (*model.Share, error) {
	if m.updateShareConfigFn == nil {
		panic("mockDocumentService.UpdateShareConfig not configured")
	}
	return m.updateShareConfigFn(ctx, userID, docID, input)
}

func (m *mockDocumentService) RevokeShare(ctx context.Context, userID, docID string) error {
	if m.revokeShareFn == nil {
		panic("mockDocumentService.RevokeShare not configured")
	}
	return m.revokeShareFn(ctx, userID, docID)
}

func (m *mockDocumentService) GetActiveShare(ctx context.Context, userID, docID string) (*model.Share, error) {
	if m.getActiveShareFn == nil {
		panic("mockDocumentService.GetActiveShare not configured")
	}
	return m.getActiveShareFn(ctx, userID, docID)
}

func (m *mockDocumentService) GetShareByToken(ctx context.Context, token, password string) (*service.PublicShareDetail, error) {
	if m.getShareByTokenFn == nil {
		panic("mockDocumentService.GetShareByToken not configured")
	}
	return m.getShareByTokenFn(ctx, token, password)
}

func (m *mockDocumentService) ListShareCommentsByToken(
	ctx context.Context, token, password string, limit, offset int,
) (*service.ShareCommentListResult, error) {
	if m.listShareCommentsByTokenFn == nil {
		panic("mockDocumentService.ListShareCommentsByToken not configured")
	}
	return m.listShareCommentsByTokenFn(ctx, token, password, limit, offset)
}

func (m *mockDocumentService) ListShareCommentRepliesByToken(
	ctx context.Context, token, password, rootID string, limit, offset int,
) ([]model.ShareComment, error) {
	if m.listShareCommentRepliesByTokenFn == nil {
		panic("mockDocumentService.ListShareCommentRepliesByToken not configured")
	}
	return m.listShareCommentRepliesByTokenFn(ctx, token, password, rootID, limit, offset)
}

func (m *mockDocumentService) CreateShareCommentByToken(
	ctx context.Context, input service.CreateShareCommentInput,
) (*model.ShareComment, error) {
	if m.createShareCommentByTokenFn == nil {
		panic("mockDocumentService.CreateShareCommentByToken not configured")
	}
	return m.createShareCommentByTokenFn(ctx, input)
}

func (m *mockDocumentService) ListSharedDocuments(ctx context.Context, userID, query string) ([]service.SharedDocumentListItem, error) {
	if m.listSharedDocumentsFn == nil {
		panic("mockDocumentService.ListSharedDocuments not configured")
	}
	return m.listSharedDocumentsFn(ctx, userID, query)
}

func (m *mockDocumentService) SemanticSearch(
	ctx context.Context, userID, query, tagID string, starred *int, limit, offset uint, orderBy, excludeID string,
) ([]model.Document, []float32, error) {
	if m.semanticSearchFn == nil {
		panic("mockDocumentService.SemanticSearch not configured")
	}
	return m.semanticSearchFn(ctx, userID, query, tagID, starred, limit, offset, orderBy, excludeID)
}

func (m *mockDocumentService) SimilarDocuments(
	ctx context.Context,
	userID, documentID string,
	limit int,
) (*service.SimilarDocumentList, error) {
	if m.similarDocumentsFn == nil {
		panic("mockDocumentService.SimilarDocuments not configured")
	}
	return m.similarDocumentsFn(ctx, userID, documentID, limit)
}

// --- ITagService mock ---

type mockTagService struct {
	createFn       func(ctx context.Context, userID, name string) (*model.Tag, error)
	createBatchFn  func(ctx context.Context, userID string, names []string) ([]model.Tag, error)
	listFn         func(ctx context.Context, userID string) ([]model.Tag, error)
	listPageFn     func(ctx context.Context, userID, query string, limit, offset int) ([]model.Tag, error)
	listByIDsFn    func(ctx context.Context, userID string, ids []string) ([]model.Tag, error)
	listSummaryFn  func(ctx context.Context, userID, query string, limit, offset int) ([]model.TagSummary, error)
	deleteFn       func(ctx context.Context, userID, tagID string) error
	updatePinnedFn func(ctx context.Context, userID, tagID string, pinned int) error
}

func (m *mockTagService) Create(ctx context.Context, userID, name string) (*model.Tag, error) {
	if m.createFn == nil {
		panic("mockTagService.Create not configured")
	}
	return m.createFn(ctx, userID, name)
}

func (m *mockTagService) CreateBatch(ctx context.Context, userID string, names []string) ([]model.Tag, error) {
	if m.createBatchFn == nil {
		panic("mockTagService.CreateBatch not configured")
	}
	return m.createBatchFn(ctx, userID, names)
}

func (m *mockTagService) List(ctx context.Context, userID string) ([]model.Tag, error) {
	if m.listFn == nil {
		panic("mockTagService.List not configured")
	}
	return m.listFn(ctx, userID)
}

func (m *mockTagService) ListPage(ctx context.Context, userID, query string, limit, offset int) ([]model.Tag, error) {
	if m.listPageFn == nil {
		panic("mockTagService.ListPage not configured")
	}
	return m.listPageFn(ctx, userID, query, limit, offset)
}

func (m *mockTagService) ListByIDs(ctx context.Context, userID string, ids []string) ([]model.Tag, error) {
	if m.listByIDsFn == nil {
		panic("mockTagService.ListByIDs not configured")
	}
	return m.listByIDsFn(ctx, userID, ids)
}

func (m *mockTagService) ListSummary(ctx context.Context, userID, query string, limit, offset int) ([]model.TagSummary, error) {
	if m.listSummaryFn == nil {
		panic("mockTagService.ListSummary not configured")
	}
	return m.listSummaryFn(ctx, userID, query, limit, offset)
}

func (m *mockTagService) Delete(ctx context.Context, userID, tagID string) error {
	if m.deleteFn == nil {
		panic("mockTagService.Delete not configured")
	}
	return m.deleteFn(ctx, userID, tagID)
}

func (m *mockTagService) UpdatePinned(ctx context.Context, userID, tagID string, pinned int) error {
	if m.updatePinnedFn == nil {
		panic("mockTagService.UpdatePinned not configured")
	}
	return m.updatePinnedFn(ctx, userID, tagID, pinned)
}

// --- IExportService mock ---

type mockExportService struct {
	exportFn      func(ctx context.Context, userID string) (*service.ExportPayload, error)
	exportNotesFn func(ctx context.Context, userID string) (string, error)
	convertHTMLFn func(ctx context.Context, userID, docID string) (string, error)
}

func (m *mockExportService) Export(ctx context.Context, userID string) (*service.ExportPayload, error) {
	if m.exportFn == nil {
		panic("mockExportService.Export not configured")
	}
	return m.exportFn(ctx, userID)
}

func (m *mockExportService) ExportNotesZip(ctx context.Context, userID string) (string, error) {
	if m.exportNotesFn == nil {
		panic("mockExportService.ExportNotesZip not configured")
	}
	return m.exportNotesFn(ctx, userID)
}

func (m *mockExportService) ConvertMarkdownToConfluenceHTML(ctx context.Context, userID, docID string) (string, error) {
	if m.convertHTMLFn == nil {
		panic("mockExportService.ConvertMarkdownToConfluenceHTML not configured")
	}
	return m.convertHTMLFn(ctx, userID, docID)
}

// --- IImportHandlerService mock ---

type mockImportHandlerService struct {
	createHedgeDocJobFn func(ctx context.Context, userID, filePath string) (*model.ImportJob, error)
	createNotesJobFn    func(ctx context.Context, userID, filePath string) (*model.ImportJob, error)
	previewFn           func(ctx context.Context, userID, jobID string) (*service.ImportPreview, error)
	confirmFn           func(ctx context.Context, userID, jobID, mode string) error
	statusFn            func(ctx context.Context, userID, jobID string) (*model.ImportJob, error)
}

func (m *mockImportHandlerService) CreateHedgeDocJob(ctx context.Context, userID, filePath string) (*model.ImportJob, error) {
	if m.createHedgeDocJobFn == nil {
		panic("mockImportHandlerService.CreateHedgeDocJob not configured")
	}
	return m.createHedgeDocJobFn(ctx, userID, filePath)
}

func (m *mockImportHandlerService) CreateNotesJob(ctx context.Context, userID, filePath string) (*model.ImportJob, error) {
	if m.createNotesJobFn == nil {
		panic("mockImportHandlerService.CreateNotesJob not configured")
	}
	return m.createNotesJobFn(ctx, userID, filePath)
}

func (m *mockImportHandlerService) Preview(ctx context.Context, userID, jobID string) (*service.ImportPreview, error) {
	if m.previewFn == nil {
		panic("mockImportHandlerService.Preview not configured")
	}
	return m.previewFn(ctx, userID, jobID)
}

func (m *mockImportHandlerService) Confirm(ctx context.Context, userID, jobID, mode string) error {
	if m.confirmFn == nil {
		panic("mockImportHandlerService.Confirm not configured")
	}
	return m.confirmFn(ctx, userID, jobID, mode)
}

func (m *mockImportHandlerService) Status(ctx context.Context, userID, jobID string) (*model.ImportJob, error) {
	if m.statusFn == nil {
		panic("mockImportHandlerService.Status not configured")
	}
	return m.statusFn(ctx, userID, jobID)
}

// --- ITemplateHandlerService mock ---

type mockTemplateHandlerService struct {
	listFn      func(ctx context.Context, userID string) ([]model.Template, error)
	listMetaFn  func(ctx context.Context, userID, query string, limit, offset int) (*service.TemplateMetaListResult, error)
	getFn       func(ctx context.Context, userID, id string) (*model.Template, error)
	createFn    func(ctx context.Context, userID string, input service.CreateTemplateInput) (*model.Template, error)
	updateFn    func(ctx context.Context, userID, id string, input service.UpdateTemplateInput) error
	deleteFn    func(ctx context.Context, userID, id string) error
	createDocFn func(ctx context.Context, userID string, input service.CreateDocumentFromTemplateInput) (*model.Document, error)
}

func (m *mockTemplateHandlerService) List(ctx context.Context, userID string) ([]model.Template, error) {
	if m.listFn == nil {
		panic("mockTemplateHandlerService.List not configured")
	}
	return m.listFn(ctx, userID)
}

func (m *mockTemplateHandlerService) ListMeta(
	ctx context.Context, userID, query string, limit, offset int,
) (*service.TemplateMetaListResult, error) {
	if m.listMetaFn == nil {
		panic("mockTemplateHandlerService.ListMeta not configured")
	}
	return m.listMetaFn(ctx, userID, query, limit, offset)
}

func (m *mockTemplateHandlerService) Get(ctx context.Context, userID, id string) (*model.Template, error) {
	if m.getFn == nil {
		panic("mockTemplateHandlerService.Get not configured")
	}
	return m.getFn(ctx, userID, id)
}

func (m *mockTemplateHandlerService) Create(
	ctx context.Context, userID string, input service.CreateTemplateInput,
) (*model.Template, error) {
	if m.createFn == nil {
		panic("mockTemplateHandlerService.Create not configured")
	}
	return m.createFn(ctx, userID, input)
}

func (m *mockTemplateHandlerService) Update(ctx context.Context, userID, id string, input service.UpdateTemplateInput) error {
	if m.updateFn == nil {
		panic("mockTemplateHandlerService.Update not configured")
	}
	return m.updateFn(ctx, userID, id, input)
}

func (m *mockTemplateHandlerService) Delete(ctx context.Context, userID, id string) error {
	if m.deleteFn == nil {
		panic("mockTemplateHandlerService.Delete not configured")
	}
	return m.deleteFn(ctx, userID, id)
}

func (m *mockTemplateHandlerService) CreateDocumentFromTemplate(
	ctx context.Context, userID string, input service.CreateDocumentFromTemplateInput,
) (*model.Document, error) {
	if m.createDocFn == nil {
		panic("mockTemplateHandlerService.CreateDocumentFromTemplate not configured")
	}
	return m.createDocFn(ctx, userID, input)
}

// --- IAssetHandlerService mock ---

type mockAssetHandlerService struct {
	listFn         func(ctx context.Context, userID, query string, limit, offset uint) ([]service.AssetListItem, error)
	listRefsFn     func(ctx context.Context, userID, assetID string) ([]service.AssetReference, error)
	recordUploadFn func(ctx context.Context, userID, fileKey, url, name, contentType string, size int64) error
}

func (m *mockAssetHandlerService) List(ctx context.Context, userID, query string, limit, offset uint) ([]service.AssetListItem, error) {
	if m.listFn == nil {
		panic("mockAssetHandlerService.List not configured")
	}
	return m.listFn(ctx, userID, query, limit, offset)
}

func (m *mockAssetHandlerService) ListReferences(ctx context.Context, userID, assetID string) ([]service.AssetReference, error) {
	if m.listRefsFn == nil {
		panic("mockAssetHandlerService.ListReferences not configured")
	}
	return m.listRefsFn(ctx, userID, assetID)
}

func (m *mockAssetHandlerService) RecordUpload(
	ctx context.Context, userID, fileKey, url, name, contentType string, size int64,
) error {
	if m.recordUploadFn == nil {
		panic("mockAssetHandlerService.RecordUpload not configured")
	}
	return m.recordUploadFn(ctx, userID, fileKey, url, name, contentType, size)
}

// --- ITodoHandlerService mock ---

type mockTodoHandlerService struct {
	createFn     func(ctx context.Context, userID, content, dueDate string, done bool) (*model.Todo, error)
	listByDateFn func(ctx context.Context, userID, start, end string) ([]model.Todo, error)
	toggleDoneFn func(ctx context.Context, userID, todoID string, done bool) error
	updateFn     func(ctx context.Context, userID, todoID, content string) (*model.Todo, error)
	deleteFn     func(ctx context.Context, userID, todoID string) error
}

func (m *mockTodoHandlerService) CreateTodo(ctx context.Context, userID, content, dueDate string, done bool) (*model.Todo, error) {
	if m.createFn == nil {
		panic("mockTodoHandlerService.CreateTodo not configured")
	}
	return m.createFn(ctx, userID, content, dueDate, done)
}

func (m *mockTodoHandlerService) ListByDateRange(ctx context.Context, userID, start, end string) ([]model.Todo, error) {
	if m.listByDateFn == nil {
		panic("mockTodoHandlerService.ListByDateRange not configured")
	}
	return m.listByDateFn(ctx, userID, start, end)
}

func (m *mockTodoHandlerService) ToggleDone(ctx context.Context, userID, todoID string, done bool) error {
	if m.toggleDoneFn == nil {
		panic("mockTodoHandlerService.ToggleDone not configured")
	}
	return m.toggleDoneFn(ctx, userID, todoID, done)
}

func (m *mockTodoHandlerService) UpdateContent(ctx context.Context, userID, todoID, content string) (*model.Todo, error) {
	if m.updateFn == nil {
		panic("mockTodoHandlerService.UpdateContent not configured")
	}
	return m.updateFn(ctx, userID, todoID, content)
}

func (m *mockTodoHandlerService) DeleteTodo(ctx context.Context, userID, todoID string) error {
	if m.deleteFn == nil {
		panic("mockTodoHandlerService.DeleteTodo not configured")
	}
	return m.deleteFn(ctx, userID, todoID)
}

// --- filestore.Store mock ---

type mockFileStore struct {
	saveFn      func(ctx context.Context, key string, r filestore.ReadSeekCloser, size int64) error
	openFn      func(ctx context.Context, key string) (io.ReadCloser, error)
	statFn      func(ctx context.Context, key string) (filestore.ObjectInfo, error)
	openRangeFn func(ctx context.Context, key string, value filestore.ByteRange) (io.ReadCloser, error)
	deleteFn    func(ctx context.Context, key string) error
	genRefFn    func(userID, filename string) string
	genRefErr   error
	publicURLFn func(key string) string
}

func (m *mockFileStore) Save(ctx context.Context, key string, r filestore.ReadSeekCloser, size int64) error {
	if m.saveFn == nil {
		panic("mockFileStore.Save not configured")
	}
	return m.saveFn(ctx, key, r, size)
}

func (m *mockFileStore) Open(ctx context.Context, key string) (io.ReadCloser, error) {
	if m.openFn == nil {
		panic("mockFileStore.Open not configured")
	}
	return m.openFn(ctx, key)
}

func (m *mockFileStore) Stat(ctx context.Context, key string) (filestore.ObjectInfo, error) {
	if m.statFn == nil {
		panic("mockFileStore.Stat not configured")
	}
	return m.statFn(ctx, key)
}

func (m *mockFileStore) OpenRange(
	ctx context.Context, key string, value filestore.ByteRange,
) (io.ReadCloser, error) {
	if m.openRangeFn == nil {
		panic("mockFileStore.OpenRange not configured")
	}
	return m.openRangeFn(ctx, key, value)
}

func (m *mockFileStore) Delete(ctx context.Context, key string) error {
	if m.deleteFn == nil {
		return nil
	}
	return m.deleteFn(ctx, key)
}

func (m *mockFileStore) GenerateFileRef(userID, filename string) (string, error) {
	if m.genRefErr != nil {
		return "", m.genRefErr
	}
	if m.genRefFn == nil {
		panic("mockFileStore.GenerateFileRef not configured")
	}
	return m.genRefFn(userID, filename), nil
}

func (m *mockFileStore) PublicURL(key string) string {
	if m.publicURLFn != nil {
		return m.publicURLFn(key)
	}
	return resolveFileURL(key)
}
