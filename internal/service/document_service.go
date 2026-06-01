package service

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/xxxsen/common/logutil"
	"go.uber.org/zap"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/password"
	"github.com/xxxsen/mnote/internal/pkg/safeconv"
	"github.com/xxxsen/mnote/internal/pkg/timeutil"
	"github.com/xxxsen/mnote/internal/repo"
)

// computeDocumentHash returns the canonical SHA-256 of "title\ncontent" used
// to detect body changes between saves. Title participates because users
// frequently rename without touching the body and we still want the search
// index/embedding to refresh in that case.
func computeDocumentHash(title, content string) string {
	sum := sha256.Sum256([]byte(title + "\n" + content))
	return hex.EncodeToString(sum[:])
}

// documentAssetSyncer is the narrow surface DocumentService needs from
// AssetService. Defining it locally lets tests substitute a stub without
// constructing a full AssetService and lets refreshReferences exercise its
// failure branches (the concrete *AssetService can satisfy it directly).
type documentAssetSyncer interface {
	SyncDocumentReferences(ctx context.Context, userID, docID, content string) error
	RemoveDocumentReferences(ctx context.Context, userID, docID string) error
}

// documentAIClient is the surface DocumentService needs from AIService. It
// covers save-time bookkeeping (MarkEmbeddingPending), semantic search, and
// summarization so we can substitute a stub from tests. The concrete
// *AIService satisfies all three methods.
type documentAIClient interface {
	MarkEmbeddingPending(ctx context.Context, userID, docID, contentHash string, now int64) error
	SemanticSearch(
		ctx context.Context, userID, query string, topK int, excludeID string,
	) ([]string, []float32, error)
	Summarize(ctx context.Context, input string) (string, error)
}

type DocumentService struct {
	db             *sql.DB
	docs           documentRepo
	summaries      documentSummaryRepo
	versions       versionRepo
	tags           documentTagRepo
	shares         shareRepo
	tagRepo        tagRepo
	userRepo       userRepo
	ai             documentAIClient
	assets         documentAssetSyncer
	versionMaxKeep int
	// nowFunc is injectable so tests can pin the clock used by share-expiry
	// filtering (BE-4). Production uses timeutil.NowMilli().
	nowFunc func() int64
}

const (
	minSummaryChars        = 100
	semanticSearchMinScore = 0.7
)

func NewDocumentService(
	db *sql.DB,
	docs documentRepo,
	summaries documentSummaryRepo,
	versions versionRepo,
	tags documentTagRepo,
	shares shareRepo,
	tagRepo tagRepo,
	userRepo userRepo,
	ai *AIService,
	versionMaxKeep int,
) *DocumentService {
	svc := &DocumentService{
		db: db, docs: docs, summaries: summaries, versions: versions,
		tags: tags, shares: shares, tagRepo: tagRepo, userRepo: userRepo,
		versionMaxKeep: versionMaxKeep,
		nowFunc:        timeutil.NowUnix,
	}
	if ai != nil {
		svc.ai = ai
	}
	return svc
}

// SetNowFunc overrides the clock used for time-sensitive queries (e.g. the
// expires_at filter in share listings). Tests use this to make share expiry
// deterministic without sleeping. Callers must pass a non-nil function;
// passing nil is a programming error (the service is unusable without a
// clock) and would silently break expires_at filtering, so we panic.
func (s *DocumentService) SetNowFunc(now func() int64) {
	if now == nil {
		panic("DocumentService.SetNowFunc: now must not be nil")
	}
	s.nowFunc = now
}

func (s *DocumentService) now() int64 {
	return s.nowFunc()
}

func (s *DocumentService) runInTx(ctx context.Context, fn func(ctx context.Context) error) error {
	if s.db == nil {
		return fn(ctx)
	}
	if err := repo.RunInTx(ctx, s.db, fn); err != nil {
		return fmt.Errorf("run in tx: %w", err)
	}
	return nil
}

func (s *DocumentService) SetAssetService(assets *AssetService) {
	if assets == nil {
		s.assets = nil
		return
	}
	s.assets = assets
}

// setAssetSyncer / setEmbeddingNotifier are test seams that let unit tests
// substitute the narrow interfaces directly. They are intentionally
// package-private so production callers go through SetAssetService /
// NewDocumentService.
func (s *DocumentService) setAssetSyncer(a documentAssetSyncer) { s.assets = a }
func (s *DocumentService) setAIClient(c documentAIClient)       { s.ai = c }

type DocumentSummary struct {
	Recent       []model.Document
	TagCounts    map[string]int
	Total        int
	StarredTotal int
}

type PublicShareDetail struct {
	Document      *model.Document `json:"document"`
	Author        string          `json:"author"`
	Tags          []model.Tag     `json:"tags"`
	Permission    int             `json:"permission"`
	AllowDownload int             `json:"allow_download"`
	ExpiresAt     int64           `json:"expires_at"`
}

func (
	s *DocumentService) Search(ctx context.Context,
	userID,
	query,
	tagID string,
	starred *int,
	limit,
	offset uint,
	orderBy string) ([]model.Document,
	error,
) {
	if query == "" && tagID == "" {
		docs, err := s.docs.List(ctx, userID, starred, limit, offset, orderBy)
		if err != nil {
			return nil, fmt.Errorf("list documents: %w", err)
		}
		return s.attachSummaries(ctx, userID, docs)
	}
	docs, err := s.docs.SearchLike(ctx, userID, query, tagID, starred, limit, offset, orderBy)
	if err != nil {
		return nil, fmt.Errorf("search documents: %w", err)
	}
	return s.attachSummaries(ctx, userID, docs)
}

func (s *DocumentService) SemanticSearch(
	ctx context.Context,
	userID, query, _ string,
	_ *int,
	limit, offset uint,
	_, excludeID string,
) ([]model.Document, []float32, error) {
	if query == "" || s.ai == nil {
		return []model.Document{}, []float32{}, nil
	}
	topN := safeconv.UintToInt(limit + offset)
	ids, scores, err := s.ai.SemanticSearch(ctx, userID, query, topN, excludeID)
	if err != nil {
		return nil, nil, fmt.Errorf("semantic search: %w", err)
	}
	if len(ids) == 0 {
		return []model.Document{}, []float32{}, nil
	}

	docs, err := s.docs.ListByIDs(ctx, userID, ids)
	if err != nil {
		return nil, nil, fmt.Errorf("list documents by ids: %w", err)
	}
	docs, err = s.attachSummaries(ctx, userID, docs)
	if err != nil {
		return nil, nil, fmt.Errorf("attach summaries: %w", err)
	}
	idMap := make(map[string]model.Document)
	for _, d := range docs {
		idMap[d.ID] = d
	}
	sortedDocs := make([]model.Document, 0, len(ids))
	sortedScores := make([]float32, 0, len(ids))
	for i, id := range ids {
		if d, ok := idMap[id]; ok {
			if scores[i] < semanticSearchMinScore {
				continue
			}
			sortedDocs = append(sortedDocs, d)
			sortedScores = append(sortedScores, scores[i])
		}
	}
	off := safeconv.UintToInt(offset)
	lim := safeconv.UintToInt(limit)
	if off < len(sortedDocs) {
		end := off + lim
		if end > len(sortedDocs) || lim == 0 {
			end = len(sortedDocs)
		}
		return sortedDocs[off:end], sortedScores[off:end], nil
	}
	return []model.Document{}, []float32{}, nil
}

func (s *DocumentService) Get(ctx context.Context, userID, docID string) (*model.Document, error) {
	doc, err := s.docs.GetByID(ctx, userID, docID)
	if err != nil {
		return nil, fmt.Errorf("get by id: %w", err)
	}
	if err := s.attachSummary(ctx, userID, doc); err != nil {
		return nil, fmt.Errorf("attach summary: %w", err)
	}
	return doc, nil
}

func (s *DocumentService) UpdateTags(ctx context.Context, userID, docID string, tagIDs []string) error {
	if _, err := s.docs.GetByID(ctx, userID, docID); err != nil {
		return fmt.Errorf("get by id: %w", err)
	}
	return s.runInTx(ctx, func(txCtx context.Context) error {
		if err := s.tags.DeleteByDoc(txCtx, userID, docID); err != nil {
			return fmt.Errorf("delete by doc: %w", err)
		}
		for _, tagID := range tagIDs {
			dt := &model.DocumentTag{UserID: userID, DocumentID: docID, TagID: tagID}
			if err := s.tags.Add(txCtx, dt); err != nil {
				return fmt.Errorf("add: %w", err)
			}
		}
		return nil
	})
}

// UpdateSummary only writes the document_summaries row. BE-2 deliberately
// removed the document.mtime/content_mtime touch so that summary regeneration
// does not invalidate the embedding state.
func (s *DocumentService) UpdateSummary(ctx context.Context, userID, docID, summary string) error {
	if _, err := s.docs.GetByID(ctx, userID, docID); err != nil {
		return fmt.Errorf("get by id: %w", err)
	}
	if err := s.summaries.Upsert(ctx, userID, docID, summary, timeutil.NowUnix()); err != nil {
		return fmt.Errorf("upsert: %w", err)
	}
	return nil
}

func (s *DocumentService) UpdatePinned(ctx context.Context, userID, docID string, pinned int) error {
	if pinned != 0 && pinned != 1 {
		return appErr.ErrInvalid
	}
	if err := s.docs.UpdatePinned(ctx, userID, docID, pinned); err != nil {
		return fmt.Errorf("update pinned: %w", err)
	}
	return nil
}

func (s *DocumentService) UpdateStarred(ctx context.Context, userID, docID string, starred int) error {
	if starred != 0 && starred != 1 {
		return appErr.ErrInvalid
	}
	if err := s.docs.UpdateStarred(ctx, userID, docID, starred); err != nil {
		return fmt.Errorf("update starred: %w", err)
	}
	return nil
}

func (
	s *DocumentService) ListSharedDocuments(ctx context.Context,
	userID,
	query string) ([]SharedDocumentSummary,
	error,
) {
	items, err := s.shares.ListActiveDocuments(ctx, userID, query, s.now())
	if err != nil {
		return nil, fmt.Errorf("list active documents: %w", err)
	}
	docIDs := make([]string, 0, len(items))
	for _, item := range items {
		docIDs = append(docIDs, item.ID)
	}
	tagIDsByDoc, err := s.tags.ListTagIDsByDocIDs(ctx, userID, docIDs)
	if err != nil {
		return nil, fmt.Errorf("list tag ids by doc ids: %w", err)
	}
	results := make([]SharedDocumentSummary, 0, len(items))
	for _, item := range items {
		results = append(results, SharedDocumentSummary{
			ID:            item.ID,
			Title:         item.Title,
			Summary:       item.Summary,
			Mtime:         item.Mtime,
			Token:         item.Token,
			TagIDs:        tagIDsByDoc[item.ID],
			ExpiresAt:     item.ExpiresAt,
			Permission:    item.Permission,
			AllowDownload: item.AllowDownload,
		})
	}
	return results, nil
}

func (s *DocumentService) GetByTitle(ctx context.Context, userID, title string) (*model.Document, error) {
	doc, err := s.docs.GetByTitle(ctx, userID, title)
	if err != nil {
		return nil, fmt.Errorf("get by title: %w", err)
	}
	if err := s.attachSummary(ctx, userID, doc); err != nil {
		return nil, fmt.Errorf("attach summary: %w", err)
	}
	return doc, nil
}

func (s *DocumentService) ListByIDs(ctx context.Context, userID string, docIDs []string) ([]model.Document, error) {
	docs, err := s.docs.ListByIDs(ctx, userID, docIDs)
	if err != nil {
		return nil, fmt.Errorf("list by ids: %w", err)
	}
	return s.attachSummaries(ctx, userID, docs)
}

func (s *DocumentService) Summary(ctx context.Context, userID string, recentLimit uint) (*DocumentSummary, error) {
	recent, err := s.docs.List(ctx, userID, nil, recentLimit, 0, "mtime desc")
	if err != nil {
		return nil, fmt.Errorf("list: %w", err)
	}
	recent, err = s.attachSummaries(ctx, userID, recent)
	if err != nil {
		return nil, fmt.Errorf("attach summaries: %w", err)
	}
	items, err := s.tags.ListByUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list by user: %w", err)
	}
	counts := make(map[string]int)
	for _, item := range items {
		counts[item.TagID]++
	}
	count, err := s.docs.Count(ctx, userID, nil)
	if err != nil {
		return nil, fmt.Errorf("count total: %w", err)
	}
	starredVal := 1
	starredCount, err := s.docs.Count(ctx, userID, &starredVal)
	if err != nil {
		return nil, fmt.Errorf("count starred: %w", err)
	}
	return &DocumentSummary{Recent: recent, TagCounts: counts, Total: count, StarredTotal: starredCount}, nil
}

func (s *DocumentService) ListByTag(ctx context.Context, userID, tagID string) ([]model.Document, error) {
	ids, err := s.tags.ListDocIDsByTag(ctx, userID, tagID)
	if err != nil {
		return nil, fmt.Errorf("list doc ids by tag: %w", err)
	}
	v0, err := s.docs.ListByIDs(ctx, userID, ids)
	if err != nil {
		return nil, fmt.Errorf("list by ids: %w", err)
	}
	return s.attachSummaries(ctx, userID, v0)
}

func (s *DocumentService) ListTagIDs(ctx context.Context, userID, docID string) ([]string, error) {
	if _, err := s.docs.GetByID(ctx, userID, docID); err != nil {
		return nil, fmt.Errorf("get by id: %w", err)
	}
	v0, err := s.tags.ListTagIDs(ctx, userID, docID)
	if err != nil {
		return nil, fmt.Errorf("list tag ids: %w", err)
	}
	return v0, nil
}

func (
	s *DocumentService) ListTagIDsByDocIDs(ctx context.Context,
	userID string,
	docIDs []string) (map[string][]string,
	error,
) {
	v0, err := s.tags.ListTagIDsByDocIDs(ctx, userID, docIDs)
	if err != nil {
		return nil, fmt.Errorf("list tag ids by doc ids: %w", err)
	}
	return v0, nil
}

func (s *DocumentService) ListTagsByIDs(ctx context.Context, userID string, ids []string) ([]model.Tag, error) {
	v0, err := s.tagRepo.ListByIDs(ctx, userID, ids)
	if err != nil {
		return nil, fmt.Errorf("list by ids: %w", err)
	}
	return v0, nil
}

func (s *DocumentService) Delete(ctx context.Context, userID, docID string) error {
	return s.runInTx(ctx, func(txCtx context.Context) error {
		now := timeutil.NowUnix()
		if err := s.docs.Delete(txCtx, userID, docID, now); err != nil {
			return fmt.Errorf("delete: %w", err)
		}
		if err := s.shares.RevokeByDocument(txCtx, userID, docID, now); err != nil {
			return fmt.Errorf("revoke by document: %w", err)
		}
		if err := s.tags.DeleteByDoc(txCtx, userID, docID); err != nil {
			return fmt.Errorf("delete by doc: %w", err)
		}
		if s.assets != nil {
			if err := s.assets.RemoveDocumentReferences(txCtx, userID, docID); err != nil {
				return fmt.Errorf("remove document references: %w", err)
			}
		}
		return nil
	})
}

func (
	s *DocumentService) ListVersions(ctx context.Context,
	userID,
	docID string) ([]model.DocumentVersionSummary,
	error,
) {
	if _, err := s.docs.GetByID(ctx, userID, docID); err != nil {
		return nil, fmt.Errorf("get by id: %w", err)
	}
	v0, err := s.versions.ListSummaries(ctx, userID, docID)
	if err != nil {
		return nil, fmt.Errorf("list summaries: %w", err)
	}
	return v0, nil
}

func (
	s *DocumentService) GetVersion(ctx context.Context,
	userID,
	docID string,
	version int) (*model.DocumentVersion,
	error,
) {
	if _, err := s.docs.GetByID(ctx, userID, docID); err != nil {
		return nil, fmt.Errorf("get by id: %w", err)
	}
	v0, err := s.versions.GetByVersion(ctx, userID, docID, version)
	if err != nil {
		return nil, fmt.Errorf("get by version: %w", err)
	}
	return v0, nil
}

func (s *DocumentService) pruneVersions(ctx context.Context, userID, docID string) error {
	if s.versionMaxKeep <= 0 {
		return nil
	}
	if err := s.versions.DeleteOldVersions(ctx, userID, docID, s.versionMaxKeep); err != nil {
		return fmt.Errorf("delete old versions: %w", err)
	}
	return nil
}

func (s *DocumentService) CreateShare(ctx context.Context, userID, docID string) (*model.Share, error) {
	if _, err := s.docs.GetByID(ctx, userID, docID); err != nil {
		return nil, fmt.Errorf("get by id: %w", err)
	}
	now := timeutil.NowUnix()
	share := &model.Share{
		ID: newID(), UserID: userID, DocumentID: docID,
		Token: newToken(), State: repo.ShareStateActive,
		ExpiresAt: 0, Permission: repo.SharePermissionView,
		AllowDownload: 1, Ctime: now, Mtime: now,
	}
	if err := s.runInTx(ctx, func(txCtx context.Context) error {
		if err := s.shares.RevokeByDocument(txCtx, userID, docID, now); err != nil {
			return fmt.Errorf("revoke by document: %w", err)
		}
		if err := s.shares.Create(txCtx, share); err != nil {
			return fmt.Errorf("create share: %w", err)
		}
		return nil
	}); err != nil {
		return nil, err
	}
	return share, nil
}

type ShareConfigInput struct {
	ExpiresAt     int64
	Password      string
	ClearPassword bool
	Permission    int
	AllowDownload bool
}

type CreateShareCommentInput struct {
	Token     string
	Password  string
	Author    string
	ReplyToID string
	Content   string
}

func (
	s *DocumentService) UpdateShareConfig(ctx context.Context,
	userID,
	docID string,
	input ShareConfigInput) (*model.Share,
	error,
) {
	share, err := s.GetActiveShare(ctx, userID, docID)
	if err != nil {
		return nil, fmt.Errorf("get active share: %w", err)
	}
	if input.Permission != repo.SharePermissionView && input.Permission != repo.SharePermissionComment {
		return nil, appErr.ErrInvalid
	}
	if input.ExpiresAt < 0 {
		return nil, appErr.ErrInvalid
	}
	passwordHash := share.PasswordHash
	if strings.TrimSpace(input.Password) != "" {
		hashed, err := password.Hash(strings.TrimSpace(input.Password))
		if err != nil {
			return nil, fmt.Errorf("hash share password: %w", err)
		}
		passwordHash = hashed
	}
	if input.ClearPassword {
		passwordHash = ""
	}
	allowDownload := 0
	if input.AllowDownload {
		allowDownload = 1
	}
	now := timeutil.NowUnix()
	if err := s.shares.UpdateConfigByDocument(ctx, userID, docID, input.ExpiresAt, passwordHash, input.Permission,
		allowDownload, now); err != nil {
		return nil, fmt.Errorf("update config by document: %w", err)
	}
	return s.GetActiveShare(ctx, userID, docID)
}

func (s *DocumentService) RevokeShare(ctx context.Context, userID, docID string) error {
	if _, err := s.docs.GetByID(ctx, userID, docID); err != nil {
		return fmt.Errorf("get by id: %w", err)
	}
	if err := s.shares.RevokeByDocument(ctx, userID, docID, timeutil.NowUnix()); err != nil {
		return fmt.Errorf("revoke by document: %w", err)
	}
	return nil
}

func (s *DocumentService) GetActiveShare(ctx context.Context, userID, docID string) (*model.Share, error) {
	if _, err := s.docs.GetByID(ctx, userID, docID); err != nil {
		return nil, fmt.Errorf("get by id: %w", err)
	}
	share, err := s.shares.GetActiveByDocument(ctx, userID, docID)
	if errors.Is(err, appErr.ErrNotFound) {
		return nil, nil //nolint:nilnil // nil share with nil error means "no active share"
	}
	if err != nil {
		return nil, fmt.Errorf("get active share: %w", err)
	}
	return share, nil
}

func (
	s *DocumentService) resolveAccessibleShareByToken(ctx context.Context,
	token,
	sharePassword string) (*model.Share,
	error,
) {
	share, err := s.shares.GetByToken(ctx, token)
	if err != nil {
		return nil, fmt.Errorf("get by token: %w", err)
	}
	if share.State != repo.ShareStateActive {
		return nil, appErr.ErrNotFound
	}
	now := timeutil.NowUnix()
	if share.ExpiresAt > 0 && share.ExpiresAt < now {
		return nil, appErr.ErrNotFound
	}
	if err := s.verifySharePassword(share, sharePassword); err != nil {
		return nil, err
	}
	return share, nil
}

func (s *DocumentService) verifySharePassword(share *model.Share, sharePassword string) error {
	if share.PasswordHash == "" {
		return nil
	}
	trimmed := strings.TrimSpace(sharePassword)
	if trimmed == "" {
		return appErr.ErrForbidden
	}
	if err := password.Compare(share.PasswordHash, trimmed); err != nil {
		return appErr.ErrForbidden
	}
	return nil
}

func (
	s *DocumentService) GetShareByToken(ctx context.Context,
	token,
	sharePassword string) (*PublicShareDetail,
	error,
) {
	share, err := s.resolveAccessibleShareByToken(ctx, token, sharePassword)
	if err != nil {
		return nil, fmt.Errorf("resolve accessible share by token: %w", err)
	}
	doc, err := s.docs.GetByID(ctx, share.UserID, share.DocumentID)
	if err != nil {
		return nil, fmt.Errorf("get document by id: %w", err)
	}
	user, err := s.userRepo.GetByID(ctx, share.UserID)
	if err != nil {
		return nil, fmt.Errorf("get user by id: %w", err)
	}
	tagIDs, err := s.tags.ListTagIDs(ctx, share.UserID, share.DocumentID)
	if err != nil {
		return nil, fmt.Errorf("list tag ids: %w", err)
	}
	tags, err := s.tagRepo.ListByIDs(ctx, share.UserID, tagIDs)
	if err != nil {
		return nil, fmt.Errorf("list by ids: %w", err)
	}
	return &PublicShareDetail{
		Document:      doc,
		Author:        user.Email,
		Tags:          tags,
		Permission:    share.Permission,
		AllowDownload: share.AllowDownload,
		ExpiresAt:     share.ExpiresAt,
	}, nil
}

type ShareCommentWithReplies struct {
	model.ShareComment
	Replies []model.ShareComment `json:"replies"`
}

type ShareCommentListResult struct {
	Items []ShareCommentWithReplies `json:"items"`
	Total int                       `json:"total"`
}

func (
	s *DocumentService) ListShareCommentsByToken(ctx context.Context,
	token,
	sharePassword string,
	limit,
	offset int) (*ShareCommentListResult,
	error,
) {
	share, err := s.resolveAccessibleShareByToken(ctx, token, sharePassword)
	if err != nil {
		return nil, fmt.Errorf("resolve accessible share by token: %w", err)
	}
	total, err := s.shares.CountRootCommentsByShare(ctx, share.ID)
	if err != nil {
		return nil, fmt.Errorf("count root comments by share: %w", err)
	}
	roots, err := s.shares.ListCommentsByShare(ctx, share.ID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("list comments by share: %w", err)
	}
	if len(roots) == 0 {
		return &ShareCommentListResult{
			Items: []ShareCommentWithReplies{},
			Total: total,
		}, nil
	}

	var rootIDs []string
	for _, r := range roots {
		rootIDs = append(rootIDs, r.ID)
	}

	counts, err := s.shares.CountRepliesByRootIDs(ctx, share.ID, rootIDs)
	if err != nil {
		return nil, fmt.Errorf("count replies by root ids: %w", err)
	}

	allReplies, err := s.shares.ListRepliesByRootIDs(ctx, share.ID, rootIDs)
	if err != nil {
		return nil, fmt.Errorf("list replies by root ids: %w", err)
	}
	repliesByRoot := make(map[string][]model.ShareComment)
	for _, reply := range allReplies {
		repliesByRoot[reply.RootID] = append(repliesByRoot[reply.RootID], reply)
	}

	const previewLimit = 5
	var result []ShareCommentWithReplies
	for _, r := range roots {
		r.ReplyCount = counts[r.ID]
		preview := repliesByRoot[r.ID]
		if preview == nil {
			preview = []model.ShareComment{}
		} else if len(preview) > previewLimit {
			preview = preview[:previewLimit]
		}
		result = append(result, ShareCommentWithReplies{
			ShareComment: r,
			Replies:      preview,
		})
	}

	return &ShareCommentListResult{
		Items: result,
		Total: total,
	}, nil
}

func (
	s *DocumentService) ListShareCommentRepliesByToken(ctx context.Context,
	token,
	sharePassword,
	rootID string,
	limit,
	offset int) ([]model.ShareComment,
	error,
) {
	share, err := s.resolveAccessibleShareByToken(ctx, token, sharePassword)
	if err != nil {
		return nil, fmt.Errorf("resolve accessible share by token: %w", err)
	}

	// Verify the root comment exists and belongs to this share
	root, err := s.shares.GetCommentByID(ctx, rootID)
	if err != nil {
		return nil, fmt.Errorf("get comment by id: %w", err)
	}
	if root.ShareID != share.ID {
		return nil, appErr.ErrNotFound
	}

	replies, err := s.shares.ListRepliesByRootID(ctx, share.ID, rootID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("list replies by root id: %w", err)
	}
	if replies == nil {
		return []model.ShareComment{}, nil
	}
	return replies, nil
}

func (
	s *DocumentService) CreateShareCommentByToken(ctx context.Context,
	input CreateShareCommentInput) (*model.ShareComment,
	error,
) {
	share, err := s.resolveAccessibleShareByToken(ctx, input.Token, input.Password)
	if err != nil {
		return nil, fmt.Errorf("resolve accessible share by token: %w", err)
	}
	if share.Permission != repo.SharePermissionComment {
		return nil, appErr.ErrForbidden
	}
	content := strings.TrimSpace(input.Content)
	if content == "" || utf8.RuneCountInString(content) > 2000 {
		return nil, appErr.ErrInvalid
	}
	author := strings.TrimSpace(input.Author)
	if author == "" {
		author = "Guest"
	}
	if utf8.RuneCountInString(author) > 40 {
		author = string([]rune(author)[:40])
	}

	rootID, replyToID := s.resolveCommentThread(ctx, share.ID, strings.TrimSpace(input.ReplyToID))

	now := timeutil.NowUnix()
	comment := &model.ShareComment{
		ID:         newID(),
		ShareID:    share.ID,
		DocumentID: share.DocumentID,
		RootID:     rootID,
		ReplyToID:  replyToID,
		Author:     author,
		Content:    content,
		State:      repo.ShareCommentStateNormal,
		Ctime:      now,
		Mtime:      now,
	}
	if err := s.shares.CreateComment(ctx, comment); err != nil {
		return nil, fmt.Errorf("create comment: %w", err)
	}
	return comment, nil
}

func (s *DocumentService) resolveCommentThread(
	ctx context.Context, shareID, replyToID string,
) (string, string) {
	if replyToID == "" {
		return "", ""
	}
	target, err := s.shares.GetCommentByID(ctx, replyToID)
	if err != nil || target.ShareID != shareID {
		return "", ""
	}
	if target.RootID == "" {
		return target.ID, replyToID
	}
	return target.RootID, replyToID
}

type SharedDocumentSummary struct {
	ID            string   `json:"id"`
	Title         string   `json:"title"`
	Summary       string   `json:"summary"`
	Mtime         int64    `json:"mtime"`
	Token         string   `json:"token"`
	TagIDs        []string `json:"tag_ids"`
	ExpiresAt     int64    `json:"expires_at"`
	Permission    int      `json:"permission"`
	AllowDownload int      `json:"allow_download"`
}

type DocumentCreateInput struct {
	Title   string
	Content string
	TagIDs  []string
	Summary string
}

// DocumentUpdateInput is the unified save payload used by both the editor
// save path (where BaseRevision is required) and internal callers such as
// the import service (where BaseRevision is left at its zero value to opt
// out of optimistic concurrency control).
type DocumentUpdateInput struct {
	Title   string
	Content string
	TagIDs  []string
	Summary *string
	// BaseRevision is the content_revision the client last observed. When
	// non-zero the service performs an optimistic concurrency check inside
	// the save transaction; when zero the caller is asserting that
	// concurrency is handled out-of-band (used by server-side imports).
	BaseRevision int64
}

func extractLinkIDs(content string) []string {
	// Match /docs/ID
	// The ID is usually alphanumeric + dashes. We use a broad regex for the path segment.
	var ids []string
	matches := linkRegex.FindAllStringSubmatch(content, -1)
	for _, m := range matches {
		if len(m) > 1 && m[1] != "" {
			ids = append(ids, m[1])
		}
	}
	return ids
}

var linkRegex = regexp.MustCompile(`\/docs\/([a-zA-Z0-9_\-]+)`)

// Update is the back-compatible save entry point: it runs the unified save
// transaction but does not surface SaveDocumentResult. New callers that need
// the post-save revision should use Save instead.
func (s *DocumentService) Update(ctx context.Context, userID, docID string, input DocumentUpdateInput) error {
	_, err := s.Save(ctx, userID, docID, input)
	return err
}

// Save executes a single atomic save transaction guarded by SELECT FOR
// UPDATE on the documents row. When input.BaseRevision is non-zero and does
// not match the current server-side revision the save is rejected with a
// *errors.ConflictError carrying the current snapshot, leaving every other
// table untouched. The returned SaveDocumentResult mirrors exactly what the
// transaction committed so the client can update its local state without an
// extra read.
func (
	s *DocumentService) Save(ctx context.Context,
	userID,
	docID string,
	input DocumentUpdateInput) (*model.SaveDocumentResult,
	error,
) {
	var result *model.SaveDocumentResult
	if err := s.runInTx(ctx, func(txCtx context.Context) error {
		r, err := s.saveImpl(txCtx, userID, docID, input)
		if err != nil {
			return err
		}
		result = r
		return nil
	}); err != nil {
		return nil, err
	}
	return result, nil
}

// saveImpl runs the body of Save inside a transaction. The work is split
// into small helpers so each step (lock+conflict, document update, version
// snapshot, tag refresh, references) is independently readable and the
// orchestrator stays well below the gocyclo threshold.
func (
	s *DocumentService) saveImpl(ctx context.Context,
	userID,
	docID string,
	input DocumentUpdateInput) (*model.SaveDocumentResult,
	error,
) {
	current, err := s.lockForSave(ctx, userID, docID, input.BaseRevision)
	if err != nil {
		return nil, err
	}
	now := timeutil.NowUnix()
	newRevision := current.ContentRevision + 1
	newHash := computeDocumentHash(input.Title, input.Content)
	if err := s.persistDocument(ctx, userID, docID, input, now, newRevision, newHash); err != nil {
		return nil, err
	}
	if err := s.recordVersion(ctx, userID, docID, input, now, newRevision); err != nil {
		return nil, err
	}
	if err := s.applyTagChanges(ctx, userID, docID, input.TagIDs); err != nil {
		return nil, err
	}
	if err := s.refreshReferences(ctx, userID, docID, input.Content, now, newHash); err != nil {
		return nil, err
	}
	return &model.SaveDocumentResult{
		ID:              docID,
		ContentRevision: newRevision,
		ContentHash:     newHash,
		ContentMtime:    now,
		Mtime:           now,
	}, nil
}

// lockForSave takes the row-level write lock and rejects stale writers via
// the optimistic base_revision check before any further mutation. Returns
// a ConflictError (not a generic error) when base_revision is stale so
// the handler can translate it into a 409 with the current snapshot.
func (s *DocumentService) lockForSave(
	ctx context.Context, userID, docID string, baseRevision int64,
) (*model.Document, error) {
	current, err := s.docs.GetByIDForUpdate(ctx, userID, docID)
	if err != nil {
		return nil, fmt.Errorf("lock document: %w", err)
	}
	if baseRevision != 0 && baseRevision != current.ContentRevision {
		return nil, appErr.NewConflict(appErr.ConflictData{
			ID:              current.ID,
			Title:           current.Title,
			Content:         current.Content,
			ContentRevision: current.ContentRevision,
			ContentMtime:    current.ContentMtime,
		})
	}
	return current, nil
}

func (s *DocumentService) persistDocument(
	ctx context.Context,
	userID, docID string,
	input DocumentUpdateInput,
	now, newRevision int64,
	newHash string,
) error {
	doc := &model.Document{
		ID: docID, UserID: userID,
		Title: input.Title, Content: input.Content, Mtime: now,
		ContentHash: newHash, ContentMtime: now, ContentRevision: newRevision,
	}
	if err := s.docs.Update(ctx, doc); err != nil {
		return fmt.Errorf("update: %w", err)
	}
	if input.Summary != nil {
		if err := s.summaries.Upsert(ctx, userID, docID, *input.Summary, now); err != nil {
			return fmt.Errorf("upsert: %w", err)
		}
	}
	return nil
}

func (s *DocumentService) recordVersion(
	ctx context.Context,
	userID, docID string,
	input DocumentUpdateInput,
	now, newRevision int64,
) error {
	version := &model.DocumentVersion{
		ID: newID(), UserID: userID, DocumentID: docID,
		Version: int(newRevision), Title: input.Title,
		Content: input.Content, Ctime: now,
	}
	if err := s.versions.Create(ctx, version); err != nil {
		return fmt.Errorf("create version: %w", err)
	}
	if err := s.pruneVersions(ctx, userID, docID); err != nil {
		return fmt.Errorf("prune versions: %w", err)
	}
	return nil
}

func (s *DocumentService) applyTagChanges(
	ctx context.Context, userID, docID string, tagIDs []string,
) error {
	if tagIDs == nil {
		return nil
	}
	if err := s.tags.DeleteByDoc(ctx, userID, docID); err != nil {
		return fmt.Errorf("delete by doc: %w", err)
	}
	for _, tagID := range tagIDs {
		dt := &model.DocumentTag{UserID: userID, DocumentID: docID, TagID: tagID}
		if err := s.tags.Add(ctx, dt); err != nil {
			return fmt.Errorf("add: %w", err)
		}
	}
	return nil
}

func (s *DocumentService) refreshReferences(
	ctx context.Context,
	userID, docID, content string,
	now int64,
	newHash string,
) error {
	linkIDs := extractLinkIDs(content)
	if err := s.docs.UpdateLinks(ctx, userID, docID, linkIDs, now); err != nil {
		return fmt.Errorf("update links: %w", err)
	}
	if s.assets != nil {
		if err := s.assets.SyncDocumentReferences(ctx, userID, docID, content); err != nil {
			return fmt.Errorf("sync document references: %w", err)
		}
	}
	if s.ai != nil {
		if err := s.ai.MarkEmbeddingPending(ctx, userID, docID, newHash, now); err != nil {
			return fmt.Errorf("mark embedding pending: %w", err)
		}
	}
	return nil
}

func (
	s *DocumentService) Create(ctx context.Context,
	userID string,
	input DocumentCreateInput) (*model.Document,
	error,
) {
	now := timeutil.NowUnix()
	doc := &model.Document{
		ID: newID(), UserID: userID, Title: input.Title,
		Content: input.Content, State: repo.DocumentStateNormal,
		Pinned: 0, Ctime: now, Mtime: now,
		ContentHash:     computeDocumentHash(input.Title, input.Content),
		ContentMtime:    now,
		ContentRevision: 1,
	}
	if err := s.runInTx(ctx, func(txCtx context.Context) error {
		return s.createImpl(txCtx, userID, doc, input)
	}); err != nil {
		return nil, err
	}
	return doc, nil
}

func (s *DocumentService) createImpl(
	ctx context.Context, userID string, doc *model.Document, input DocumentCreateInput,
) error {
	if err := s.docs.Create(ctx, doc); err != nil {
		return fmt.Errorf("create document: %w", err)
	}
	if input.Summary != "" {
		if err := s.summaries.Upsert(ctx, userID, doc.ID, input.Summary, doc.Mtime); err != nil {
			return fmt.Errorf("upsert: %w", err)
		}
		doc.Summary = input.Summary
	}
	version := &model.DocumentVersion{
		ID: newID(), UserID: userID, DocumentID: doc.ID,
		Version: 1, Title: doc.Title, Content: doc.Content, Ctime: doc.Mtime,
	}
	if err := s.versions.Create(ctx, version); err != nil {
		return fmt.Errorf("create version: %w", err)
	}
	if err := s.pruneVersions(ctx, userID, doc.ID); err != nil {
		return fmt.Errorf("prune versions: %w", err)
	}
	if input.TagIDs != nil {
		if err := s.tags.DeleteByDoc(ctx, userID, doc.ID); err != nil {
			return fmt.Errorf("delete by doc: %w", err)
		}
		for _, tagID := range input.TagIDs {
			dt := &model.DocumentTag{UserID: userID, DocumentID: doc.ID, TagID: tagID}
			if err := s.tags.Add(ctx, dt); err != nil {
				return fmt.Errorf("add: %w", err)
			}
		}
	}
	linkIDs := extractLinkIDs(input.Content)
	if err := s.docs.UpdateLinks(ctx, userID, doc.ID, linkIDs, doc.Mtime); err != nil {
		return fmt.Errorf("update links: %w", err)
	}
	if s.assets != nil {
		if err := s.assets.SyncDocumentReferences(ctx, userID, doc.ID, input.Content); err != nil {
			return fmt.Errorf("sync document references: %w", err)
		}
	}
	return nil
}

func (s *DocumentService) GetBacklinks(ctx context.Context, userID, docID string) ([]model.Document, error) {
	docs, err := s.docs.GetBacklinks(ctx, userID, docID)
	if err != nil {
		return nil, fmt.Errorf("get backlinks: %w", err)
	}
	return s.attachSummaries(ctx, userID, docs)
}

func (s *DocumentService) ProcessPendingSummaries(ctx context.Context, delaySeconds int64) error {
	if s.ai == nil || s.summaries == nil {
		return nil
	}
	logger := logutil.GetLogger(ctx)
	cutoff := timeutil.NowUnix() - clampDelay(delaySeconds)
	docs, err := s.summaries.ListPendingDocuments(ctx, 50, cutoff)
	if err != nil {
		logger.Error("failed to list pending summaries", zap.Error(err))
		return fmt.Errorf("list pending documents: %w", err)
	}
	if len(docs) == 0 {
		return nil
	}
	logger.Info("processing pending summaries", zap.Int("count", len(docs)))
	for _, doc := range docs {
		if err := checkCtx(ctx); err != nil {
			return err
		}
		if err := s.processOneSummary(ctx, logger, doc); err != nil {
			return err
		}
	}
	return nil
}

func (s *DocumentService) processOneSummary(
	ctx context.Context, logger *zap.Logger, doc model.Document,
) error {
	if utf8.RuneCountInString(doc.Content) < minSummaryChars {
		now := timeutil.NowUnix()
		if err := s.summaries.Upsert(ctx, doc.UserID, doc.ID, "", now); err != nil {
			logger.Error("failed to mark empty summary", zap.String("doc_id", doc.ID), zap.Error(err))
		}
		return nil
	}
	summary, err := s.ai.Summarize(ctx, doc.Content)
	if err != nil {
		return s.handleSummaryError(ctx, logger, doc.ID, err)
	}
	now := timeutil.NowUnix()
	if err := s.summaries.Upsert(ctx, doc.UserID, doc.ID, summary, now); err != nil {
		logger.Error("failed to save summary", zap.String("doc_id", doc.ID), zap.Error(err))
	}
	return waitCtx(ctx, 100*time.Millisecond)
}

func (s *DocumentService) handleSummaryError(
	ctx context.Context, logger *zap.Logger, docID string, err error,
) error {
	if isRateLimitErr(err) {
		logger.Warn("ai rate limit triggered, cooling down...", zap.Error(err))
		return waitCtx(ctx, 10*time.Second)
	}
	logger.Error("failed to summarize document", zap.String("doc_id", docID), zap.Error(err))
	return nil
}

func (s *DocumentService) attachSummary(ctx context.Context, userID string, doc *model.Document) error {
	if doc == nil {
		return nil
	}
	summary, err := s.summaries.GetByDocID(ctx, userID, doc.ID)
	if err == nil {
		doc.Summary = summary
		return nil
	}
	if errors.Is(err, appErr.ErrNotFound) {
		doc.Summary = ""
		return nil
	}
	return fmt.Errorf("get summary: %w", err)
}

func (
	s *DocumentService) attachSummaries(ctx context.Context,
	userID string,
	docs []model.Document) ([]model.Document,
	error,
) {
	if err := populateDocSummaries(ctx, s.summaries, userID, docs); err != nil {
		return nil, err
	}
	return docs, nil
}
