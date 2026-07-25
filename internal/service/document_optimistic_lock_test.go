package service

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
)

func TestDocumentServiceSaveRejectsRevisionConflictWithoutWrites(t *testing.T) {
	var documentUpdated bool
	var versionCreated bool
	var linksUpdated bool
	var tagsDeleted bool
	var tagAdded bool
	docs := &mockDocumentRepo{
		getByIDForUpdateFn: func(context.Context, string, string) (*model.Document, error) {
			return &model.Document{
				ID:              "d1",
				UserID:          "u1",
				Title:           "Server title",
				Content:         "Server body",
				ContentRevision: 9,
				ContentHash:     "server-hash",
				ContentMtime:    1234,
				Mtime:           1234,
			}, nil
		},
		updateFn: func(context.Context, *model.Document) error {
			documentUpdated = true
			return nil
		},
		updateLinksFn: func(context.Context, string, string, []string, int64) error {
			linksUpdated = true
			return nil
		},
	}
	tags := &mockDocumentTagRepo{
		deleteByDocFn: func(context.Context, string, string) error {
			tagsDeleted = true
			return nil
		},
		addFn: func(context.Context, *model.DocumentTag) error {
			tagAdded = true
			return nil
		},
	}
	versions := &mockVersionRepo{
		createFn: func(context.Context, *model.DocumentVersion) error {
			versionCreated = true
			return nil
		},
	}
	svc := newDocSvc(docs, versions, tags, nil)
	assets := &stubAssetSyncer{}
	embeddingClient := &stubEmbeddingClient{}
	svc.assets = assets
	svc.embedding = embeddingClient

	result, err := svc.Save(context.Background(), "u1", "d1", DocumentUpdateInput{
		Title:        "Local",
		Content:      "Local body",
		BaseRevision: 8,
		SaveSeq:      99,
		TagIDs:       []string{"t1"},
	})
	require.NoError(t, err)
	require.NotNil(t, result)
	assert.False(t, result.Accepted)
	assert.Equal(t, model.SaveRejectReasonRevisionConflict, result.Reason)
	assert.Equal(t, int64(9), result.ContentRevision)
	assert.Equal(t, "server-hash", result.ContentHash)
	assert.False(t, documentUpdated)
	assert.False(t, versionCreated)
	assert.False(t, linksUpdated)
	assert.False(t, tagsDeleted)
	assert.False(t, tagAdded)
	assert.False(t, assets.synced)
	assert.False(t, embeddingClient.marked)
}

func TestDocumentServiceSaveMatchingRevisionUsesServerNextRevision(t *testing.T) {
	var saved *model.Document
	var version *model.DocumentVersion
	docs := &mockDocumentRepo{
		getByIDForUpdateFn: func(context.Context, string, string) (*model.Document, error) {
			return &model.Document{
				ID:              "d1",
				UserID:          "u1",
				Title:           "Old",
				Content:         "Old body",
				ContentRevision: 4,
				ContentHash:     "old-hash",
			}, nil
		},
		updateFn: func(_ context.Context, doc *model.Document) error {
			saved = doc
			return nil
		},
		updateLinksFn: func(context.Context, string, string, []string, int64) error {
			return nil
		},
	}
	versions := &mockVersionRepo{
		createFn: func(_ context.Context, item *model.DocumentVersion) error {
			version = item
			return nil
		},
		deleteOldVersionsFn: func(context.Context, string, string, int) error {
			return nil
		},
	}
	svc := newDocSvc(docs, versions, nil, nil)

	result, err := svc.Save(context.Background(), "u1", "d1", DocumentUpdateInput{
		Title:        "New",
		Content:      "New body",
		BaseRevision: 4,
		SaveSeq:      99,
	})
	require.NoError(t, err)
	require.NotNil(t, result)
	assert.True(t, result.Accepted)
	assert.Empty(t, result.Reason)
	assert.Equal(t, int64(5), result.ContentRevision)
	require.NotNil(t, saved)
	assert.Equal(t, int64(5), saved.ContentRevision)
	require.NotNil(t, version)
	assert.Equal(t, 5, version.Version)
}
