package service

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/pkg/dochash"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/timeutil"
	"github.com/xxxsen/mnote/internal/repo"
)

// computeDocumentHash is a thin alias over dochash.Compute kept so that
// existing call sites and tests within this package read naturally. The
// canonical implementation now lives in internal/pkg/dochash, shared with
// the embedding worker and the 008 backfill migration.
func computeDocumentHash(title, content string) string {
	return dochash.Compute(title, content)
}

func (s *DocumentService) UpdateTags(ctx context.Context, userID, docID string, tagIDs []string) error {
	return s.runInTx(ctx, func(txCtx context.Context) error {
		if _, err := s.docs.GetByIDForUpdate(txCtx, userID, docID); err != nil {
			return fmt.Errorf("lock document: %w", err)
		}
		return s.applyTagChanges(txCtx, userID, docID, tagIDs)
	})
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
		if s.embedding != nil {
			if err := s.embedding.DeleteEmbeddingData(txCtx, userID, docID); err != nil {
				return fmt.Errorf("delete embedding data: %w", err)
			}
		}
		return nil
	})
}

type DocumentCreateInput struct {
	Title   string
	Content string
	TagIDs  []string
}

// DocumentUpdateInput is shared by HTTP editor saves and trusted internal
// writes. HTTP supplies BaseRevision for optimistic locking; internal callers
// leave it at zero and rely on the row lock plus server-side revision bump.
type DocumentUpdateInput struct {
	Title        string
	Content      string
	TagIDs       []string
	BaseRevision int64
	// SaveSeq remains for rolling compatibility with pre-base-revision callers.
	// BaseRevision-aware HTTP requests never use it for conflict detection.
	SaveSeq int64
}

func (s *DocumentService) validateDocumentInput(title, content string, tagIDs []string) error {
	if strings.TrimSpace(title) == "" ||
		utf8.RuneCountInString(title) > 200 ||
		len([]byte(content)) > s.runtime.Limits.MaxDocumentBytes ||
		len(uniqueStringSlice(tagIDs)) > 100 {
		return appErr.ErrInvalid
	}
	return nil
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

// Save executes one atomic transaction under a document row lock. A positive
// BaseRevision must equal the locked ContentRevision; mismatch returns a
// revision conflict without writes. Accepted base-aware saves use current+1.
// The SaveSeq-only branch exists solely for rolling compatibility.
func (
	s *DocumentService) Save(ctx context.Context,
	userID,
	docID string,
	input DocumentUpdateInput) (*model.SaveDocumentResult,
	error,
) {
	if err := s.validateDocumentInput(input.Title, input.Content, input.TagIDs); err != nil {
		return nil, err
	}
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
// into small helpers so each step (lock+revision check, document update, version
// snapshot, tag refresh, references) is independently readable and the
// orchestrator stays well below the gocyclo threshold.
func (
	s *DocumentService) saveImpl(ctx context.Context,
	userID,
	docID string,
	input DocumentUpdateInput) (*model.SaveDocumentResult,
	error,
) {
	current, err := s.lockForSave(ctx, userID, docID)
	if err != nil {
		return nil, err
	}
	if input.BaseRevision > 0 && input.BaseRevision != current.ContentRevision {
		return &model.SaveDocumentResult{
			ID: current.ID, Accepted: false,
			Reason:          model.SaveRejectReasonRevisionConflict,
			ContentRevision: current.ContentRevision,
			ContentHash:     current.ContentHash, ContentMtime: current.ContentMtime, Mtime: current.Mtime,
		}, nil
	}
	if input.BaseRevision == 0 && input.SaveSeq != 0 && input.SaveSeq <= current.ContentRevision {
		return &model.SaveDocumentResult{
			ID:              current.ID,
			Accepted:        false,
			ContentRevision: current.ContentRevision,
			ContentHash:     current.ContentHash,
			ContentMtime:    current.ContentMtime,
			Mtime:           current.Mtime,
		}, nil
	}
	now := timeutil.NowUnix()
	newRevision := current.ContentRevision + 1
	if input.BaseRevision == 0 && input.SaveSeq > 0 {
		newRevision = input.SaveSeq
	}
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
	if err := s.refreshReferences(
		ctx,
		userID,
		docID,
		input.Content,
		now,
		newRevision,
		newHash,
	); err != nil {
		return nil, err
	}
	return &model.SaveDocumentResult{
		ID:              docID,
		Accepted:        true,
		ContentRevision: newRevision,
		ContentHash:     newHash,
		ContentMtime:    now,
		Mtime:           now,
	}, nil
}

// lockForSave returns the row under a write lock so base-revision comparison
// and the eventual write observe one serial state. A rejected branch exits
// before any version or derived relation is modified.
func (s *DocumentService) lockForSave(
	ctx context.Context, userID, docID string,
) (*model.Document, error) {
	current, err := s.docs.GetByIDForUpdate(ctx, userID, docID)
	if err != nil {
		return nil, fmt.Errorf("lock document: %w", err)
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
	return nil
}

func (s *DocumentService) recordVersion(
	ctx context.Context,
	userID, docID string,
	input DocumentUpdateInput,
	now, newRevision int64,
) error {
	versionID, err := s.runtime.IDs.ID()
	if err != nil {
		return fmt.Errorf("generate version id: %w", err)
	}
	version := &model.DocumentVersion{
		ID: versionID, UserID: userID, DocumentID: docID,
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
	ownedIDs, err := s.ValidateOwnedTagIDs(ctx, userID, tagIDs)
	if err != nil {
		return err
	}
	if err := s.tags.DeleteByDoc(ctx, userID, docID); err != nil {
		return fmt.Errorf("delete by doc: %w", err)
	}
	for _, tagID := range ownedIDs {
		dt := &model.DocumentTag{UserID: userID, DocumentID: docID, TagID: tagID}
		if err := s.tags.Add(ctx, dt); err != nil {
			return fmt.Errorf("add: %w", err)
		}
	}
	return nil
}

func (s *DocumentService) ValidateOwnedTagIDs(
	ctx context.Context, userID string, ids []string,
) ([]string, error) {
	unique := uniqueStringSlice(ids)
	if len(unique) == 0 {
		return []string{}, nil
	}
	items, err := s.tagRepo.ListByIDs(ctx, userID, unique)
	if err != nil {
		return nil, fmt.Errorf("validate owned tag ids: %w", err)
	}
	owned := make(map[string]struct{}, len(items))
	for _, item := range items {
		owned[item.ID] = struct{}{}
	}
	if len(owned) != len(unique) {
		return nil, appErr.ErrInvalid
	}
	for _, id := range unique {
		if _, ok := owned[id]; !ok {
			return nil, appErr.ErrInvalid
		}
	}
	return unique, nil
}

func (s *DocumentService) refreshReferences(
	ctx context.Context,
	userID, docID, content string,
	now, revision int64,
	newHash string,
) error {
	linkIDs, err := s.validateOwnedLinkIDs(ctx, userID, docID, extractLinkIDs(content))
	if err != nil {
		return err
	}
	if err := s.docs.UpdateLinks(ctx, userID, docID, linkIDs, now); err != nil {
		return fmt.Errorf("update links: %w", err)
	}
	if s.assets != nil {
		if err := s.assets.SyncDocumentReferences(ctx, userID, docID, content); err != nil {
			return fmt.Errorf("sync document references: %w", err)
		}
	}
	if s.embedding != nil {
		if err := s.embedding.EnqueueContentChange(
			ctx,
			userID,
			docID,
			newHash,
			revision,
			now,
		); err != nil {
			return fmt.Errorf("mark embedding pending: %w", err)
		}
	}
	return nil
}

func (s *DocumentService) validateOwnedLinkIDs(
	ctx context.Context, userID, sourceID string, ids []string,
) ([]string, error) {
	unique := uniqueStringSlice(ids)
	filtered := make([]string, 0, len(unique))
	for _, id := range unique {
		if id != sourceID {
			filtered = append(filtered, id)
		}
	}
	if len(filtered) == 0 {
		return []string{}, nil
	}
	documents, err := s.docs.ListByIDs(ctx, userID, filtered)
	if err != nil {
		return nil, fmt.Errorf("validate document links: %w", err)
	}
	owned := make(map[string]struct{}, len(documents))
	for _, document := range documents {
		owned[document.ID] = struct{}{}
	}
	result := make([]string, 0, len(filtered))
	for _, id := range filtered {
		if _, ok := owned[id]; ok {
			result = append(result, id)
		}
	}
	return result, nil
}

func (
	s *DocumentService) Create(ctx context.Context,
	userID string,
	input DocumentCreateInput) (*model.Document,
	error,
) {
	if err := s.validateDocumentInput(input.Title, input.Content, input.TagIDs); err != nil {
		return nil, err
	}
	documentID, err := s.runtime.IDs.ID()
	if err != nil {
		return nil, fmt.Errorf("generate document id: %w", err)
	}
	now := timeutil.NowUnix()
	doc := &model.Document{
		ID: documentID, UserID: userID, Title: input.Title,
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
	versionID, err := s.runtime.IDs.ID()
	if err != nil {
		return fmt.Errorf("generate version id: %w", err)
	}
	version := &model.DocumentVersion{
		ID: versionID, UserID: userID, DocumentID: doc.ID,
		Version: 1, Title: doc.Title, Content: doc.Content, Ctime: doc.Mtime,
	}
	if err := s.versions.Create(ctx, version); err != nil {
		return fmt.Errorf("create version: %w", err)
	}
	if err := s.pruneVersions(ctx, userID, doc.ID); err != nil {
		return fmt.Errorf("prune versions: %w", err)
	}
	if err := s.applyTagChanges(ctx, userID, doc.ID, input.TagIDs); err != nil {
		return err
	}
	linkIDs, err := s.validateOwnedLinkIDs(ctx, userID, doc.ID, extractLinkIDs(input.Content))
	if err != nil {
		return err
	}
	if err := s.docs.UpdateLinks(ctx, userID, doc.ID, linkIDs, doc.Mtime); err != nil {
		return fmt.Errorf("update links: %w", err)
	}
	if s.assets != nil {
		if err := s.assets.SyncDocumentReferences(ctx, userID, doc.ID, input.Content); err != nil {
			return fmt.Errorf("sync document references: %w", err)
		}
	}
	if s.embedding != nil {
		if err := s.embedding.EnqueueContentChange(
			ctx,
			userID,
			doc.ID,
			doc.ContentHash,
			doc.ContentRevision,
			doc.Mtime,
		); err != nil {
			return fmt.Errorf("mark embedding pending: %w", err)
		}
	}
	return nil
}
