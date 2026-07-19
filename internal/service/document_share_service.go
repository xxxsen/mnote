package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/password"
	"github.com/xxxsen/mnote/internal/pkg/timeutil"
	"github.com/xxxsen/mnote/internal/repo"
)

type PublicShareDetail struct {
	Document      *model.Document `json:"document"`
	Author        string          `json:"author"`
	Tags          []model.Tag     `json:"tags"`
	Permission    int             `json:"permission"`
	AllowDownload int             `json:"allow_download"`
	ExpiresAt     int64           `json:"expires_at"`
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

func (s *DocumentService) CreateShare(ctx context.Context, userID, docID string) (*model.Share, error) {
	shareID, err := s.runtime.IDs.ID()
	if err != nil {
		return nil, fmt.Errorf("generate share id: %w", err)
	}
	token, err := s.runtime.IDs.Token(20)
	if err != nil {
		return nil, fmt.Errorf("generate share token: %w", err)
	}
	now := timeutil.NowUnix()
	share := &model.Share{
		ID: shareID, UserID: userID, DocumentID: docID,
		Token: token, State: repo.ShareStateActive,
		ExpiresAt: 0, Permission: repo.SharePermissionView,
		AllowDownload: 1, Ctime: now, Mtime: now,
	}
	if err := s.runInTx(ctx, func(txCtx context.Context) error {
		if _, err := s.docs.GetByIDForUpdate(txCtx, userID, docID); err != nil {
			return fmt.Errorf("lock document: %w", err)
		}
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
		return share, nil
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

	rootID, replyToID, err := s.resolveCommentThread(
		ctx, share.ID, strings.TrimSpace(input.ReplyToID),
	)
	if err != nil {
		return nil, err
	}

	commentID, err := s.runtime.IDs.ID()
	if err != nil {
		return nil, fmt.Errorf("generate comment id: %w", err)
	}
	now := timeutil.NowUnix()
	comment := &model.ShareComment{
		ID:         commentID,
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
) (string, string, error) {
	if replyToID == "" {
		return "", "", nil
	}
	target, err := s.shares.GetCommentByID(ctx, replyToID)
	if err != nil {
		if errors.Is(err, appErr.ErrNotFound) {
			return "", "", appErr.ErrNotFound
		}
		return "", "", fmt.Errorf("get reply target: %w", err)
	}
	if target.ShareID != shareID {
		return "", "", appErr.ErrNotFound
	}
	if target.RootID == "" {
		return target.ID, replyToID, nil
	}
	return target.RootID, replyToID, nil
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
