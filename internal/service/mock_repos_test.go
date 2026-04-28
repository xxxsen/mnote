package service

import (
	"context"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/repo"
)

type mockDocumentRepo struct {
	createFn        func(ctx context.Context, doc *model.Document) error
	updateFn        func(ctx context.Context, doc *model.Document) error
	getByIDFn       func(ctx context.Context, userID, docID string) (*model.Document, error)
	getByTitleFn    func(ctx context.Context, userID, title string) (*model.Document, error)
	listFn          func(ctx context.Context, userID string, starred *int, limit, offset uint, orderBy string) ([]model.Document, error)
	listByIDsFn     func(ctx context.Context, userID string, docIDs []string) ([]model.Document, error)
	countFn         func(ctx context.Context, userID string, starred *int) (int, error)
	searchLikeFn    func(ctx context.Context, userID, query, tagID string, starred *int, limit, offset uint, orderBy string) ([]model.Document, error)
	deleteFn        func(ctx context.Context, userID, docID string, mtime int64) error
	touchMtimeFn    func(ctx context.Context, userID, docID string, mtime int64) error
	updatePinnedFn  func(ctx context.Context, userID, docID string, pinned int) error
	updateStarredFn func(ctx context.Context, userID, docID string, starred int) error
	updateLinksFn   func(ctx context.Context, userID, sourceID string, targetIDs []string, mtime int64) error
	getBacklinksFn  func(ctx context.Context, userID, targetID string) ([]model.Document, error)
}

func (m *mockDocumentRepo) Create(ctx context.Context, doc *model.Document) error {
	return m.createFn(ctx, doc)
}

func (m *mockDocumentRepo) Update(ctx context.Context, doc *model.Document) error {
	return m.updateFn(ctx, doc)
}

func (m *mockDocumentRepo) GetByID(ctx context.Context, userID, docID string) (*model.Document, error) {
	return m.getByIDFn(ctx, userID, docID)
}

func (m *mockDocumentRepo) GetByTitle(ctx context.Context, userID, title string) (*model.Document, error) {
	return m.getByTitleFn(ctx, userID, title)
}

func (m *mockDocumentRepo) List(ctx context.Context, userID string, starred *int, limit, offset uint, orderBy string) ([]model.Document, error) {
	return m.listFn(ctx, userID, starred, limit, offset, orderBy)
}

func (m *mockDocumentRepo) ListByIDs(ctx context.Context, userID string, docIDs []string) ([]model.Document, error) {
	return m.listByIDsFn(ctx, userID, docIDs)
}

func (m *mockDocumentRepo) Count(ctx context.Context, userID string, starred *int) (int, error) {
	return m.countFn(ctx, userID, starred)
}

func (m *mockDocumentRepo) SearchLike(ctx context.Context, userID, query, tagID string, starred *int, limit, offset uint, orderBy string) ([]model.Document, error) {
	return m.searchLikeFn(ctx, userID, query, tagID, starred, limit, offset, orderBy)
}

func (m *mockDocumentRepo) Delete(ctx context.Context, userID, docID string, mtime int64) error {
	return m.deleteFn(ctx, userID, docID, mtime)
}

func (m *mockDocumentRepo) TouchMtime(ctx context.Context, userID, docID string, mtime int64) error {
	return m.touchMtimeFn(ctx, userID, docID, mtime)
}

func (m *mockDocumentRepo) UpdatePinned(ctx context.Context, userID, docID string, pinned int) error {
	return m.updatePinnedFn(ctx, userID, docID, pinned)
}

func (m *mockDocumentRepo) UpdateStarred(ctx context.Context, userID, docID string, starred int) error {
	return m.updateStarredFn(ctx, userID, docID, starred)
}

func (m *mockDocumentRepo) UpdateLinks(ctx context.Context, userID, sourceID string, targetIDs []string, mtime int64) error {
	return m.updateLinksFn(ctx, userID, sourceID, targetIDs, mtime)
}

func (m *mockDocumentRepo) GetBacklinks(ctx context.Context, userID, targetID string) ([]model.Document, error) {
	return m.getBacklinksFn(ctx, userID, targetID)
}

type mockDocumentSummaryRepo struct {
	upsertFn               func(ctx context.Context, userID, docID, summary string, now int64) error
	getByDocIDFn           func(ctx context.Context, userID, docID string) (string, error)
	listByDocIDsFn         func(ctx context.Context, userID string, docIDs []string) (map[string]string, error)
	listPendingDocumentsFn func(ctx context.Context, limit int, maxMtime int64) ([]model.Document, error)
}

func (m *mockDocumentSummaryRepo) Upsert(ctx context.Context, userID, docID, summary string, now int64) error {
	return m.upsertFn(ctx, userID, docID, summary, now)
}

func (m *mockDocumentSummaryRepo) GetByDocID(ctx context.Context, userID, docID string) (string, error) {
	return m.getByDocIDFn(ctx, userID, docID)
}

func (m *mockDocumentSummaryRepo) ListByDocIDs(ctx context.Context, userID string, docIDs []string) (map[string]string, error) {
	return m.listByDocIDsFn(ctx, userID, docIDs)
}

func (m *mockDocumentSummaryRepo) ListPendingDocuments(ctx context.Context, limit int, maxMtime int64) ([]model.Document, error) {
	return m.listPendingDocumentsFn(ctx, limit, maxMtime)
}

type mockVersionRepo struct {
	createFn            func(ctx context.Context, version *model.DocumentVersion) error
	getLatestVersionFn  func(ctx context.Context, userID, docID string) (int, error)
	getByVersionFn      func(ctx context.Context, userID, docID string, version int) (*model.DocumentVersion, error)
	listSummariesFn     func(ctx context.Context, userID, docID string) ([]model.DocumentVersionSummary, error)
	listByUserFn        func(ctx context.Context, userID string) ([]model.DocumentVersion, error)
	deleteOldVersionsFn func(ctx context.Context, userID, docID string, keep int) error
}

func (m *mockVersionRepo) Create(ctx context.Context, version *model.DocumentVersion) error {
	return m.createFn(ctx, version)
}

func (m *mockVersionRepo) GetLatestVersion(ctx context.Context, userID, docID string) (int, error) {
	return m.getLatestVersionFn(ctx, userID, docID)
}

func (m *mockVersionRepo) GetByVersion(ctx context.Context, userID, docID string, version int) (*model.DocumentVersion, error) {
	return m.getByVersionFn(ctx, userID, docID, version)
}

func (m *mockVersionRepo) ListSummaries(ctx context.Context, userID, docID string) ([]model.DocumentVersionSummary, error) {
	return m.listSummariesFn(ctx, userID, docID)
}

func (m *mockVersionRepo) ListByUser(ctx context.Context, userID string) ([]model.DocumentVersion, error) {
	return m.listByUserFn(ctx, userID)
}

func (m *mockVersionRepo) DeleteOldVersions(ctx context.Context, userID, docID string, keep int) error {
	return m.deleteOldVersionsFn(ctx, userID, docID, keep)
}

type mockShareRepo struct {
	createFn                   func(ctx context.Context, share *model.Share) error
	updateConfigByDocumentFn   func(ctx context.Context, userID, docID string, expiresAt int64, passwordHash string, permission, allowDownload int, mtime int64) error
	revokeByDocumentFn         func(ctx context.Context, userID, docID string, mtime int64) error
	getByTokenFn               func(ctx context.Context, token string) (*model.Share, error)
	getActiveByDocumentFn      func(ctx context.Context, userID, docID string) (*model.Share, error)
	listActiveDocumentsFn      func(ctx context.Context, userID, query string) ([]repo.SharedDocument, error)
	createCommentFn            func(ctx context.Context, comment *model.ShareComment) error
	listCommentsByShareFn      func(ctx context.Context, shareID string, limit, offset int) ([]model.ShareComment, error)
	getCommentByIDFn           func(ctx context.Context, commentID string) (*model.ShareComment, error)
	listRepliesByRootIDsFn     func(ctx context.Context, shareID string, rootIDs []string) ([]model.ShareComment, error)
	countRepliesByRootIDsFn    func(ctx context.Context, shareID string, rootIDs []string) (map[string]int, error)
	countRootCommentsByShareFn func(ctx context.Context, shareID string) (int, error)
	listRepliesByRootIDFn      func(ctx context.Context, shareID, rootID string, limit, offset int) ([]model.ShareComment, error)
}

func (m *mockShareRepo) Create(ctx context.Context, share *model.Share) error {
	return m.createFn(ctx, share)
}

func (m *mockShareRepo) UpdateConfigByDocument(ctx context.Context, userID, docID string, expiresAt int64, passwordHash string, permission, allowDownload int, mtime int64) error {
	return m.updateConfigByDocumentFn(ctx, userID, docID, expiresAt, passwordHash, permission, allowDownload, mtime)
}

func (m *mockShareRepo) RevokeByDocument(ctx context.Context, userID, docID string, mtime int64) error {
	return m.revokeByDocumentFn(ctx, userID, docID, mtime)
}

func (m *mockShareRepo) GetByToken(ctx context.Context, token string) (*model.Share, error) {
	return m.getByTokenFn(ctx, token)
}

func (m *mockShareRepo) GetActiveByDocument(ctx context.Context, userID, docID string) (*model.Share, error) {
	return m.getActiveByDocumentFn(ctx, userID, docID)
}

func (m *mockShareRepo) ListActiveDocuments(ctx context.Context, userID, query string) ([]repo.SharedDocument, error) {
	return m.listActiveDocumentsFn(ctx, userID, query)
}

func (m *mockShareRepo) CreateComment(ctx context.Context, comment *model.ShareComment) error {
	return m.createCommentFn(ctx, comment)
}

func (m *mockShareRepo) ListCommentsByShare(ctx context.Context, shareID string, limit, offset int) ([]model.ShareComment, error) {
	return m.listCommentsByShareFn(ctx, shareID, limit, offset)
}

func (m *mockShareRepo) GetCommentByID(ctx context.Context, commentID string) (*model.ShareComment, error) {
	return m.getCommentByIDFn(ctx, commentID)
}

func (m *mockShareRepo) ListRepliesByRootIDs(ctx context.Context, shareID string, rootIDs []string) ([]model.ShareComment, error) {
	return m.listRepliesByRootIDsFn(ctx, shareID, rootIDs)
}

func (m *mockShareRepo) CountRepliesByRootIDs(ctx context.Context, shareID string, rootIDs []string) (map[string]int, error) {
	return m.countRepliesByRootIDsFn(ctx, shareID, rootIDs)
}

func (m *mockShareRepo) CountRootCommentsByShare(ctx context.Context, shareID string) (int, error) {
	return m.countRootCommentsByShareFn(ctx, shareID)
}

func (m *mockShareRepo) ListRepliesByRootID(ctx context.Context, shareID, rootID string, limit, offset int) ([]model.ShareComment, error) {
	return m.listRepliesByRootIDFn(ctx, shareID, rootID, limit, offset)
}
