package service

import (
	"context"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/xxxsen/common/logutil"
	"go.uber.org/zap"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/password"
	"github.com/xxxsen/mnote/internal/pkg/timeutil"
	"github.com/xxxsen/mnote/internal/repo"
)

type DocumentService struct {
	docs           *repo.DocumentRepo
	summaries      *repo.DocumentSummaryRepo
	versions       *repo.VersionRepo
	tags           *repo.DocumentTagRepo
	shares         *repo.ShareRepo
	tagRepo        *repo.TagRepo
	userRepo       *repo.UserRepo
	ai             *AIService
	assets         *AssetService
	versionMaxKeep int
}

const minSummaryChars = 100

func NewDocumentService(docs *repo.DocumentRepo, summaries *repo.DocumentSummaryRepo, versions *repo.VersionRepo, tags *repo.DocumentTagRepo, shares *repo.ShareRepo, tagRepo *repo.TagRepo, userRepo *repo.UserRepo, ai *AIService, versionMaxKeep int) *DocumentService {
	return &DocumentService{docs: docs, summaries: summaries, versions: versions, tags: tags, shares: shares, tagRepo: tagRepo, userRepo: userRepo, ai: ai, versionMaxKeep: versionMaxKeep}
}

func (s *DocumentService) SetAssetService(assets *AssetService) {
	s.assets = assets
}

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

func (s *DocumentService) Search(ctx context.Context, userID, query, tagID string, starred *int, limit, offset uint, orderBy string) ([]model.Document, error) {
	if query == "" && tagID == "" {
		docs, err := s.docs.List(ctx, userID, starred, limit, offset, orderBy)
		if err != nil {
			return nil, err
		}
		return s.attachSummaries(ctx, userID, docs)
	}
	docs, err := s.docs.SearchLike(ctx, userID, query, tagID, starred, limit, offset, orderBy)
	if err != nil {
		return nil, err
	}
	return s.attachSummaries(ctx, userID, docs)
}

func (s *DocumentService) SemanticSearch(ctx context.Context, userID, query, tagID string, starred *int, limit, offset uint, orderBy string, excludeID string) ([]model.Document, []float32, error) {
	if query == "" || s.ai == nil {
		return []model.Document{}, []float32{}, nil
	}
	ids, scores, err := s.ai.SemanticSearch(ctx, userID, query, int(limit+offset), excludeID)
	if err != nil {
		return nil, nil, err
	}
	if len(ids) == 0 {
		return []model.Document{}, []float32{}, nil
	}

	docs, err := s.docs.ListByIDs(ctx, userID, ids)
	if err != nil {
		return nil, nil, err
	}
	docs, err = s.attachSummaries(ctx, userID, docs)
	if err != nil {
		return nil, nil, err
	}
	idMap := make(map[string]model.Document)
	for _, d := range docs {
		idMap[d.ID] = d
	}
	sortedDocs := make([]model.Document, 0, len(ids))
	sortedScores := make([]float32, 0, len(ids))
	for i, id := range ids {
		if d, ok := idMap[id]; ok {
			if scores[i] < 0.7 {
				continue
			}
			sortedDocs = append(sortedDocs, d)
			sortedScores = append(sortedScores, scores[i])
		}
	}
	if int(offset) < len(sortedDocs) {
		end := int(offset + limit)
		if end > len(sortedDocs) || limit == 0 {
			end = len(sortedDocs)
		}
		return sortedDocs[offset:end], sortedScores[offset:end], nil
	}
	return []model.Document{}, []float32{}, nil
}

func (s *DocumentService) Get(ctx context.Context, userID, docID string) (*model.Document, error) {
	doc, err := s.docs.GetByID(ctx, userID, docID)
	if err != nil {
		return nil, err
	}
	if err := s.attachSummary(ctx, userID, doc); err != nil {
		return nil, err
	}
	return doc, nil
}

func (s *DocumentService) UpdateTags(ctx context.Context, userID, docID string, tagIDs []string) error {
	if _, err := s.docs.GetByID(ctx, userID, docID); err != nil {
		return err
	}
	if err := s.tags.DeleteByDoc(ctx, userID, docID); err != nil {
		return err
	}
	for _, tagID := range tagIDs {
		if err := s.tags.Add(ctx, &model.DocumentTag{UserID: userID, DocumentID: docID, TagID: tagID}); err != nil {
			return err
		}
	}
	return nil
}

func (s *DocumentService) UpdateSummary(ctx context.Context, userID, docID, summary string) error {
	if _, err := s.docs.GetByID(ctx, userID, docID); err != nil {
		return err
	}
	now := timeutil.NowUnix()
	if err := s.summaries.Upsert(ctx, userID, docID, summary, now); err != nil {
		return err
	}
	return s.docs.TouchMtime(ctx, userID, docID, now)
}

func (s *DocumentService) UpdatePinned(ctx context.Context, userID, docID string, pinned int) error {
	if pinned != 0 && pinned != 1 {
		return appErr.ErrInvalid
	}
	return s.docs.UpdatePinned(ctx, userID, docID, pinned)
}

func (s *DocumentService) UpdateStarred(ctx context.Context, userID, docID string, starred int) error {
	if starred != 0 && starred != 1 {
		return appErr.ErrInvalid
	}
	return s.docs.UpdateStarred(ctx, userID, docID, starred)
}

func (s *DocumentService) ListSharedDocuments(ctx context.Context, userID string, query string) ([]SharedDocumentSummary, error) {
	items, err := s.shares.ListActiveDocuments(ctx, userID, query)
	if err != nil {
		return nil, err
	}
	docIDs := make([]string, 0, len(items))
	for _, item := range items {
		docIDs = append(docIDs, item.ID)
	}
	tagIDsByDoc, err := s.tags.ListTagIDsByDocIDs(ctx, userID, docIDs)
	if err != nil {
		return nil, err
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
		return nil, err
	}
	if err := s.attachSummary(ctx, userID, doc); err != nil {
		return nil, err
	}
	return doc, nil
}

func (s *DocumentService) ListByIDs(ctx context.Context, userID string, docIDs []string) ([]model.Document, error) {
	docs, err := s.docs.ListByIDs(ctx, userID, docIDs)
	if err != nil {
		return nil, err
	}
	return s.attachSummaries(ctx, userID, docs)
}

func (s *DocumentService) Summary(ctx context.Context, userID string, recentLimit uint) (*DocumentSummary, error) {

	recent, err := s.docs.List(ctx, userID, nil, recentLimit, 0, "mtime desc")
	if err != nil {
		return nil, err
	}
	recent, err = s.attachSummaries(ctx, userID, recent)
	if err != nil {
		return nil, err
	}
	items, err := s.tags.ListByUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	counts := make(map[string]int)
	for _, item := range items {
		counts[item.TagID]++
	}
	count, err := s.docs.Count(ctx, userID, nil)
	if err != nil {
		return nil, err
	}
	starredVal := 1
	starredCount, err := s.docs.Count(ctx, userID, &starredVal)
	if err != nil {
		return nil, err
	}
	return &DocumentSummary{Recent: recent, TagCounts: counts, Total: count, StarredTotal: starredCount}, nil
}

func (s *DocumentService) ListByTag(ctx context.Context, userID, tagID string) ([]model.Document, error) {
	ids, err := s.tags.ListDocIDsByTag(ctx, userID, tagID)
	if err != nil {
		return nil, err
	}
	return s.docs.ListByIDs(ctx, userID, ids)
}

func (s *DocumentService) ListTagIDs(ctx context.Context, userID, docID string) ([]string, error) {
	if _, err := s.docs.GetByID(ctx, userID, docID); err != nil {
		return nil, err
	}
	return s.tags.ListTagIDs(ctx, userID, docID)
}

func (s *DocumentService) ListTagIDsByDocIDs(ctx context.Context, userID string, docIDs []string) (map[string][]string, error) {
	return s.tags.ListTagIDsByDocIDs(ctx, userID, docIDs)
}

func (s *DocumentService) ListTagsByIDs(ctx context.Context, userID string, ids []string) ([]model.Tag, error) {
	return s.tagRepo.ListByIDs(ctx, userID, ids)
}

func (s *DocumentService) Delete(ctx context.Context, userID, docID string) error {
	now := timeutil.NowUnix()
	if err := s.docs.Delete(ctx, userID, docID, now); err != nil {
		return err
	}
	if err := s.shares.RevokeByDocument(ctx, userID, docID, now); err != nil {
		return err
	}
	if err := s.tags.DeleteByDoc(ctx, userID, docID); err != nil {
		return err
	}
	if s.assets != nil {
		if err := s.assets.RemoveDocumentReferences(ctx, userID, docID); err != nil {
			return err
		}
	}
	return nil
}

func (s *DocumentService) ListVersions(ctx context.Context, userID, docID string) ([]model.DocumentVersionSummary, error) {
	if _, err := s.docs.GetByID(ctx, userID, docID); err != nil {
		return nil, err
	}
	return s.versions.ListSummaries(ctx, userID, docID)
}

func (s *DocumentService) GetVersion(ctx context.Context, userID, docID string, version int) (*model.DocumentVersion, error) {
	if _, err := s.docs.GetByID(ctx, userID, docID); err != nil {
		return nil, err
	}
	return s.versions.GetByVersion(ctx, userID, docID, version)
}

func (s *DocumentService) pruneVersions(ctx context.Context, userID, docID string) error {
	if s.versionMaxKeep <= 0 {
		return nil
	}
	return s.versions.DeleteOldVersions(ctx, userID, docID, s.versionMaxKeep)
}

func (s *DocumentService) CreateShare(ctx context.Context, userID, docID string) (*model.Share, error) {
	if _, err := s.docs.GetByID(ctx, userID, docID); err != nil {
		return nil, err
	}
	now := timeutil.NowUnix()
	if err := s.shares.RevokeByDocument(ctx, userID, docID, now); err != nil {
		return nil, err
	}
	share := &model.Share{
		ID:            newID(),
		UserID:        userID,
		DocumentID:    docID,
		Token:         newToken(),
		State:         repo.ShareStateActive,
		ExpiresAt:     0,
		Permission:    repo.SharePermissionView,
		AllowDownload: 1,
		Ctime:         now,
		Mtime:         now,
	}
	if err := s.shares.Create(ctx, share); err != nil {
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

func (s *DocumentService) UpdateShareConfig(ctx context.Context, userID, docID string, input ShareConfigInput) (*model.Share, error) {
	share, err := s.GetActiveShare(ctx, userID, docID)
	if err != nil {
		return nil, err
	}
	if input.Permission != repo.SharePermissionView && input.Permission != repo.SharePermissionComment {
		return nil, appErr.ErrInvalid
	}
	if input.ExpiresAt < 0 {
		return nil, appErr.ErrInvalid
	}
	passwordHash := share.PasswordHash
	if strings.TrimSpace(input.Password) != "" {
		passwordHash = strings.TrimSpace(input.Password)
	}
	if input.ClearPassword {
		passwordHash = ""
	}
	allowDownload := 0
	if input.AllowDownload {
		allowDownload = 1
	}
	now := timeutil.NowUnix()
	if err := s.shares.UpdateConfigByDocument(ctx, userID, docID, input.ExpiresAt, passwordHash, input.Permission, allowDownload, now); err != nil {
		return nil, err
	}
	return s.GetActiveShare(ctx, userID, docID)
}

func (s *DocumentService) RevokeShare(ctx context.Context, userID, docID string) error {
	if _, err := s.docs.GetByID(ctx, userID, docID); err != nil {
		return err
	}
	return s.shares.RevokeByDocument(ctx, userID, docID, timeutil.NowUnix())
}

func (s *DocumentService) GetActiveShare(ctx context.Context, userID, docID string) (*model.Share, error) {
	if _, err := s.docs.GetByID(ctx, userID, docID); err != nil {
		return nil, err
	}
	share, err := s.shares.GetActiveByDocument(ctx, userID, docID)
	if err == appErr.ErrNotFound {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return share, nil
}

func (s *DocumentService) resolveAccessibleShareByToken(ctx context.Context, token, sharePassword string) (*model.Share, error) {
	share, err := s.shares.GetByToken(ctx, token)
	if err != nil {
		return nil, err
	}
	if share.State != repo.ShareStateActive {
		return nil, appErr.ErrNotFound
	}
	now := timeutil.NowUnix()
	if share.ExpiresAt > 0 && share.ExpiresAt < now {
		return nil, appErr.ErrNotFound
	}
	if share.PasswordHash != "" {
		if strings.TrimSpace(sharePassword) == "" {
			return nil, appErr.ErrForbidden
		}
		trimmed := strings.TrimSpace(sharePassword)
		if share.PasswordHash != trimmed {
			if err := password.Compare(share.PasswordHash, trimmed); err != nil {
				return nil, appErr.ErrForbidden
			}
		}
	}
	return share, nil
}

func (s *DocumentService) GetShareByToken(ctx context.Context, token, sharePassword string) (*PublicShareDetail, error) {
	share, err := s.resolveAccessibleShareByToken(ctx, token, sharePassword)
	if err != nil {
		return nil, err
	}
	doc, err := s.docs.GetByID(ctx, share.UserID, share.DocumentID)
	if err != nil {
		return nil, err
	}
	user, err := s.userRepo.GetByID(ctx, share.UserID)
	if err != nil {
		return nil, err
	}
	tagIDs, err := s.tags.ListTagIDs(ctx, share.UserID, share.DocumentID)
	if err != nil {
		return nil, err
	}
	tags, err := s.tagRepo.ListByIDs(ctx, share.UserID, tagIDs)
	if err != nil {
		return nil, err
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

func (s *DocumentService) ListShareCommentsByToken(ctx context.Context, token, sharePassword string, limit, offset int) ([]ShareCommentWithReplies, error) {
	share, err := s.resolveAccessibleShareByToken(ctx, token, sharePassword)
	if err != nil {
		return nil, err
	}
	roots, err := s.shares.ListCommentsByShare(ctx, share.ID, limit, offset)
	if err != nil {
		return nil, err
	}
	if len(roots) == 0 {
		return []ShareCommentWithReplies{}, nil
	}

	var rootIDs []string
	for _, r := range roots {
		rootIDs = append(rootIDs, r.ID)
	}

	counts, err := s.shares.CountRepliesByRootIDs(ctx, share.ID, rootIDs)
	if err != nil {
		return nil, err
	}

	var result []ShareCommentWithReplies
	for _, r := range roots {
		r.ReplyCount = counts[r.ID]
		node := ShareCommentWithReplies{
			ShareComment: r,
			Replies:      []model.ShareComment{}, // Do not lazy load by default
		}
		result = append(result, node)
	}

	return result, nil
}

func (s *DocumentService) ListShareCommentRepliesByToken(ctx context.Context, token, sharePassword string, rootID string, limit, offset int) ([]model.ShareComment, error) {
	share, err := s.resolveAccessibleShareByToken(ctx, token, sharePassword)
	if err != nil {
		return nil, err
	}

	// Verify the root comment exists and belongs to this share
	root, err := s.shares.GetCommentByID(ctx, rootID)
	if err != nil {
		return nil, err
	}
	if root.ShareID != share.ID {
		return nil, appErr.ErrNotFound
	}

	replies, err := s.shares.ListRepliesByRootID(ctx, share.ID, rootID, limit, offset)
	if err != nil {
		return nil, err
	}
	if replies == nil {
		return []model.ShareComment{}, nil
	}
	return replies, nil
}

func (s *DocumentService) CreateShareCommentByToken(ctx context.Context, input CreateShareCommentInput) (*model.ShareComment, error) {
	share, err := s.resolveAccessibleShareByToken(ctx, input.Token, input.Password)
	if err != nil {
		return nil, err
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

	rootID := ""
	replyToID := strings.TrimSpace(input.ReplyToID)
	if replyToID != "" {
		target, err := s.shares.GetCommentByID(ctx, replyToID)
		if err == nil && target.ShareID == share.ID {
			if target.RootID == "" {
				rootID = target.ID
			} else {
				rootID = target.RootID
			}
		} else {
			replyToID = ""
		}
	}

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
		return nil, err
	}
	return comment, nil
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

type DocumentUpdateInput struct {
	Title   string
	Content string
	TagIDs  []string
	Summary *string
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

func (s *DocumentService) Update(ctx context.Context, userID, docID string, input DocumentUpdateInput) error {
	now := timeutil.NowUnix()
	doc := &model.Document{
		ID:      docID,
		UserID:  userID,
		Title:   input.Title,
		Content: input.Content,
		Mtime:   now,
	}
	if err := s.docs.Update(ctx, doc); err != nil {
		return err
	}
	if input.Summary != nil {
		if err := s.summaries.Upsert(ctx, userID, docID, *input.Summary, now); err != nil {
			return err
		}
	}

	versionNumber := 1
	if latest, err := s.versions.GetLatestVersion(ctx, userID, docID); err == nil {
		versionNumber = latest + 1
	}
	version := &model.DocumentVersion{
		ID:         newID(),
		UserID:     userID,
		DocumentID: docID,
		Version:    versionNumber,
		Title:      input.Title,
		Content:    input.Content,
		Ctime:      now,
	}
	if err := s.versions.Create(ctx, version); err != nil {
		return err
	}
	if err := s.pruneVersions(ctx, userID, docID); err != nil {
		return err
	}
	if input.TagIDs != nil {
		if err := s.tags.DeleteByDoc(ctx, userID, docID); err != nil {
			return err
		}
		for _, tagID := range input.TagIDs {
			if err := s.tags.Add(ctx, &model.DocumentTag{UserID: userID, DocumentID: docID, TagID: tagID}); err != nil {
				return err
			}
		}
	}

	// Extract and update bidirectional links
	linkIDs := extractLinkIDs(input.Content)
	if err := s.docs.UpdateLinks(ctx, userID, docID, linkIDs, now); err != nil {
		return err
	}
	if s.assets != nil {
		if err := s.assets.SyncDocumentReferences(ctx, userID, docID, input.Content); err != nil {
			return err
		}
	}

	return nil
}

func (s *DocumentService) Create(ctx context.Context, userID string, input DocumentCreateInput) (*model.Document, error) {
	now := timeutil.NowUnix()
	doc := &model.Document{
		ID:      newID(),
		UserID:  userID,
		Title:   input.Title,
		Content: input.Content,
		State:   repo.DocumentStateNormal,
		Pinned:  0,
		Ctime:   now,
		Mtime:   now,
	}
	if err := s.docs.Create(ctx, doc); err != nil {
		return nil, err
	}
	if input.Summary != "" {
		if err := s.summaries.Upsert(ctx, userID, doc.ID, input.Summary, now); err != nil {
			return nil, err
		}
		doc.Summary = input.Summary
	}

	version := &model.DocumentVersion{
		ID:         newID(),
		UserID:     userID,
		DocumentID: doc.ID,
		Version:    1,
		Title:      doc.Title,
		Content:    doc.Content,
		Ctime:      now,
	}
	if err := s.versions.Create(ctx, version); err != nil {
		return nil, err
	}
	if err := s.pruneVersions(ctx, userID, doc.ID); err != nil {
		return nil, err
	}
	if input.TagIDs != nil {
		if err := s.tags.DeleteByDoc(ctx, userID, doc.ID); err != nil {
			return nil, err
		}
		for _, tagID := range input.TagIDs {
			if err := s.tags.Add(ctx, &model.DocumentTag{UserID: userID, DocumentID: doc.ID, TagID: tagID}); err != nil {
				return nil, err
			}
		}
	}

	// Extract and update bidirectional links
	linkIDs := extractLinkIDs(input.Content)
	if err := s.docs.UpdateLinks(ctx, userID, doc.ID, linkIDs, now); err != nil {
		return nil, err
	}
	if s.assets != nil {
		if err := s.assets.SyncDocumentReferences(ctx, userID, doc.ID, input.Content); err != nil {
			return nil, err
		}
	}

	return doc, nil
}

func (s *DocumentService) GetBacklinks(ctx context.Context, userID, docID string) ([]model.Document, error) {
	docs, err := s.docs.GetBacklinks(ctx, userID, docID)
	if err != nil {
		return nil, err
	}
	return s.attachSummaries(ctx, userID, docs)
}

func (s *DocumentService) ProcessPendingSummaries(ctx context.Context, delaySeconds int64) error {
	if s.ai == nil {
		return nil
	}
	if s.summaries == nil {
		return nil
	}
	logger := logutil.GetLogger(ctx)
	if delaySeconds < 0 {
		delaySeconds = 0
	}
	cutoff := time.Now().Unix() - delaySeconds
	docs, err := s.summaries.ListPendingDocuments(ctx, 50, cutoff)
	if err != nil {
		logger.Error("failed to list pending summaries", zap.Error(err))
		return err
	}
	if len(docs) == 0 {
		return nil
	}
	logger.Info("processing pending summaries", zap.Int("count", len(docs)))
	for _, doc := range docs {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		if utf8.RuneCountInString(doc.Content) < minSummaryChars {
			now := timeutil.NowUnix()
			if err := s.summaries.Upsert(ctx, doc.UserID, doc.ID, "", now); err != nil {
				logger.Error("failed to mark empty summary", zap.String("doc_id", doc.ID), zap.Error(err))
			}
			continue
		}
		summary, err := s.ai.Summarize(ctx, doc.Content)
		if err != nil {
			errMsg := strings.ToLower(err.Error())
			if strings.Contains(errMsg, "rate") || strings.Contains(errMsg, "limit") || strings.Contains(errMsg, "429") {
				logger.Warn("ai rate limit triggered, cooling down...", zap.Error(err))
				select {
				case <-ctx.Done():
					return ctx.Err()
				case <-time.After(10 * time.Second):
				}
				continue
			}
			logger.Error("failed to summarize document", zap.String("doc_id", doc.ID), zap.Error(err))
			continue
		}
		now := timeutil.NowUnix()
		if err := s.summaries.Upsert(ctx, doc.UserID, doc.ID, summary, now); err != nil {
			logger.Error("failed to save summary", zap.String("doc_id", doc.ID), zap.Error(err))
			continue
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(100 * time.Millisecond):
		}
	}
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
	if err == appErr.ErrNotFound {
		doc.Summary = ""
		return nil
	}
	return err
}

func (s *DocumentService) attachSummaries(ctx context.Context, userID string, docs []model.Document) ([]model.Document, error) {
	if len(docs) == 0 {
		return docs, nil
	}
	ids := make([]string, 0, len(docs))
	for _, doc := range docs {
		ids = append(ids, doc.ID)
	}
	summaries, err := s.summaries.ListByDocIDs(ctx, userID, ids)
	if err != nil {
		return nil, err
	}
	for i := range docs {
		docs[i].Summary = summaries[docs[i].ID]
	}
	return docs, nil
}
