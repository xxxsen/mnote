package service

import (
	"context"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/repo"
)

type todoRepo interface { //nolint:interfacebloat // mirrors repo.TodoRepo
	Create(ctx context.Context, todo *model.Todo) error
	Update(ctx context.Context, todo *model.Todo) error
	UpdateDone(ctx context.Context, userID, todoID string, done int, mtime int64) error
	GetByID(ctx context.Context, userID, todoID string) (*model.Todo, error)
	ListByDateRange(ctx context.Context, userID, startDate, endDate string) ([]model.Todo, error)
	Delete(ctx context.Context, userID, todoID string) error
}

type savedViewRepo interface {
	List(ctx context.Context, userID string) ([]model.SavedView, error)
	Create(ctx context.Context, view *model.SavedView) error
	Delete(ctx context.Context, userID, id string) error
}

type tagRepo interface { //nolint:interfacebloat // mirrors repo.TagRepo
	Create(ctx context.Context, tag *model.Tag) error
	CreateBatch(ctx context.Context, tags []model.Tag) error
	List(ctx context.Context, userID string) ([]model.Tag, error)
	ListPage(ctx context.Context, userID, query string, limit, offset int) ([]model.Tag, error)
	ListSummary(ctx context.Context, userID, query string, limit, offset int) ([]model.TagSummary, error)
	ListByNames(ctx context.Context, userID string, names []string) ([]model.Tag, error)
	ListByIDs(ctx context.Context, userID string, ids []string) ([]model.Tag, error)
	UpdatePinned(ctx context.Context, userID, tagID string, pinned int, mtime int64) error
	Delete(ctx context.Context, userID, tagID string) error
}

type documentTagRepo interface { //nolint:interfacebloat // mirrors repo.DocumentTagRepo
	Add(ctx context.Context, docTag *model.DocumentTag) error
	DeleteByDoc(ctx context.Context, userID, docID string) error
	DeleteByTag(ctx context.Context, userID, tagID string) error
	ListTagIDs(ctx context.Context, userID, docID string) ([]string, error)
	ListDocIDsByTag(ctx context.Context, userID, tagID string) ([]string, error)
	ListByUser(ctx context.Context, userID string) ([]model.DocumentTag, error)
	ListTagIDsByDocIDs(ctx context.Context, userID string, docIDs []string) (map[string][]string, error)
}

type userRepo interface {
	Create(ctx context.Context, user *model.User) error
	GetByEmail(ctx context.Context, email string) (*model.User, error)
	GetByID(ctx context.Context, id string) (*model.User, error)
	UpdatePassword(ctx context.Context, id, passwordHash string, mtime int64) error
}

type emailVerificationRepo interface {
	Create(ctx context.Context, v *model.EmailVerificationCode) error
	LatestByEmail(ctx context.Context, email, purpose string) (*model.EmailVerificationCode, error)
	MarkUsed(ctx context.Context, id string) error
}

type templateRepo interface { //nolint:interfacebloat // mirrors repo.TemplateRepo
	Create(ctx context.Context, tpl *model.Template) error
	Update(ctx context.Context, tpl *model.Template) error
	Delete(ctx context.Context, userID, templateID string) error
	GetByID(ctx context.Context, userID, templateID string) (*model.Template, error)
	ListByUser(ctx context.Context, userID string) ([]model.Template, error)
	ListMetaByUser(ctx context.Context, userID string, limit, offset int) ([]model.TemplateMeta, error)
	CountByUser(ctx context.Context, userID string) (int, error)
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

type documentRepo interface { //nolint:interfacebloat // mirrors repo.DocumentRepo
	Create(ctx context.Context, doc *model.Document) error
	Update(ctx context.Context, doc *model.Document) error
	GetByID(ctx context.Context, userID, docID string) (*model.Document, error)
	GetByTitle(ctx context.Context, userID, title string) (*model.Document, error)
	List(ctx context.Context, userID string, starred *int,
		limit, offset uint, orderBy string) ([]model.Document, error)
	ListByIDs(ctx context.Context, userID string, docIDs []string) ([]model.Document, error)
	Count(ctx context.Context, userID string, starred *int) (int, error)
	SearchLike(ctx context.Context, userID, query, tagID string,
		starred *int, limit, offset uint, orderBy string) ([]model.Document, error)
	Delete(ctx context.Context, userID, docID string, mtime int64) error
	TouchMtime(ctx context.Context, userID, docID string, mtime int64) error
	UpdatePinned(ctx context.Context, userID, docID string, pinned int) error
	UpdateStarred(ctx context.Context, userID, docID string, starred int) error
	UpdateLinks(ctx context.Context, userID, sourceID string,
		targetIDs []string, mtime int64) error
	GetBacklinks(ctx context.Context, userID, targetID string) ([]model.Document, error)
}

type documentSummaryRepo interface {
	Upsert(ctx context.Context, userID, docID, summary string, now int64) error
	GetByDocID(ctx context.Context, userID, docID string) (string, error)
	ListByDocIDs(ctx context.Context, userID string, docIDs []string) (map[string]string, error)
	ListPendingDocuments(ctx context.Context, limit int, maxMtime int64) ([]model.Document, error)
}

type versionRepo interface { //nolint:interfacebloat // mirrors repo.VersionRepo
	Create(ctx context.Context, version *model.DocumentVersion) error
	GetLatestVersion(ctx context.Context, userID, docID string) (int, error)
	GetByVersion(ctx context.Context, userID, docID string, version int) (*model.DocumentVersion, error)
	ListSummaries(ctx context.Context, userID, docID string) ([]model.DocumentVersionSummary, error)
	ListByUser(ctx context.Context, userID string) ([]model.DocumentVersion, error)
	DeleteOldVersions(ctx context.Context, userID, docID string, keep int) error
}

type shareRepo interface { //nolint:interfacebloat // mirrors repo.ShareRepo
	Create(ctx context.Context, share *model.Share) error
	UpdateConfigByDocument(ctx context.Context, userID, docID string,
		expiresAt int64, passwordHash string,
		permission, allowDownload int, mtime int64) error
	RevokeByDocument(ctx context.Context, userID, docID string, mtime int64) error
	GetByToken(ctx context.Context, token string) (*model.Share, error)
	GetActiveByDocument(ctx context.Context, userID, docID string) (*model.Share, error)
	ListActiveDocuments(ctx context.Context, userID, query string) ([]repo.SharedDocument, error)
	CreateComment(ctx context.Context, comment *model.ShareComment) error
	ListCommentsByShare(ctx context.Context, shareID string,
		limit, offset int) ([]model.ShareComment, error)
	GetCommentByID(ctx context.Context, commentID string) (*model.ShareComment, error)
	ListRepliesByRootIDs(ctx context.Context, shareID string,
		rootIDs []string) ([]model.ShareComment, error)
	CountRepliesByRootIDs(ctx context.Context, shareID string,
		rootIDs []string) (map[string]int, error)
	CountRootCommentsByShare(ctx context.Context, shareID string) (int, error)
	ListRepliesByRootID(ctx context.Context, shareID, rootID string,
		limit, offset int) ([]model.ShareComment, error)
}

type oauthRepo interface { //nolint:interfacebloat // mirrors repo.OAuthRepo
	Create(ctx context.Context, account *model.OAuthAccount) error
	GetByProviderUserID(ctx context.Context,
		provider, providerUserID string) (*model.OAuthAccount, error)
	GetByUserProvider(ctx context.Context, userID, provider string) (*model.OAuthAccount, error)
	ListByUser(ctx context.Context, userID string) ([]model.OAuthAccount, error)
	CountByUser(ctx context.Context, userID string) (int, error)
	DeleteByUserProvider(ctx context.Context, userID, provider string) error
}

type embeddingRepo interface { //nolint:interfacebloat // mirrors repo.EmbeddingRepo
	Save(ctx context.Context, emb *model.DocumentEmbedding) error
	SaveChunks(ctx context.Context, chunks []*model.ChunkEmbedding) error
	DeleteChunksByDocID(ctx context.Context, docID string) error
	SearchChunks(ctx context.Context, userID string,
		query []float32, threshold float32, topK int) ([]repo.ChunkSearchResult, error)
	GetByDocID(ctx context.Context, docID string) (*model.DocumentEmbedding, error)
	ListStaleDocuments(ctx context.Context, limit int,
		maxMtime int64) ([]model.Document, error)
}

type importJobRepo interface { //nolint:interfacebloat // mirrors repo.ImportJobRepo
	Create(ctx context.Context, job *model.ImportJob) error
	Get(ctx context.Context, userID, jobID string) (*model.ImportJob, error)
	UpdateStatusIf(ctx context.Context,
		userID, jobID, fromStatus, toStatus string,
		mtime int64) (bool, error)
	UpdateSummary(ctx context.Context, job *model.ImportJob) error
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

type aiManager interface { //nolint:interfacebloat // mirrors ai.Manager public API
	Polish(ctx context.Context, text string) (string, error)
	Generate(ctx context.Context, description string) (string, error)
	ExtractTags(ctx context.Context, text string, maxTags int) ([]string, error)
	Summarize(ctx context.Context, text string) (string, error)
	Embed(ctx context.Context, text, taskType string) ([]float32, error)
	MaxInputChars() int
}

type aiChunker interface {
	Chunk(ctx context.Context, markdown string) ([]*model.ChunkEmbedding, error)
}
