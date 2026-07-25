package service

import (
	"context"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/repo"
)

type todoWriteRepo interface {
	Create(ctx context.Context, todo *model.Todo) error
	Update(ctx context.Context, todo *model.Todo) error
	UpdateDone(ctx context.Context, userID, todoID string, done int, mtime int64) error
	Delete(ctx context.Context, userID, todoID string) error
}

type todoRepo interface {
	todoWriteRepo
	GetByID(ctx context.Context, userID, todoID string) (*model.Todo, error)
	ListByDateRange(ctx context.Context, userID, startDate, endDate string) ([]model.Todo, error)
}

type tagWriteRepo interface {
	Create(ctx context.Context, tag *model.Tag) error
	CreateBatch(ctx context.Context, tags []model.Tag) error
	UpdatePinned(ctx context.Context, userID, tagID string, pinned int, mtime int64) error
	Delete(ctx context.Context, userID, tagID string) error
}

type tagListRepo interface {
	List(ctx context.Context, userID string) ([]model.Tag, error)
	ListPage(ctx context.Context, userID, query string, limit, offset int) ([]model.Tag, error)
	ListSummary(ctx context.Context, userID, query string, limit, offset int) ([]model.TagSummary, error)
	ListByNames(ctx context.Context, userID string, names []string) ([]model.Tag, error)
	ListByIDs(ctx context.Context, userID string, ids []string) ([]model.Tag, error)
}

type tagRepo interface {
	tagWriteRepo
	tagListRepo
}

type documentTagWriteRepo interface {
	Add(ctx context.Context, docTag *model.DocumentTag) error
	DeleteByDoc(ctx context.Context, userID, docID string) error
	DeleteByTag(ctx context.Context, userID, tagID string) error
}

type documentTagRepo interface {
	documentTagWriteRepo
	ListTagIDs(ctx context.Context, userID, docID string) ([]string, error)
	ListDocIDsByTag(ctx context.Context, userID, tagID string) ([]string, error)
	ListByUser(ctx context.Context, userID string) ([]model.DocumentTag, error)
	ListTagIDsByDocIDs(ctx context.Context, userID string, docIDs []string) (map[string][]string, error)
}

type userIdentityRepo interface {
	Create(ctx context.Context, user *model.User) error
	GetByEmail(ctx context.Context, email string) (*model.User, error)
	GetByNormalizedEmail(ctx context.Context, normalized string) (*model.User, error)
	GetLegacyByExactEmail(ctx context.Context, trimmed string) (*model.User, error)
	HasCanonicalEmail(ctx context.Context, normalized string) (bool, error)
}

type userRepo interface {
	userIdentityRepo
	GetByID(ctx context.Context, id string) (*model.User, error)
	GetByIDForUpdate(ctx context.Context, id string) (*model.User, error)
	UpdatePassword(ctx context.Context, id, passwordHash string, mtime int64) error
}

type emailVerificationRepo interface {
	Create(ctx context.Context, v *model.EmailVerificationCode) error
	LatestByEmail(ctx context.Context, email, purpose string) (*model.EmailVerificationCode, error)
	MarkStatus(ctx context.Context, id, status string) error
	ConsumeIfUnused(ctx context.Context, id string, now int64) error
}

type templateWriteRepo interface {
	Create(ctx context.Context, tpl *model.Template) error
	Update(ctx context.Context, tpl *model.Template) error
	Delete(ctx context.Context, userID, templateID string) error
}

type templateRepo interface {
	templateWriteRepo
	GetByID(ctx context.Context, userID, templateID string) (*model.Template, error)
	ListByUser(ctx context.Context, userID string) ([]model.Template, error)
	ListMetaByUser(ctx context.Context, userID, query string, limit, offset int) ([]model.TemplateMeta, error)
	CountByUser(ctx context.Context, userID, query string) (int, error)
}

type assetRepo interface {
	UpsertByFileKey(ctx context.Context, asset *model.Asset) error
	ListByUser(ctx context.Context, userID, query string, limit, offset uint) ([]model.Asset, error)
	GetByID(ctx context.Context, userID, assetID string) (*model.Asset, error)
	ListByFileKeys(ctx context.Context, userID string, fileKeys []string) ([]model.Asset, error)
	ListByURLs(ctx context.Context, userID string, urls []string) ([]model.Asset, error)
}

type documentAssetRepo interface {
	ReplaceByDocument(ctx context.Context, userID, docID string, assetIDs []string, now int64) error
	DeleteByDocument(ctx context.Context, userID, docID string) error
	CountByAssets(ctx context.Context, userID string, assetIDs []string) (map[string]int, error)
	ListReferences(ctx context.Context, userID, assetID string) ([]repo.DocumentAssetReference, error)
}

type documentWriteRepo interface {
	Create(ctx context.Context, doc *model.Document) error
	Update(ctx context.Context, doc *model.Document) error
	Delete(ctx context.Context, userID, docID string, mtime int64) error
	TouchMtime(ctx context.Context, userID, docID string, mtime int64) error
}

type documentLookupRepo interface {
	GetByID(ctx context.Context, userID, docID string) (*model.Document, error)
	GetByIDForUpdate(ctx context.Context, userID, docID string) (*model.Document, error)
	GetByTitle(ctx context.Context, userID, title string) (*model.Document, error)
	ListByIDs(ctx context.Context, userID string, docIDs []string) ([]model.Document, error)
}

type documentListRepo interface {
	List(ctx context.Context, userID string, starred *int,
		limit, offset uint, orderBy string) ([]model.Document, error)
	ListAllByUser(ctx context.Context, userID string) ([]model.Document, error)
	Count(ctx context.Context, userID string, starred *int) (int, error)
	SearchLike(ctx context.Context, userID, query, tagID string,
		starred *int, limit, offset uint, orderBy string) ([]model.Document, error)
}

type documentRelationRepo interface {
	UpdatePinned(ctx context.Context, userID, docID string, pinned int) error
	UpdateStarred(ctx context.Context, userID, docID string, starred int) error
	UpdateLinks(ctx context.Context, userID, sourceID string,
		targetIDs []string, mtime int64) error
	GetBacklinks(ctx context.Context, userID, targetID string) ([]model.Document, error)
	ListLinks(
		ctx context.Context,
		userID string,
		documentID string,
		query model.DocumentLinksQuery,
	) (*model.DocumentLinksResult, error)
}

type documentRepo interface {
	documentWriteRepo
	documentLookupRepo
	documentListRepo
	documentRelationRepo
}

type versionRepo interface {
	Create(ctx context.Context, version *model.DocumentVersion) error
	GetByVersion(ctx context.Context, userID, docID string, version int) (*model.DocumentVersion, error)
	ListSummaries(ctx context.Context, userID, docID string) ([]model.DocumentVersionSummary, error)
	ListByUser(ctx context.Context, userID string) ([]model.DocumentVersion, error)
	DeleteOldVersions(ctx context.Context, userID, docID string, keep int) error
}

type shareConfigRepo interface {
	Create(ctx context.Context, share *model.Share) error
	UpdateConfigByDocument(ctx context.Context, userID, docID string,
		expiresAt int64, passwordHash string,
		permission, allowDownload int, mtime int64) error
	RevokeByDocument(ctx context.Context, userID, docID string, mtime int64) error
	GetByToken(ctx context.Context, token string) (*model.Share, error)
	GetActiveByDocument(ctx context.Context, userID, docID string) (*model.Share, error)
}

type shareCommentWriteRepo interface {
	CreateComment(ctx context.Context, comment *model.ShareComment) error
	GetCommentByID(ctx context.Context, commentID string) (*model.ShareComment, error)
}

type shareCommentListRepo interface {
	ListCommentsByShare(ctx context.Context, shareID string,
		limit, offset int) ([]model.ShareComment, error)
	ListRepliesByRootIDs(ctx context.Context, shareID string,
		rootIDs []string) ([]model.ShareComment, error)
	CountRepliesByRootIDs(ctx context.Context, shareID string,
		rootIDs []string) (map[string]int, error)
	CountRootCommentsByShare(ctx context.Context, shareID string) (int, error)
	ListRepliesByRootID(ctx context.Context, shareID, rootID string,
		limit, offset int) ([]model.ShareComment, error)
}

type shareRepo interface {
	shareConfigRepo
	shareCommentWriteRepo
	shareCommentListRepo
	ListActiveDocuments(ctx context.Context, userID, query string, now int64) ([]repo.SharedDocument, error)
}

type oauthAccountReadRepo interface {
	GetByProviderUserID(ctx context.Context,
		provider, providerUserID string) (*model.OAuthAccount, error)
	GetByUserProvider(ctx context.Context, userID, provider string) (*model.OAuthAccount, error)
	ListByUser(ctx context.Context, userID string) ([]model.OAuthAccount, error)
	CountByUser(ctx context.Context, userID string) (int, error)
}

type oauthAccountWriteRepo interface {
	Create(ctx context.Context, account *model.OAuthAccount) error
	DeleteByUserProvider(ctx context.Context, userID, provider string) error
}

type oauthRepo interface {
	oauthAccountReadRepo
	oauthAccountWriteRepo
	CreateOneTimeToken(ctx context.Context, token *model.OAuthOneTimeToken) error
	ConsumeOneTimeToken(ctx context.Context, kind, digest string, now int64) (*model.OAuthOneTimeToken, error)
	DeleteExpiredOneTimeTokens(ctx context.Context, cutoff int64, limit int) (int64, error)
}

type embeddingQueryRepo interface {
	SearchChunks(ctx context.Context, userID string,
		query []float32, threshold float32, topK int) ([]repo.ChunkSearchResult, error)
	GetByDocID(ctx context.Context, docID string) (*model.DocumentEmbedding, error)
	ListStaleDocuments(ctx context.Context, limit int, now int64) ([]model.Document, error)
}

type embeddingStateRepo interface {
	UpsertPending(ctx context.Context, docID, userID, contentHash string,
		contentMtime int64) error
	ResetLeaseToPending(ctx context.Context, docID string) error
	Claim(ctx context.Context, docID string, lockedUntil, now int64) (bool, error)
	// ClaimDrift expects the documents.content_hash snapshot returned by
	// ListStaleDocuments and atomically rejects an obsolete snapshot.
	ClaimDrift(ctx context.Context, docID, documentHash string,
		lockedUntil, now int64) (bool, error)
	MarkFailed(ctx context.Context, docID, errMsg string, nextRetryAt int64) error
}

type embeddingRepo interface {
	embeddingQueryRepo
	embeddingStateRepo
	// CompleteEmbeddingIfCurrent commits chunks for a worker snapshot
	// only when the locked documents row still hashes to expectedHash.
	// See repo.EmbeddingRepo.CompleteEmbeddingIfCurrent for the full
	// semantics; the bool return distinguishes "applied" from "stale".
	CompleteEmbeddingIfCurrent(ctx context.Context,
		userID, docID, expectedHash string,
		chunks []*model.ChunkEmbedding, now int64,
	) (bool, error)
}

type importJobStateRepo interface {
	Create(ctx context.Context, job *model.ImportJob) error
	Get(ctx context.Context, userID, jobID string) (*model.ImportJob, error)
	UpdateStatusIf(ctx context.Context,
		userID, jobID, fromStatus, toStatus string,
		mtime int64) (bool, error)
	UpdateSummary(ctx context.Context, job *model.ImportJob) error
}

type importJobRepo interface {
	importJobStateRepo
	UpdateProgress(ctx context.Context, userID, jobID string,
		processed, total int, report *model.ImportReport,
		status string, mtime int64) error
	Delete(ctx context.Context, userID, jobID string) error
}

type importJobNoteRepo interface {
	InsertBatch(ctx context.Context, notes []model.ImportJobNote) error
	ListByJob(ctx context.Context, userID, jobID string) ([]model.ImportJobNote, error)
	ListByJobLimit(ctx context.Context, userID, jobID string, limit int) ([]model.ImportJobNote, error)
	ListTitles(ctx context.Context, userID, jobID string) ([]string, error)
}

type embeddingChunker interface {
	Chunk(ctx context.Context, markdown string) ([]*model.ChunkEmbedding, error)
}
