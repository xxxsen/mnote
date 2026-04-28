package service

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/repo"
)

type mockAssetRepo struct {
	upsertByFileKeyFn func(ctx context.Context, asset *model.Asset) error
	listByUserFn      func(ctx context.Context, userID, query string, limit, offset uint) ([]model.Asset, error)
	getByIDFn         func(ctx context.Context, userID, assetID string) (*model.Asset, error)
	listByFileKeysFn  func(ctx context.Context, userID string, fileKeys []string) ([]model.Asset, error)
	listByURLsFn      func(ctx context.Context, userID string, urls []string) ([]model.Asset, error)
}

func (m *mockAssetRepo) UpsertByFileKey(ctx context.Context, asset *model.Asset) error {
	return m.upsertByFileKeyFn(ctx, asset)
}

func (m *mockAssetRepo) ListByUser(ctx context.Context, userID, query string, limit, offset uint) ([]model.Asset, error) {
	return m.listByUserFn(ctx, userID, query, limit, offset)
}

func (m *mockAssetRepo) GetByID(ctx context.Context, userID, assetID string) (*model.Asset, error) {
	return m.getByIDFn(ctx, userID, assetID)
}

func (m *mockAssetRepo) ListByFileKeys(ctx context.Context, userID string, fileKeys []string) ([]model.Asset, error) {
	return m.listByFileKeysFn(ctx, userID, fileKeys)
}

func (m *mockAssetRepo) ListByURLs(ctx context.Context, userID string, urls []string) ([]model.Asset, error) {
	return m.listByURLsFn(ctx, userID, urls)
}

type mockDocumentAssetRepo struct {
	replaceByDocumentFn func(ctx context.Context, userID, docID string, assetIDs []string, now int64) error
	deleteByDocumentFn  func(ctx context.Context, userID, docID string) error
	countByAssetsFn     func(ctx context.Context, userID string, assetIDs []string) (map[string]int, error)
	listReferencesFn    func(ctx context.Context, userID, assetID string) ([]repo.DocumentAssetReference, error)
}

func (m *mockDocumentAssetRepo) ReplaceByDocument(ctx context.Context, userID, docID string, assetIDs []string, now int64) error {
	return m.replaceByDocumentFn(ctx, userID, docID, assetIDs, now)
}

func (m *mockDocumentAssetRepo) DeleteByDocument(ctx context.Context, userID, docID string) error {
	return m.deleteByDocumentFn(ctx, userID, docID)
}

func (m *mockDocumentAssetRepo) CountByAssets(ctx context.Context, userID string, assetIDs []string) (map[string]int, error) {
	return m.countByAssetsFn(ctx, userID, assetIDs)
}

func (m *mockDocumentAssetRepo) ListReferences(ctx context.Context, userID, assetID string) ([]repo.DocumentAssetReference, error) {
	return m.listReferencesFn(ctx, userID, assetID)
}

func TestAssetService_RecordUpload(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		assets := &mockAssetRepo{
			upsertByFileKeyFn: func(_ context.Context, asset *model.Asset) error {
				assert.Equal(t, "u1", asset.UserID)
				assert.Equal(t, "fk1", asset.FileKey)
				return nil
			},
		}
		svc := NewAssetService(assets, nil)
		err := svc.RecordUpload(context.Background(), "u1", "fk1", "http://url", "file.png", "image/png", 1024)
		require.NoError(t, err)
	})

	t.Run("empty_user_id", func(t *testing.T) {
		svc := NewAssetService(&mockAssetRepo{}, nil)
		err := svc.RecordUpload(context.Background(), "", "fk1", "", "", "", 0)
		require.NoError(t, err)
	})

	t.Run("empty_file_key", func(t *testing.T) {
		svc := NewAssetService(&mockAssetRepo{}, nil)
		err := svc.RecordUpload(context.Background(), "u1", "", "", "", "", 0)
		require.NoError(t, err)
	})

	t.Run("repo_error", func(t *testing.T) {
		assets := &mockAssetRepo{
			upsertByFileKeyFn: func(context.Context, *model.Asset) error {
				return errors.New("db error")
			},
		}
		svc := NewAssetService(assets, nil)
		err := svc.RecordUpload(context.Background(), "u1", "fk1", "", "", "", 0)
		assert.Error(t, err)
	})
}

func TestAssetService_List(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		assets := &mockAssetRepo{
			listByUserFn: func(context.Context, string, string, uint, uint) ([]model.Asset, error) {
				return []model.Asset{{ID: "a1"}, {ID: "a2"}}, nil
			},
		}
		docAssets := &mockDocumentAssetRepo{
			countByAssetsFn: func(_ context.Context, _ string, _ []string) (map[string]int, error) {
				return map[string]int{"a1": 3, "a2": 0}, nil
			},
		}
		svc := NewAssetService(assets, docAssets)
		result, err := svc.List(context.Background(), "u1", "", 10, 0)
		require.NoError(t, err)
		assert.Len(t, result, 2)
		assert.Equal(t, 3, result[0].RefCount)
		assert.Equal(t, 0, result[1].RefCount)
	})

	t.Run("list_error", func(t *testing.T) {
		assets := &mockAssetRepo{
			listByUserFn: func(context.Context, string, string, uint, uint) ([]model.Asset, error) {
				return nil, errors.New("db error")
			},
		}
		svc := NewAssetService(assets, &mockDocumentAssetRepo{})
		_, err := svc.List(context.Background(), "u1", "", 10, 0)
		assert.Error(t, err)
	})

	t.Run("count_error", func(t *testing.T) {
		assets := &mockAssetRepo{
			listByUserFn: func(context.Context, string, string, uint, uint) ([]model.Asset, error) {
				return []model.Asset{{ID: "a1"}}, nil
			},
		}
		docAssets := &mockDocumentAssetRepo{
			countByAssetsFn: func(context.Context, string, []string) (map[string]int, error) {
				return nil, errors.New("db error")
			},
		}
		svc := NewAssetService(assets, docAssets)
		_, err := svc.List(context.Background(), "u1", "", 10, 0)
		assert.Error(t, err)
	})
}

func TestAssetService_ListReferences(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		assets := &mockAssetRepo{
			getByIDFn: func(context.Context, string, string) (*model.Asset, error) {
				return &model.Asset{ID: "a1"}, nil
			},
		}
		docAssets := &mockDocumentAssetRepo{
			listReferencesFn: func(context.Context, string, string) ([]repo.DocumentAssetReference, error) {
				return []repo.DocumentAssetReference{{DocumentID: "d1", Title: "Note 1", Mtime: 1000}}, nil
			},
		}
		svc := NewAssetService(assets, docAssets)
		result, err := svc.ListReferences(context.Background(), "u1", "a1")
		require.NoError(t, err)
		assert.Len(t, result, 1)
		assert.Equal(t, "d1", result[0].DocumentID)
	})

	t.Run("asset_not_found", func(t *testing.T) {
		assets := &mockAssetRepo{
			getByIDFn: func(context.Context, string, string) (*model.Asset, error) {
				return nil, errors.New("not found")
			},
		}
		svc := NewAssetService(assets, &mockDocumentAssetRepo{})
		_, err := svc.ListReferences(context.Background(), "u1", "a1")
		assert.Error(t, err)
	})
}

func TestAssetService_SyncDocumentReferences(t *testing.T) {
	t.Run("no_refs_clears", func(t *testing.T) {
		replaced := false
		docAssets := &mockDocumentAssetRepo{
			replaceByDocumentFn: func(_ context.Context, _, _ string, ids []string, _ int64) error {
				replaced = true
				assert.Empty(t, ids)
				return nil
			},
		}
		svc := NewAssetService(&mockAssetRepo{}, docAssets)
		err := svc.SyncDocumentReferences(context.Background(), "u1", "d1", "plain text no urls")
		require.NoError(t, err)
		assert.True(t, replaced)
	})

	t.Run("with_file_keys", func(t *testing.T) {
		assets := &mockAssetRepo{
			listByFileKeysFn: func(_ context.Context, _ string, keys []string) ([]model.Asset, error) {
				assert.Contains(t, keys, "abc123")
				return []model.Asset{{ID: "a1"}}, nil
			},
			listByURLsFn: func(context.Context, string, []string) ([]model.Asset, error) {
				return nil, nil
			},
		}
		docAssets := &mockDocumentAssetRepo{
			replaceByDocumentFn: func(_ context.Context, _, _ string, ids []string, _ int64) error {
				assert.Equal(t, []string{"a1"}, ids)
				return nil
			},
		}
		svc := NewAssetService(assets, docAssets)
		content := "check out /api/v1/files/abc123 and http://example.com/image.png"
		err := svc.SyncDocumentReferences(context.Background(), "u1", "d1", content)
		require.NoError(t, err)
	})

	t.Run("nil_service", func(t *testing.T) {
		var svc *AssetService
		err := svc.SyncDocumentReferences(context.Background(), "u1", "d1", "text")
		require.NoError(t, err)
	})

	t.Run("clear_replace_error", func(t *testing.T) {
		docAssets := &mockDocumentAssetRepo{
			replaceByDocumentFn: func(context.Context, string, string, []string, int64) error {
				return errors.New("db error")
			},
		}
		svc := NewAssetService(&mockAssetRepo{}, docAssets)
		err := svc.SyncDocumentReferences(context.Background(), "u1", "d1", "no refs here")
		assert.Error(t, err)
	})

	t.Run("file_keys_error", func(t *testing.T) {
		assets := &mockAssetRepo{
			listByFileKeysFn: func(context.Context, string, []string) ([]model.Asset, error) {
				return nil, errors.New("db error")
			},
		}
		svc := NewAssetService(assets, &mockDocumentAssetRepo{})
		err := svc.SyncDocumentReferences(context.Background(), "u1", "d1", "ref /api/v1/files/abc123")
		assert.Error(t, err)
	})

	t.Run("urls_error", func(t *testing.T) {
		assets := &mockAssetRepo{
			listByFileKeysFn: func(context.Context, string, []string) ([]model.Asset, error) {
				return nil, nil
			},
			listByURLsFn: func(context.Context, string, []string) ([]model.Asset, error) {
				return nil, errors.New("db error")
			},
		}
		svc := NewAssetService(assets, &mockDocumentAssetRepo{})
		err := svc.SyncDocumentReferences(context.Background(), "u1", "d1",
			"/api/v1/files/abc123 https://example.com/img.png")
		assert.Error(t, err)
	})

	t.Run("replace_error", func(t *testing.T) {
		assets := &mockAssetRepo{
			listByFileKeysFn: func(context.Context, string, []string) ([]model.Asset, error) {
				return []model.Asset{{ID: "a1"}}, nil
			},
			listByURLsFn: func(context.Context, string, []string) ([]model.Asset, error) {
				return nil, nil
			},
		}
		docAssets := &mockDocumentAssetRepo{
			replaceByDocumentFn: func(context.Context, string, string, []string, int64) error {
				return errors.New("db error")
			},
		}
		svc := NewAssetService(assets, docAssets)
		err := svc.SyncDocumentReferences(context.Background(), "u1", "d1",
			"/api/v1/files/abc123 https://example.com/img.png")
		assert.Error(t, err)
	})

	t.Run("dedup_asset_ids", func(t *testing.T) {
		assets := &mockAssetRepo{
			listByFileKeysFn: func(context.Context, string, []string) ([]model.Asset, error) {
				return []model.Asset{{ID: "a1"}}, nil
			},
			listByURLsFn: func(context.Context, string, []string) ([]model.Asset, error) {
				return []model.Asset{{ID: "a1"}}, nil
			},
		}
		var replacedIDs []string
		docAssets := &mockDocumentAssetRepo{
			replaceByDocumentFn: func(_ context.Context, _, _ string, ids []string, _ int64) error {
				replacedIDs = ids
				return nil
			},
		}
		svc := NewAssetService(assets, docAssets)
		err := svc.SyncDocumentReferences(context.Background(), "u1", "d1",
			"/api/v1/files/abc123 https://example.com/img.png")
		require.NoError(t, err)
		assert.Len(t, replacedIDs, 1)
	})
}

func TestAssetService_ListReferences_ListError(t *testing.T) {
	assets := &mockAssetRepo{
		getByIDFn: func(context.Context, string, string) (*model.Asset, error) {
			return &model.Asset{ID: "a1"}, nil
		},
	}
	docAssets := &mockDocumentAssetRepo{
		listReferencesFn: func(context.Context, string, string) ([]repo.DocumentAssetReference, error) {
			return nil, errors.New("db error")
		},
	}
	svc := NewAssetService(assets, docAssets)
	_, err := svc.ListReferences(context.Background(), "u1", "a1")
	assert.Error(t, err)
}

func TestAssetService_RemoveDocumentReferences(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		docAssets := &mockDocumentAssetRepo{
			deleteByDocumentFn: func(_ context.Context, userID, docID string) error {
				assert.Equal(t, "u1", userID)
				assert.Equal(t, "d1", docID)
				return nil
			},
		}
		svc := NewAssetService(&mockAssetRepo{}, docAssets)
		err := svc.RemoveDocumentReferences(context.Background(), "u1", "d1")
		require.NoError(t, err)
	})

	t.Run("nil_service", func(t *testing.T) {
		var svc *AssetService
		err := svc.RemoveDocumentReferences(context.Background(), "u1", "d1")
		require.NoError(t, err)
	})

	t.Run("repo_error", func(t *testing.T) {
		docAssets := &mockDocumentAssetRepo{
			deleteByDocumentFn: func(context.Context, string, string) error {
				return errors.New("db error")
			},
		}
		svc := NewAssetService(&mockAssetRepo{}, docAssets)
		err := svc.RemoveDocumentReferences(context.Background(), "u1", "d1")
		assert.Error(t, err)
	})
}
