package service

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/password"
	"github.com/xxxsen/mnote/internal/repo"
)

func newDocSvc(
	docs documentRepo,
	summaries documentSummaryRepo,
	versions versionRepo,
	tags documentTagRepo,
	shares shareRepo,
) *DocumentService {
	return NewDocumentService(nil, docs, summaries, versions, tags, shares, &mockTagRepo{}, &mockUserRepo{}, nil, 10)
}

func noopSummaryRepo() *mockDocumentSummaryRepo {
	return &mockDocumentSummaryRepo{
		getByDocIDFn: func(context.Context, string, string) (string, error) {
			return "", appErr.ErrNotFound
		},
		listByDocIDsFn: func(context.Context, string, []string) (map[string]string, error) {
			return map[string]string{}, nil
		},
	}
}

func TestDocumentService_Search(t *testing.T) {
	t.Run("list_no_query", func(t *testing.T) {
		docs := &mockDocumentRepo{
			listFn: func(context.Context, string, *int, uint, uint, string) ([]model.Document, error) {
				return []model.Document{{ID: "d1"}}, nil
			},
		}
		svc := newDocSvc(docs, noopSummaryRepo(), nil, nil, nil)
		result, err := svc.Search(context.Background(), "u1", "", "", nil, 10, 0, "")
		require.NoError(t, err)
		assert.Len(t, result, 1)
	})

	t.Run("search_with_query", func(t *testing.T) {
		docs := &mockDocumentRepo{
			searchLikeFn: func(_ context.Context, _, query, _ string, _ *int, _, _ uint, _ string) ([]model.Document, error) {
				assert.Equal(t, "golang", query)
				return []model.Document{{ID: "d1"}}, nil
			},
		}
		svc := newDocSvc(docs, noopSummaryRepo(), nil, nil, nil)
		result, err := svc.Search(context.Background(), "u1", "golang", "", nil, 10, 0, "")
		require.NoError(t, err)
		assert.Len(t, result, 1)
	})

	t.Run("list_error", func(t *testing.T) {
		docs := &mockDocumentRepo{
			listFn: func(context.Context, string, *int, uint, uint, string) ([]model.Document, error) {
				return nil, errors.New("db error")
			},
		}
		svc := newDocSvc(docs, noopSummaryRepo(), nil, nil, nil)
		_, err := svc.Search(context.Background(), "u1", "", "", nil, 10, 0, "")
		assert.Error(t, err)
	})
}

func TestDocumentService_Get(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		docs := &mockDocumentRepo{
			getByIDFn: func(context.Context, string, string) (*model.Document, error) {
				return &model.Document{ID: "d1", Title: "Test"}, nil
			},
		}
		svc := newDocSvc(docs, noopSummaryRepo(), nil, nil, nil)
		doc, err := svc.Get(context.Background(), "u1", "d1")
		require.NoError(t, err)
		assert.Equal(t, "Test", doc.Title)
	})

	t.Run("not_found", func(t *testing.T) {
		docs := &mockDocumentRepo{
			getByIDFn: func(context.Context, string, string) (*model.Document, error) {
				return nil, appErr.ErrNotFound
			},
		}
		svc := newDocSvc(docs, noopSummaryRepo(), nil, nil, nil)
		_, err := svc.Get(context.Background(), "u1", "d1")
		assert.Error(t, err)
	})
}

func TestDocumentService_GetByTitle(t *testing.T) {
	docs := &mockDocumentRepo{
		getByTitleFn: func(context.Context, string, string) (*model.Document, error) {
			return &model.Document{ID: "d1", Title: "My Note"}, nil
		},
	}
	svc := newDocSvc(docs, noopSummaryRepo(), nil, nil, nil)
	doc, err := svc.GetByTitle(context.Background(), "u1", "My Note")
	require.NoError(t, err)
	assert.Equal(t, "d1", doc.ID)
}

func TestDocumentService_UpdateTags(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		docs := &mockDocumentRepo{
			getByIDFn: func(context.Context, string, string) (*model.Document, error) {
				return &model.Document{ID: "d1"}, nil
			},
		}
		addedTags := make([]string, 0)
		tags := &mockDocumentTagRepo{
			deleteByDocFn: func(context.Context, string, string) error { return nil },
			addFn: func(_ context.Context, dt *model.DocumentTag) error {
				addedTags = append(addedTags, dt.TagID)
				return nil
			},
		}
		svc := newDocSvc(docs, noopSummaryRepo(), nil, tags, nil)
		err := svc.UpdateTags(context.Background(), "u1", "d1", []string{"t1", "t2"})
		require.NoError(t, err)
		assert.Equal(t, []string{"t1", "t2"}, addedTags)
	})

	t.Run("doc_not_found", func(t *testing.T) {
		docs := &mockDocumentRepo{
			getByIDFn: func(context.Context, string, string) (*model.Document, error) {
				return nil, appErr.ErrNotFound
			},
		}
		svc := newDocSvc(docs, nil, nil, nil, nil)
		err := svc.UpdateTags(context.Background(), "u1", "d1", []string{"t1"})
		assert.Error(t, err)
	})
}

func TestDocumentService_UpdateSummary(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		docs := &mockDocumentRepo{
			getByIDFn:    func(context.Context, string, string) (*model.Document, error) { return &model.Document{ID: "d1"}, nil },
			touchMtimeFn: func(context.Context, string, string, int64) error { return nil },
		}
		summaries := &mockDocumentSummaryRepo{
			upsertFn: func(_ context.Context, _, _, summary string, _ int64) error {
				assert.Equal(t, "Test summary", summary)
				return nil
			},
		}
		svc := newDocSvc(docs, summaries, nil, nil, nil)
		err := svc.UpdateSummary(context.Background(), "u1", "d1", "Test summary")
		require.NoError(t, err)
	})
}

func TestDocumentService_UpdatePinned(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		docs := &mockDocumentRepo{
			updatePinnedFn: func(context.Context, string, string, int) error { return nil },
		}
		svc := newDocSvc(docs, nil, nil, nil, nil)
		err := svc.UpdatePinned(context.Background(), "u1", "d1", 1)
		require.NoError(t, err)
	})

	t.Run("invalid", func(t *testing.T) {
		svc := newDocSvc(nil, nil, nil, nil, nil)
		err := svc.UpdatePinned(context.Background(), "u1", "d1", 2)
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})
}

func TestDocumentService_UpdateStarred(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		docs := &mockDocumentRepo{
			updateStarredFn: func(context.Context, string, string, int) error { return nil },
		}
		svc := newDocSvc(docs, nil, nil, nil, nil)
		err := svc.UpdateStarred(context.Background(), "u1", "d1", 1)
		require.NoError(t, err)
	})

	t.Run("invalid", func(t *testing.T) {
		svc := newDocSvc(nil, nil, nil, nil, nil)
		err := svc.UpdateStarred(context.Background(), "u1", "d1", -1)
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})
}

func TestDocumentService_Delete(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		docs := &mockDocumentRepo{
			deleteFn: func(context.Context, string, string, int64) error { return nil },
		}
		shares := &mockShareRepo{
			revokeByDocumentFn: func(context.Context, string, string, int64) error { return nil },
		}
		tags := &mockDocumentTagRepo{
			deleteByDocFn: func(context.Context, string, string) error { return nil },
		}
		svc := newDocSvc(docs, nil, nil, tags, shares)
		err := svc.Delete(context.Background(), "u1", "d1")
		require.NoError(t, err)
	})

	t.Run("doc_delete_error", func(t *testing.T) {
		docs := &mockDocumentRepo{
			deleteFn: func(context.Context, string, string, int64) error { return errors.New("db error") },
		}
		svc := newDocSvc(docs, nil, nil, nil, nil)
		err := svc.Delete(context.Background(), "u1", "d1")
		assert.Error(t, err)
	})
}

func TestDocumentService_ListVersions(t *testing.T) {
	docs := &mockDocumentRepo{
		getByIDFn: func(context.Context, string, string) (*model.Document, error) {
			return &model.Document{ID: "d1"}, nil
		},
	}
	versions := &mockVersionRepo{
		listSummariesFn: func(context.Context, string, string) ([]model.DocumentVersionSummary, error) {
			return []model.DocumentVersionSummary{{Version: 1}}, nil
		},
	}
	svc := newDocSvc(docs, nil, versions, nil, nil)
	result, err := svc.ListVersions(context.Background(), "u1", "d1")
	require.NoError(t, err)
	assert.Len(t, result, 1)
}

func TestDocumentService_GetVersion(t *testing.T) {
	docs := &mockDocumentRepo{
		getByIDFn: func(context.Context, string, string) (*model.Document, error) {
			return &model.Document{ID: "d1"}, nil
		},
	}
	versions := &mockVersionRepo{
		getByVersionFn: func(context.Context, string, string, int) (*model.DocumentVersion, error) {
			return &model.DocumentVersion{Version: 1, Content: "hello"}, nil
		},
	}
	svc := newDocSvc(docs, nil, versions, nil, nil)
	v, err := svc.GetVersion(context.Background(), "u1", "d1", 1)
	require.NoError(t, err)
	assert.Equal(t, "hello", v.Content)
}

func TestDocumentService_CreateShare(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		docs := &mockDocumentRepo{
			getByIDFn: func(context.Context, string, string) (*model.Document, error) {
				return &model.Document{ID: "d1"}, nil
			},
		}
		shares := &mockShareRepo{
			revokeByDocumentFn: func(context.Context, string, string, int64) error { return nil },
			createFn: func(_ context.Context, share *model.Share) error {
				assert.Equal(t, repo.ShareStateActive, share.State)
				return nil
			},
		}
		svc := newDocSvc(docs, nil, nil, nil, shares)
		share, err := svc.CreateShare(context.Background(), "u1", "d1")
		require.NoError(t, err)
		assert.NotEmpty(t, share.Token)
	})
}

func TestDocumentService_RevokeShare(t *testing.T) {
	docs := &mockDocumentRepo{
		getByIDFn: func(context.Context, string, string) (*model.Document, error) {
			return &model.Document{ID: "d1"}, nil
		},
	}
	shares := &mockShareRepo{
		revokeByDocumentFn: func(context.Context, string, string, int64) error { return nil },
	}
	svc := newDocSvc(docs, nil, nil, nil, shares)
	err := svc.RevokeShare(context.Background(), "u1", "d1")
	require.NoError(t, err)
}

func TestDocumentService_GetActiveShare(t *testing.T) {
	t.Run("found", func(t *testing.T) {
		docs := &mockDocumentRepo{
			getByIDFn: func(context.Context, string, string) (*model.Document, error) {
				return &model.Document{ID: "d1"}, nil
			},
		}
		shares := &mockShareRepo{
			getActiveByDocumentFn: func(context.Context, string, string) (*model.Share, error) {
				return &model.Share{Token: "tok1"}, nil
			},
		}
		svc := newDocSvc(docs, nil, nil, nil, shares)
		share, err := svc.GetActiveShare(context.Background(), "u1", "d1")
		require.NoError(t, err)
		assert.Equal(t, "tok1", share.Token)
	})

	t.Run("no_active", func(t *testing.T) {
		docs := &mockDocumentRepo{
			getByIDFn: func(context.Context, string, string) (*model.Document, error) {
				return &model.Document{ID: "d1"}, nil
			},
		}
		shares := &mockShareRepo{
			getActiveByDocumentFn: func(context.Context, string, string) (*model.Share, error) {
				return nil, appErr.ErrNotFound
			},
		}
		svc := newDocSvc(docs, nil, nil, nil, shares)
		share, err := svc.GetActiveShare(context.Background(), "u1", "d1")
		require.NoError(t, err)
		assert.Nil(t, share)
	})
}

func TestDocumentService_ListSharedDocuments(t *testing.T) {
	shares := &mockShareRepo{
		listActiveDocumentsFn: func(context.Context, string, string) ([]repo.SharedDocument, error) {
			return []repo.SharedDocument{{ID: "d1", Title: "Shared Note", Token: "tok1"}}, nil
		},
	}
	tags := &mockDocumentTagRepo{
		listTagIDsByDocIDsFn: func(context.Context, string, []string) (map[string][]string, error) {
			return map[string][]string{"d1": {"t1"}}, nil
		},
	}
	svc := newDocSvc(nil, nil, nil, tags, shares)
	result, err := svc.ListSharedDocuments(context.Background(), "u1", "")
	require.NoError(t, err)
	assert.Len(t, result, 1)
	assert.Equal(t, "tok1", result[0].Token)
}

func TestDocumentService_ListByTag(t *testing.T) {
	tags := &mockDocumentTagRepo{
		listDocIDsByTagFn: func(context.Context, string, string) ([]string, error) {
			return []string{"d1", "d2"}, nil
		},
	}
	docs := &mockDocumentRepo{
		listByIDsFn: func(context.Context, string, []string) ([]model.Document, error) {
			return []model.Document{{ID: "d1"}, {ID: "d2"}}, nil
		},
	}
	svc := newDocSvc(docs, noopSummaryRepo(), nil, tags, nil)
	result, err := svc.ListByTag(context.Background(), "u1", "t1")
	require.NoError(t, err)
	assert.Len(t, result, 2)
}

func TestDocumentService_ListTagIDs(t *testing.T) {
	docs := &mockDocumentRepo{
		getByIDFn: func(context.Context, string, string) (*model.Document, error) {
			return &model.Document{ID: "d1"}, nil
		},
	}
	tags := &mockDocumentTagRepo{
		listTagIDsFn: func(context.Context, string, string) ([]string, error) {
			return []string{"t1", "t2"}, nil
		},
	}
	svc := newDocSvc(docs, nil, nil, tags, nil)
	result, err := svc.ListTagIDs(context.Background(), "u1", "d1")
	require.NoError(t, err)
	assert.Equal(t, []string{"t1", "t2"}, result)
}

func TestDocumentService_Summary(t *testing.T) {
	docs := &mockDocumentRepo{
		listFn: func(context.Context, string, *int, uint, uint, string) ([]model.Document, error) {
			return []model.Document{{ID: "d1"}}, nil
		},
		countFn: func(_ context.Context, _ string, starred *int) (int, error) {
			if starred != nil {
				return 3, nil
			}
			return 10, nil
		},
	}
	tags := &mockDocumentTagRepo{
		listByUserFn: func(context.Context, string) ([]model.DocumentTag, error) {
			return []model.DocumentTag{{TagID: "t1"}, {TagID: "t1"}, {TagID: "t2"}}, nil
		},
	}
	svc := newDocSvc(docs, noopSummaryRepo(), nil, tags, nil)
	result, err := svc.Summary(context.Background(), "u1", 5)
	require.NoError(t, err)
	assert.Equal(t, 10, result.Total)
	assert.Equal(t, 3, result.StarredTotal)
	assert.Equal(t, 2, result.TagCounts["t1"])
}

func TestDocumentService_PruneVersions(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		versions := &mockVersionRepo{
			deleteOldVersionsFn: func(_ context.Context, _, _ string, keep int) error {
				assert.Equal(t, 10, keep)
				return nil
			},
		}
		svc := newDocSvc(nil, nil, versions, nil, nil)
		err := svc.pruneVersions(context.Background(), "u1", "d1")
		require.NoError(t, err)
	})

	t.Run("disabled", func(t *testing.T) {
		svc := NewDocumentService(nil, nil, nil, nil, nil, nil, nil, nil, nil, 0)
		err := svc.pruneVersions(context.Background(), "u1", "d1")
		require.NoError(t, err)
	})
}

func TestDocumentService_GetBacklinks(t *testing.T) {
	docs := &mockDocumentRepo{
		getByIDFn: func(context.Context, string, string) (*model.Document, error) {
			return &model.Document{ID: "d1"}, nil
		},
		getBacklinksFn: func(context.Context, string, string) ([]model.Document, error) {
			return []model.Document{{ID: "d2"}}, nil
		},
	}
	svc := newDocSvc(docs, noopSummaryRepo(), nil, nil, nil)
	result, err := svc.GetBacklinks(context.Background(), "u1", "d1")
	require.NoError(t, err)
	assert.Len(t, result, 1)
}

func TestDocumentService_SemanticSearch_NoAI(t *testing.T) {
	svc := newDocSvc(nil, nil, nil, nil, nil)
	docs, scores, err := svc.SemanticSearch(context.Background(), "u1", "query", "", nil, 10, 0, "", "")
	require.NoError(t, err)
	assert.Empty(t, docs)
	assert.Empty(t, scores)
}

func TestDocumentService_SemanticSearch_WithAI(t *testing.T) {
	mgr := &mockAIManager{
		embedFn: func(context.Context, string, string) ([]float32, error) {
			return []float32{0.1}, nil
		},
		maxInputCharFn: func() int { return 0 },
	}
	emb := &mockEmbeddingRepo{
		searchChunksFn: func(context.Context, string, []float32, float32, int) ([]repo.ChunkSearchResult, error) {
			return []repo.ChunkSearchResult{
				{DocumentID: "d1", Score: 0.95, ChunkType: model.ChunkTypeText},
				{DocumentID: "d2", Score: 0.5, ChunkType: model.ChunkTypeText},
			}, nil
		},
	}
	aiSvc := newTestAIService(mgr, emb, nil)
	docs := &mockDocumentRepo{
		listByIDsFn: func(context.Context, string, []string) ([]model.Document, error) {
			return []model.Document{{ID: "d1", Title: "Good"}, {ID: "d2", Title: "Bad"}}, nil
		},
	}
	svc := NewDocumentService(nil, docs, noopSummaryRepo(), nil, nil, nil, nil, nil, aiSvc, 10)
	result, scores, err := svc.SemanticSearch(context.Background(), "u1", "query", "", nil, 10, 0, "", "")
	require.NoError(t, err)
	assert.Len(t, result, 1)
	assert.Len(t, scores, 1)
	assert.Equal(t, "d1", result[0].ID)
}

func TestDocumentService_SemanticSearch_Offset(t *testing.T) {
	mgr := &mockAIManager{
		embedFn: func(context.Context, string, string) ([]float32, error) {
			return []float32{0.1}, nil
		},
		maxInputCharFn: func() int { return 0 },
	}
	emb := &mockEmbeddingRepo{
		searchChunksFn: func(context.Context, string, []float32, float32, int) ([]repo.ChunkSearchResult, error) {
			return []repo.ChunkSearchResult{
				{DocumentID: "d1", Score: 0.95, ChunkType: model.ChunkTypeText},
				{DocumentID: "d2", Score: 0.9, ChunkType: model.ChunkTypeText},
			}, nil
		},
	}
	aiSvc := newTestAIService(mgr, emb, nil)
	docs := &mockDocumentRepo{
		listByIDsFn: func(context.Context, string, []string) ([]model.Document, error) {
			return []model.Document{{ID: "d1"}, {ID: "d2"}}, nil
		},
	}
	svc := NewDocumentService(nil, docs, noopSummaryRepo(), nil, nil, nil, nil, nil, aiSvc, 10)
	result, _, err := svc.SemanticSearch(context.Background(), "u1", "query", "", nil, 10, 5, "", "")
	require.NoError(t, err)
	assert.Empty(t, result)
}

func TestDocumentService_SemanticSearch_EmptyQuery(t *testing.T) {
	svc := newDocSvc(nil, nil, nil, nil, nil)
	docs, scores, err := svc.SemanticSearch(context.Background(), "u1", "", "", nil, 10, 0, "", "")
	require.NoError(t, err)
	assert.Empty(t, docs)
	assert.Empty(t, scores)
}

func TestDocumentService_Create(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		docs := &mockDocumentRepo{
			createFn:      func(context.Context, *model.Document) error { return nil },
			updateLinksFn: func(context.Context, string, string, []string, int64) error { return nil },
		}
		summaries := &mockDocumentSummaryRepo{
			upsertFn: func(context.Context, string, string, string, int64) error { return nil },
		}
		versions := &mockVersionRepo{
			createFn:            func(context.Context, *model.DocumentVersion) error { return nil },
			deleteOldVersionsFn: func(context.Context, string, string, int) error { return nil },
		}
		tags := &mockDocumentTagRepo{
			deleteByDocFn: func(context.Context, string, string) error { return nil },
			addFn:         func(context.Context, *model.DocumentTag) error { return nil },
		}
		svc := newDocSvc(docs, summaries, versions, tags, nil)
		doc, err := svc.Create(context.Background(), "u1", DocumentCreateInput{
			Title:   "Test",
			Content: "Hello world",
			TagIDs:  []string{"t1"},
			Summary: "A summary",
		})
		require.NoError(t, err)
		assert.NotEmpty(t, doc.ID)
		assert.Equal(t, "A summary", doc.Summary)
	})

	t.Run("create_error", func(t *testing.T) {
		docs := &mockDocumentRepo{
			createFn: func(context.Context, *model.Document) error { return errors.New("db error") },
		}
		svc := newDocSvc(docs, nil, nil, nil, nil)
		_, err := svc.Create(context.Background(), "u1", DocumentCreateInput{Title: "T", Content: "C"})
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "create")
	})
}

func TestDocumentService_Update(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		docs := &mockDocumentRepo{
			updateFn:      func(context.Context, *model.Document) error { return nil },
			updateLinksFn: func(context.Context, string, string, []string, int64) error { return nil },
		}
		summaries := &mockDocumentSummaryRepo{
			upsertFn: func(context.Context, string, string, string, int64) error { return nil },
		}
		versions := &mockVersionRepo{
			getLatestVersionFn:  func(context.Context, string, string) (int, error) { return 3, nil },
			createFn:            func(_ context.Context, v *model.DocumentVersion) error { assert.Equal(t, 4, v.Version); return nil },
			deleteOldVersionsFn: func(context.Context, string, string, int) error { return nil },
		}
		tags := &mockDocumentTagRepo{
			deleteByDocFn: func(context.Context, string, string) error { return nil },
			addFn:         func(context.Context, *model.DocumentTag) error { return nil },
		}
		summary := "test summary"
		svc := newDocSvc(docs, summaries, versions, tags, nil)
		err := svc.Update(context.Background(), "u1", "d1", DocumentUpdateInput{
			Title:   "Updated",
			Content: "New content",
			TagIDs:  []string{"t1"},
			Summary: &summary,
		})
		require.NoError(t, err)
	})

	t.Run("update_error", func(t *testing.T) {
		docs := &mockDocumentRepo{
			updateFn: func(context.Context, *model.Document) error { return errors.New("db error") },
		}
		svc := newDocSvc(docs, nil, nil, nil, nil)
		err := svc.Update(context.Background(), "u1", "d1", DocumentUpdateInput{Title: "T", Content: "C"})
		assert.Error(t, err)
	})
}

func TestDocumentService_GetShareByToken(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		shares := &mockShareRepo{
			getByTokenFn: func(context.Context, string) (*model.Share, error) {
				return &model.Share{
					ID: "s1", UserID: "u1", DocumentID: "d1", Token: "tok1",
					State: repo.ShareStateActive, Permission: 1, AllowDownload: 1,
				}, nil
			},
		}
		docs := &mockDocumentRepo{
			getByIDFn: func(context.Context, string, string) (*model.Document, error) {
				return &model.Document{ID: "d1", Title: "Test"}, nil
			},
		}
		users := &mockUserRepo{
			getByIDFn: func(context.Context, string) (*model.User, error) {
				return &model.User{ID: "u1", Email: "a@b.com"}, nil
			},
		}
		tagsMock := &mockDocumentTagRepo{
			listTagIDsFn: func(context.Context, string, string) ([]string, error) {
				return []string{"t1"}, nil
			},
		}
		tagRepoMock := &mockTagRepo{
			listByIDsFn: func(context.Context, string, []string) ([]model.Tag, error) {
				return []model.Tag{{ID: "t1", Name: "Go"}}, nil
			},
		}
		svc := NewDocumentService(nil, docs, nil, nil, tagsMock, shares, tagRepoMock, users, nil, 10)
		detail, err := svc.GetShareByToken(context.Background(), "tok1", "")
		require.NoError(t, err)
		assert.Equal(t, "Test", detail.Document.Title)
		assert.Equal(t, "a@b.com", detail.Author)
	})

	t.Run("token_not_found", func(t *testing.T) {
		shares := &mockShareRepo{
			getByTokenFn: func(context.Context, string) (*model.Share, error) {
				return nil, appErr.ErrNotFound
			},
		}
		svc := newDocSvc(nil, nil, nil, nil, shares)
		_, err := svc.GetShareByToken(context.Background(), "invalid", "")
		assert.Error(t, err)
	})
}

func TestDocumentService_VerifySharePassword(t *testing.T) {
	svc := &DocumentService{}

	t.Run("no_password_required", func(t *testing.T) {
		share := &model.Share{PasswordHash: ""}
		assert.NoError(t, svc.verifySharePassword(share, ""))
	})

	t.Run("empty_input", func(t *testing.T) {
		share := &model.Share{PasswordHash: "hashed"}
		assert.ErrorIs(t, svc.verifySharePassword(share, ""), appErr.ErrForbidden)
	})

	t.Run("bcrypt_match", func(t *testing.T) {
		hashed, err := password.Hash("secret123")
		require.NoError(t, err)
		share := &model.Share{PasswordHash: hashed}
		assert.NoError(t, svc.verifySharePassword(share, "secret123"))
	})

	t.Run("wrong_password", func(t *testing.T) {
		hashed, err := password.Hash("secret123")
		require.NoError(t, err)
		share := &model.Share{PasswordHash: hashed}
		assert.ErrorIs(t, svc.verifySharePassword(share, "wrong"), appErr.ErrForbidden)
	})
}

func TestDocumentService_ResolveCommentThread(t *testing.T) {
	t.Run("empty_reply_to", func(t *testing.T) {
		svc := &DocumentService{}
		rootID, replyToID := svc.resolveCommentThread(context.Background(), "s1", "")
		assert.Empty(t, rootID)
		assert.Empty(t, replyToID)
	})

	t.Run("reply_to_root_comment", func(t *testing.T) {
		shares := &mockShareRepo{
			getCommentByIDFn: func(context.Context, string) (*model.ShareComment, error) {
				return &model.ShareComment{ID: "c1", ShareID: "s1", RootID: ""}, nil
			},
		}
		svc := newDocSvc(nil, nil, nil, nil, shares)
		rootID, replyToID := svc.resolveCommentThread(context.Background(), "s1", "c1")
		assert.Equal(t, "c1", rootID)
		assert.Equal(t, "c1", replyToID)
	})

	t.Run("reply_to_nested_comment", func(t *testing.T) {
		shares := &mockShareRepo{
			getCommentByIDFn: func(context.Context, string) (*model.ShareComment, error) {
				return &model.ShareComment{ID: "c2", ShareID: "s1", RootID: "c1"}, nil
			},
		}
		svc := newDocSvc(nil, nil, nil, nil, shares)
		rootID, replyToID := svc.resolveCommentThread(context.Background(), "s1", "c2")
		assert.Equal(t, "c1", rootID)
		assert.Equal(t, "c2", replyToID)
	})

	t.Run("comment_not_found", func(t *testing.T) {
		shares := &mockShareRepo{
			getCommentByIDFn: func(context.Context, string) (*model.ShareComment, error) {
				return nil, appErr.ErrNotFound
			},
		}
		svc := newDocSvc(nil, nil, nil, nil, shares)
		rootID, replyToID := svc.resolveCommentThread(context.Background(), "s1", "c99")
		assert.Empty(t, rootID)
		assert.Empty(t, replyToID)
	})
}

func TestDocumentService_CreateShareCommentByToken(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		shares := &mockShareRepo{
			getByTokenFn: func(context.Context, string) (*model.Share, error) {
				return &model.Share{
					ID: "s1", DocumentID: "d1", State: repo.ShareStateActive,
					Permission: repo.SharePermissionComment,
				}, nil
			},
			getCommentByIDFn: func(context.Context, string) (*model.ShareComment, error) {
				return nil, appErr.ErrNotFound
			},
			createCommentFn: func(_ context.Context, c *model.ShareComment) error {
				assert.Equal(t, "Hello", c.Content)
				assert.Equal(t, "Alice", c.Author)
				return nil
			},
		}
		svc := newDocSvc(nil, nil, nil, nil, shares)
		comment, err := svc.CreateShareCommentByToken(context.Background(), CreateShareCommentInput{
			Token: "tok1", Author: "Alice", Content: "Hello",
		})
		require.NoError(t, err)
		assert.NotEmpty(t, comment.ID)
	})

	t.Run("view_only", func(t *testing.T) {
		shares := &mockShareRepo{
			getByTokenFn: func(context.Context, string) (*model.Share, error) {
				return &model.Share{
					ID: "s1", State: repo.ShareStateActive,
					Permission: repo.SharePermissionView,
				}, nil
			},
		}
		svc := newDocSvc(nil, nil, nil, nil, shares)
		_, err := svc.CreateShareCommentByToken(context.Background(), CreateShareCommentInput{
			Token: "tok1", Content: "Hello",
		})
		assert.ErrorIs(t, err, appErr.ErrForbidden)
	})

	t.Run("empty_content", func(t *testing.T) {
		shares := &mockShareRepo{
			getByTokenFn: func(context.Context, string) (*model.Share, error) {
				return &model.Share{
					ID: "s1", State: repo.ShareStateActive,
					Permission: repo.SharePermissionComment,
				}, nil
			},
		}
		svc := newDocSvc(nil, nil, nil, nil, shares)
		_, err := svc.CreateShareCommentByToken(context.Background(), CreateShareCommentInput{
			Token: "tok1", Content: "",
		})
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})
}

func TestDocumentService_ProcessPendingSummaries_NilAI(t *testing.T) {
	svc := newDocSvc(nil, nil, nil, nil, nil)
	err := svc.ProcessPendingSummaries(context.Background(), 0)
	require.NoError(t, err)
}

func TestDocumentService_ProcessPendingSummaries_NoDocs(t *testing.T) {
	summaries := &mockDocumentSummaryRepo{
		listPendingDocumentsFn: func(context.Context, int, int64) ([]model.Document, error) {
			return nil, nil
		},
	}
	svc := NewDocumentService(nil, nil, summaries, nil, nil, nil, nil, nil, &AIService{}, 0)
	err := svc.ProcessPendingSummaries(context.Background(), 60)
	require.NoError(t, err)
}

func TestDocumentService_AttachSummary(t *testing.T) {
	t.Run("found", func(t *testing.T) {
		summaries := &mockDocumentSummaryRepo{
			getByDocIDFn: func(context.Context, string, string) (string, error) {
				return "A summary", nil
			},
		}
		svc := newDocSvc(nil, summaries, nil, nil, nil)
		doc := &model.Document{ID: "d1"}
		err := svc.attachSummary(context.Background(), "u1", doc)
		require.NoError(t, err)
		assert.Equal(t, "A summary", doc.Summary)
	})

	t.Run("not_found", func(t *testing.T) {
		summaries := &mockDocumentSummaryRepo{
			getByDocIDFn: func(context.Context, string, string) (string, error) {
				return "", appErr.ErrNotFound
			},
		}
		svc := newDocSvc(nil, summaries, nil, nil, nil)
		doc := &model.Document{ID: "d1"}
		err := svc.attachSummary(context.Background(), "u1", doc)
		require.NoError(t, err)
		assert.Empty(t, doc.Summary)
	})

	t.Run("nil_doc", func(t *testing.T) {
		svc := newDocSvc(nil, nil, nil, nil, nil)
		err := svc.attachSummary(context.Background(), "u1", nil)
		require.NoError(t, err)
	})

	t.Run("error", func(t *testing.T) {
		summaries := &mockDocumentSummaryRepo{
			getByDocIDFn: func(context.Context, string, string) (string, error) {
				return "", errors.New("db error")
			},
		}
		svc := newDocSvc(nil, summaries, nil, nil, nil)
		doc := &model.Document{ID: "d1"}
		err := svc.attachSummary(context.Background(), "u1", doc)
		assert.Error(t, err)
	})
}

func TestDocumentService_ListByIDs(t *testing.T) {
	docs := &mockDocumentRepo{
		listByIDsFn: func(context.Context, string, []string) ([]model.Document, error) {
			return []model.Document{{ID: "d1"}, {ID: "d2"}}, nil
		},
	}
	svc := newDocSvc(docs, noopSummaryRepo(), nil, nil, nil)
	result, err := svc.ListByIDs(context.Background(), "u1", []string{"d1", "d2"})
	require.NoError(t, err)
	assert.Len(t, result, 2)
}

func TestDocumentService_ListTagIDsByDocIDs(t *testing.T) {
	tags := &mockDocumentTagRepo{
		listTagIDsByDocIDsFn: func(context.Context, string, []string) (map[string][]string, error) {
			return map[string][]string{"d1": {"t1", "t2"}}, nil
		},
	}
	svc := newDocSvc(nil, nil, nil, tags, nil)
	result, err := svc.ListTagIDsByDocIDs(context.Background(), "u1", []string{"d1"})
	require.NoError(t, err)
	assert.Len(t, result["d1"], 2)
}

func TestDocumentService_ListTagsByIDs(t *testing.T) {
	tagRepo := &mockTagRepo{
		listByIDsFn: func(context.Context, string, []string) ([]model.Tag, error) {
			return []model.Tag{{ID: "t1", Name: "go"}}, nil
		},
	}
	svc := NewDocumentService(nil, nil, nil, nil, nil, nil, tagRepo, nil, nil, 10)
	result, err := svc.ListTagsByIDs(context.Background(), "u1", []string{"t1"})
	require.NoError(t, err)
	assert.Len(t, result, 1)
}

func TestDocumentService_SetAssetService(t *testing.T) {
	svc := newDocSvc(nil, nil, nil, nil, nil)
	assert.Nil(t, svc.assets)
	svc.SetAssetService(&AssetService{})
	assert.NotNil(t, svc.assets)
}

func TestDocumentService_UpdateTags_DeleteError(t *testing.T) {
	docs := &mockDocumentRepo{
		getByIDFn: func(context.Context, string, string) (*model.Document, error) {
			return &model.Document{ID: "d1"}, nil
		},
	}
	tags := &mockDocumentTagRepo{
		deleteByDocFn: func(context.Context, string, string) error { return errors.New("db err") },
	}
	svc := newDocSvc(docs, noopSummaryRepo(), nil, tags, nil)
	err := svc.UpdateTags(context.Background(), "u1", "d1", []string{"t1"})
	assert.Error(t, err)
}

func TestDocumentService_UpdateTags_AddError(t *testing.T) {
	docs := &mockDocumentRepo{
		getByIDFn: func(context.Context, string, string) (*model.Document, error) {
			return &model.Document{ID: "d1"}, nil
		},
	}
	tags := &mockDocumentTagRepo{
		deleteByDocFn: func(context.Context, string, string) error { return nil },
		addFn:         func(context.Context, *model.DocumentTag) error { return errors.New("add err") },
	}
	svc := newDocSvc(docs, noopSummaryRepo(), nil, tags, nil)
	err := svc.UpdateTags(context.Background(), "u1", "d1", []string{"t1"})
	assert.Error(t, err)
}

func TestDocumentService_UpdateSummary_DocNotFound(t *testing.T) {
	docs := &mockDocumentRepo{
		getByIDFn: func(context.Context, string, string) (*model.Document, error) {
			return nil, appErr.ErrNotFound
		},
	}
	svc := newDocSvc(docs, nil, nil, nil, nil)
	err := svc.UpdateSummary(context.Background(), "u1", "d1", "sum")
	assert.Error(t, err)
}

func TestDocumentService_UpdateSummary_UpsertError(t *testing.T) {
	docs := &mockDocumentRepo{
		getByIDFn: func(context.Context, string, string) (*model.Document, error) {
			return &model.Document{ID: "d1"}, nil
		},
	}
	summaries := &mockDocumentSummaryRepo{
		upsertFn: func(context.Context, string, string, string, int64) error { return errors.New("fail") },
	}
	svc := newDocSvc(docs, summaries, nil, nil, nil)
	err := svc.UpdateSummary(context.Background(), "u1", "d1", "sum")
	assert.Error(t, err)
}

func TestDocumentService_UpdatePinned_Error(t *testing.T) {
	docs := &mockDocumentRepo{
		updatePinnedFn: func(context.Context, string, string, int) error { return errors.New("fail") },
	}
	svc := newDocSvc(docs, nil, nil, nil, nil)
	err := svc.UpdatePinned(context.Background(), "u1", "d1", 1)
	assert.Error(t, err)
}

func TestDocumentService_UpdateStarred_Error(t *testing.T) {
	docs := &mockDocumentRepo{
		updateStarredFn: func(context.Context, string, string, int) error { return errors.New("fail") },
	}
	svc := newDocSvc(docs, nil, nil, nil, nil)
	err := svc.UpdateStarred(context.Background(), "u1", "d1", 1)
	assert.Error(t, err)
}

func TestDocumentService_Delete_ShareRevokeError(t *testing.T) {
	docs := &mockDocumentRepo{
		deleteFn: func(context.Context, string, string, int64) error { return nil },
	}
	shares := &mockShareRepo{
		revokeByDocumentFn: func(context.Context, string, string, int64) error { return errors.New("fail") },
	}
	svc := newDocSvc(docs, nil, nil, nil, shares)
	err := svc.Delete(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestDocumentService_Delete_TagDeleteError(t *testing.T) {
	docs := &mockDocumentRepo{
		deleteFn: func(context.Context, string, string, int64) error { return nil },
	}
	shares := &mockShareRepo{
		revokeByDocumentFn: func(context.Context, string, string, int64) error { return nil },
	}
	tags := &mockDocumentTagRepo{
		deleteByDocFn: func(context.Context, string, string) error { return errors.New("fail") },
	}
	svc := newDocSvc(docs, nil, nil, tags, shares)
	err := svc.Delete(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestDocumentService_ListVersions_DocNotFound(t *testing.T) {
	docs := &mockDocumentRepo{
		getByIDFn: func(context.Context, string, string) (*model.Document, error) {
			return nil, appErr.ErrNotFound
		},
	}
	svc := newDocSvc(docs, nil, nil, nil, nil)
	_, err := svc.ListVersions(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestDocumentService_ListVersions_RepoError(t *testing.T) {
	docs := &mockDocumentRepo{
		getByIDFn: func(context.Context, string, string) (*model.Document, error) {
			return &model.Document{ID: "d1"}, nil
		},
	}
	versions := &mockVersionRepo{
		listSummariesFn: func(context.Context, string, string) ([]model.DocumentVersionSummary, error) {
			return nil, errors.New("fail")
		},
	}
	svc := newDocSvc(docs, nil, versions, nil, nil)
	_, err := svc.ListVersions(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestDocumentService_GetVersion_DocNotFound(t *testing.T) {
	docs := &mockDocumentRepo{
		getByIDFn: func(context.Context, string, string) (*model.Document, error) {
			return nil, appErr.ErrNotFound
		},
	}
	svc := newDocSvc(docs, nil, nil, nil, nil)
	_, err := svc.GetVersion(context.Background(), "u1", "d1", 1)
	assert.Error(t, err)
}

func TestDocumentService_GetVersion_VersionError(t *testing.T) {
	docs := &mockDocumentRepo{
		getByIDFn: func(context.Context, string, string) (*model.Document, error) {
			return &model.Document{ID: "d1"}, nil
		},
	}
	versions := &mockVersionRepo{
		getByVersionFn: func(context.Context, string, string, int) (*model.DocumentVersion, error) {
			return nil, errors.New("fail")
		},
	}
	svc := newDocSvc(docs, nil, versions, nil, nil)
	_, err := svc.GetVersion(context.Background(), "u1", "d1", 1)
	assert.Error(t, err)
}

func TestDocumentService_CreateShare_DocNotFound(t *testing.T) {
	docs := &mockDocumentRepo{
		getByIDFn: func(context.Context, string, string) (*model.Document, error) {
			return nil, appErr.ErrNotFound
		},
	}
	svc := newDocSvc(docs, nil, nil, nil, nil)
	_, err := svc.CreateShare(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestDocumentService_CreateShare_RevokeError(t *testing.T) {
	docs := &mockDocumentRepo{
		getByIDFn: func(context.Context, string, string) (*model.Document, error) {
			return &model.Document{ID: "d1"}, nil
		},
	}
	shares := &mockShareRepo{
		revokeByDocumentFn: func(context.Context, string, string, int64) error { return errors.New("fail") },
	}
	svc := newDocSvc(docs, nil, nil, nil, shares)
	_, err := svc.CreateShare(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestDocumentService_CreateShare_CreateError(t *testing.T) {
	docs := &mockDocumentRepo{
		getByIDFn: func(context.Context, string, string) (*model.Document, error) {
			return &model.Document{ID: "d1"}, nil
		},
	}
	shares := &mockShareRepo{
		revokeByDocumentFn: func(context.Context, string, string, int64) error { return nil },
		createFn:           func(context.Context, *model.Share) error { return errors.New("fail") },
	}
	svc := newDocSvc(docs, nil, nil, nil, shares)
	_, err := svc.CreateShare(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestDocumentService_RevokeShare_DocNotFound(t *testing.T) {
	docs := &mockDocumentRepo{
		getByIDFn: func(context.Context, string, string) (*model.Document, error) {
			return nil, appErr.ErrNotFound
		},
	}
	svc := newDocSvc(docs, nil, nil, nil, nil)
	err := svc.RevokeShare(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestDocumentService_RevokeShare_RevokeError(t *testing.T) {
	docs := &mockDocumentRepo{
		getByIDFn: func(context.Context, string, string) (*model.Document, error) {
			return &model.Document{ID: "d1"}, nil
		},
	}
	shares := &mockShareRepo{
		revokeByDocumentFn: func(context.Context, string, string, int64) error { return errors.New("fail") },
	}
	svc := newDocSvc(docs, nil, nil, nil, shares)
	err := svc.RevokeShare(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestDocumentService_GetActiveShare_DocNotFound(t *testing.T) {
	docs := &mockDocumentRepo{
		getByIDFn: func(context.Context, string, string) (*model.Document, error) {
			return nil, appErr.ErrNotFound
		},
	}
	svc := newDocSvc(docs, nil, nil, nil, nil)
	_, err := svc.GetActiveShare(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestDocumentService_GetActiveShare_RepoError(t *testing.T) {
	docs := &mockDocumentRepo{
		getByIDFn: func(context.Context, string, string) (*model.Document, error) {
			return &model.Document{ID: "d1"}, nil
		},
	}
	shares := &mockShareRepo{
		getActiveByDocumentFn: func(context.Context, string, string) (*model.Share, error) {
			return nil, errors.New("db error")
		},
	}
	svc := newDocSvc(docs, nil, nil, nil, shares)
	_, err := svc.GetActiveShare(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestDocumentService_ListSharedDocuments_Error(t *testing.T) {
	shares := &mockShareRepo{
		listActiveDocumentsFn: func(context.Context, string, string) ([]repo.SharedDocument, error) {
			return nil, errors.New("fail")
		},
	}
	svc := newDocSvc(nil, nil, nil, nil, shares)
	_, err := svc.ListSharedDocuments(context.Background(), "u1", "")
	assert.Error(t, err)
}

func TestDocumentService_ListSharedDocuments_TagError(t *testing.T) {
	shares := &mockShareRepo{
		listActiveDocumentsFn: func(context.Context, string, string) ([]repo.SharedDocument, error) {
			return []repo.SharedDocument{{ID: "d1"}}, nil
		},
	}
	tags := &mockDocumentTagRepo{
		listTagIDsByDocIDsFn: func(context.Context, string, []string) (map[string][]string, error) {
			return nil, errors.New("fail")
		},
	}
	svc := newDocSvc(nil, nil, nil, tags, shares)
	_, err := svc.ListSharedDocuments(context.Background(), "u1", "")
	assert.Error(t, err)
}

func TestDocumentService_ListByTag_Error(t *testing.T) {
	tags := &mockDocumentTagRepo{
		listDocIDsByTagFn: func(context.Context, string, string) ([]string, error) {
			return nil, errors.New("fail")
		},
	}
	svc := newDocSvc(nil, nil, nil, tags, nil)
	_, err := svc.ListByTag(context.Background(), "u1", "t1")
	assert.Error(t, err)
}

func TestDocumentService_ListByTag_DocsError(t *testing.T) {
	tags := &mockDocumentTagRepo{
		listDocIDsByTagFn: func(context.Context, string, string) ([]string, error) {
			return []string{"d1"}, nil
		},
	}
	docs := &mockDocumentRepo{
		listByIDsFn: func(context.Context, string, []string) ([]model.Document, error) {
			return nil, errors.New("fail")
		},
	}
	svc := newDocSvc(docs, noopSummaryRepo(), nil, tags, nil)
	_, err := svc.ListByTag(context.Background(), "u1", "t1")
	assert.Error(t, err)
}

func TestDocumentService_ListTagIDs_Error(t *testing.T) {
	docs := &mockDocumentRepo{
		getByIDFn: func(context.Context, string, string) (*model.Document, error) {
			return &model.Document{ID: "d1"}, nil
		},
	}
	tags := &mockDocumentTagRepo{
		listTagIDsFn: func(context.Context, string, string) ([]string, error) {
			return nil, errors.New("fail")
		},
	}
	svc := newDocSvc(docs, nil, nil, tags, nil)
	_, err := svc.ListTagIDs(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestDocumentService_ListTagIDsByDocIDs_Error(t *testing.T) {
	tags := &mockDocumentTagRepo{
		listTagIDsByDocIDsFn: func(context.Context, string, []string) (map[string][]string, error) {
			return nil, errors.New("fail")
		},
	}
	svc := newDocSvc(nil, nil, nil, tags, nil)
	_, err := svc.ListTagIDsByDocIDs(context.Background(), "u1", []string{"d1"})
	assert.Error(t, err)
}

func TestDocumentService_ListTagsByIDs_Error(t *testing.T) {
	tagRepo := &mockTagRepo{
		listByIDsFn: func(context.Context, string, []string) ([]model.Tag, error) {
			return nil, errors.New("fail")
		},
	}
	svc := NewDocumentService(nil, nil, nil, nil, nil, nil, tagRepo, nil, nil, 10)
	_, err := svc.ListTagsByIDs(context.Background(), "u1", []string{"t1"})
	assert.Error(t, err)
}

func TestDocumentService_ListByIDs_Error(t *testing.T) {
	docs := &mockDocumentRepo{
		listByIDsFn: func(context.Context, string, []string) ([]model.Document, error) {
			return nil, errors.New("fail")
		},
	}
	svc := newDocSvc(docs, noopSummaryRepo(), nil, nil, nil)
	_, err := svc.ListByIDs(context.Background(), "u1", []string{"d1"})
	assert.Error(t, err)
}

func TestDocumentService_Summary_Error(t *testing.T) {
	docs := &mockDocumentRepo{
		listFn: func(context.Context, string, *int, uint, uint, string) ([]model.Document, error) {
			return nil, errors.New("fail")
		},
	}
	svc := newDocSvc(docs, noopSummaryRepo(), nil, nil, nil)
	_, err := svc.Summary(context.Background(), "u1", 5)
	assert.Error(t, err)
}

func TestDocumentService_Summary_TagError(t *testing.T) {
	docs := &mockDocumentRepo{
		listFn: func(context.Context, string, *int, uint, uint, string) ([]model.Document, error) {
			return nil, nil
		},
	}
	tags := &mockDocumentTagRepo{
		listByUserFn: func(context.Context, string) ([]model.DocumentTag, error) {
			return nil, errors.New("fail")
		},
	}
	svc := newDocSvc(docs, noopSummaryRepo(), nil, tags, nil)
	_, err := svc.Summary(context.Background(), "u1", 5)
	assert.Error(t, err)
}

func TestDocumentService_Summary_CountError(t *testing.T) {
	docs := &mockDocumentRepo{
		listFn: func(context.Context, string, *int, uint, uint, string) ([]model.Document, error) {
			return nil, nil
		},
		countFn: func(context.Context, string, *int) (int, error) {
			return 0, errors.New("fail")
		},
	}
	tags := &mockDocumentTagRepo{
		listByUserFn: func(context.Context, string) ([]model.DocumentTag, error) {
			return nil, nil
		},
	}
	svc := newDocSvc(docs, noopSummaryRepo(), nil, tags, nil)
	_, err := svc.Summary(context.Background(), "u1", 5)
	assert.Error(t, err)
}

func TestDocumentService_GetByTitle_Error(t *testing.T) {
	docs := &mockDocumentRepo{
		getByTitleFn: func(context.Context, string, string) (*model.Document, error) {
			return nil, errors.New("fail")
		},
	}
	svc := newDocSvc(docs, nil, nil, nil, nil)
	_, err := svc.GetByTitle(context.Background(), "u1", "title")
	assert.Error(t, err)
}

func TestDocumentService_Get_SummaryError(t *testing.T) {
	docs := &mockDocumentRepo{
		getByIDFn: func(context.Context, string, string) (*model.Document, error) {
			return &model.Document{ID: "d1"}, nil
		},
	}
	summaries := &mockDocumentSummaryRepo{
		getByDocIDFn: func(context.Context, string, string) (string, error) {
			return "", errors.New("fail")
		},
	}
	svc := newDocSvc(docs, summaries, nil, nil, nil)
	_, err := svc.Get(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestDocumentService_UpdateShareConfig_DocNotFound(t *testing.T) {
	docs := &mockDocumentRepo{
		getByIDFn: func(context.Context, string, string) (*model.Document, error) {
			return nil, appErr.ErrNotFound
		},
	}
	svc := newDocSvc(docs, nil, nil, nil, nil)
	_, err := svc.UpdateShareConfig(context.Background(), "u1", "d1", ShareConfigInput{})
	assert.Error(t, err)
}

func TestDocumentService_UpdateShareConfig_NoActiveShare(t *testing.T) {
	docs := &mockDocumentRepo{
		getByIDFn: func(context.Context, string, string) (*model.Document, error) {
			return &model.Document{ID: "d1"}, nil
		},
	}
	shares := &mockShareRepo{
		getActiveByDocumentFn: func(context.Context, string, string) (*model.Share, error) {
			return nil, appErr.ErrNotFound
		},
	}
	svc := newDocSvc(docs, nil, nil, nil, shares)
	_, err := svc.UpdateShareConfig(context.Background(), "u1", "d1", ShareConfigInput{})
	assert.Error(t, err)
}

func TestDocumentService_UpdateShareConfig_UpdateError(t *testing.T) {
	docs := &mockDocumentRepo{
		getByIDFn: func(context.Context, string, string) (*model.Document, error) {
			return &model.Document{ID: "d1"}, nil
		},
	}
	shares := &mockShareRepo{
		getActiveByDocumentFn: func(context.Context, string, string) (*model.Share, error) {
			return &model.Share{ID: "s1", Permission: 1}, nil
		},
		updateConfigByDocumentFn: func(context.Context, string, string, int64, string, int, int, int64) error {
			return errors.New("fail")
		},
	}
	svc := newDocSvc(docs, nil, nil, nil, shares)
	_, err := svc.UpdateShareConfig(context.Background(), "u1", "d1", ShareConfigInput{Permission: 1})
	assert.Error(t, err)
}

func TestDocumentService_Update_VersionCreateError(t *testing.T) {
	docs := &mockDocumentRepo{
		updateFn:      func(context.Context, *model.Document) error { return nil },
		updateLinksFn: func(context.Context, string, string, []string, int64) error { return nil },
	}
	versions := &mockVersionRepo{
		getLatestVersionFn: func(context.Context, string, string) (int, error) {
			return 1, nil
		},
		createFn: func(context.Context, *model.DocumentVersion) error { return errors.New("create version fail") },
	}
	svc := newDocSvc(docs, noopSummaryRepo(), versions, nil, nil)
	err := svc.Update(context.Background(), "u1", "d1", DocumentUpdateInput{Title: "T", Content: "C"})
	assert.Error(t, err)
}

func TestDocumentService_Update_PruneVersionsError(t *testing.T) {
	docs := &mockDocumentRepo{
		updateFn:      func(context.Context, *model.Document) error { return nil },
		updateLinksFn: func(context.Context, string, string, []string, int64) error { return nil },
	}
	versions := &mockVersionRepo{
		getLatestVersionFn: func(context.Context, string, string) (int, error) { return 1, nil },
		createFn:           func(context.Context, *model.DocumentVersion) error { return nil },
		deleteOldVersionsFn: func(context.Context, string, string, int) error {
			return errors.New("prune fail")
		},
	}
	svc := newDocSvc(docs, noopSummaryRepo(), versions, nil, nil)
	err := svc.Update(context.Background(), "u1", "d1", DocumentUpdateInput{Title: "T", Content: "C"})
	assert.Error(t, err)
}

func TestDocumentService_Update_TagDeleteError(t *testing.T) {
	tagIDs := []string{"t1"}
	docs := &mockDocumentRepo{
		updateFn:      func(context.Context, *model.Document) error { return nil },
		updateLinksFn: func(context.Context, string, string, []string, int64) error { return nil },
	}
	versions := &mockVersionRepo{
		getLatestVersionFn:  func(context.Context, string, string) (int, error) { return 1, nil },
		createFn:            func(context.Context, *model.DocumentVersion) error { return nil },
		deleteOldVersionsFn: func(context.Context, string, string, int) error { return nil },
	}
	tags := &mockDocumentTagRepo{
		deleteByDocFn: func(context.Context, string, string) error { return errors.New("del fail") },
	}
	svc := newDocSvc(docs, noopSummaryRepo(), versions, tags, nil)
	err := svc.Update(context.Background(), "u1", "d1", DocumentUpdateInput{Title: "T", Content: "C", TagIDs: tagIDs})
	assert.Error(t, err)
}

func TestDocumentService_Update_UpdateLinkError(t *testing.T) {
	docs := &mockDocumentRepo{
		updateFn:      func(context.Context, *model.Document) error { return nil },
		updateLinksFn: func(context.Context, string, string, []string, int64) error { return errors.New("link fail") },
	}
	versions := &mockVersionRepo{
		getLatestVersionFn:  func(context.Context, string, string) (int, error) { return 1, nil },
		createFn:            func(context.Context, *model.DocumentVersion) error { return nil },
		deleteOldVersionsFn: func(context.Context, string, string, int) error { return nil },
	}
	svc := newDocSvc(docs, noopSummaryRepo(), versions, nil, nil)
	err := svc.Update(context.Background(), "u1", "d1", DocumentUpdateInput{Title: "T", Content: "C"})
	assert.Error(t, err)
}

func TestDocumentService_Update_DocUpdateError(t *testing.T) {
	docs := &mockDocumentRepo{
		updateFn: func(context.Context, *model.Document) error { return errors.New("update fail") },
	}
	svc := newDocSvc(docs, noopSummaryRepo(), nil, nil, nil)
	err := svc.Update(context.Background(), "u1", "d1", DocumentUpdateInput{Title: "T", Content: "C"})
	assert.Error(t, err)
}

func TestDocumentService_Update_SummaryError(t *testing.T) {
	summary := "sum"
	docs := &mockDocumentRepo{
		updateFn: func(context.Context, *model.Document) error { return nil },
	}
	summaries := &mockDocumentSummaryRepo{
		upsertFn: func(context.Context, string, string, string, int64) error { return errors.New("fail") },
	}
	svc := newDocSvc(docs, summaries, nil, nil, nil)
	err := svc.Update(context.Background(), "u1", "d1", DocumentUpdateInput{Title: "T", Content: "C", Summary: &summary})
	assert.Error(t, err)
}

func TestDocumentService_Search_SearchError(t *testing.T) {
	docs := &mockDocumentRepo{
		searchLikeFn: func(context.Context, string, string, string, *int, uint, uint, string) ([]model.Document, error) {
			return nil, errors.New("fail")
		},
	}
	svc := newDocSvc(docs, noopSummaryRepo(), nil, nil, nil)
	_, err := svc.Search(context.Background(), "u1", "query", "", nil, 10, 0, "")
	assert.Error(t, err)
}

func TestDocumentService_ListShareCommentsByToken_TokenError(t *testing.T) {
	shares := &mockShareRepo{
		getByTokenFn: func(context.Context, string) (*model.Share, error) {
			return nil, appErr.ErrNotFound
		},
	}
	svc := newDocSvc(nil, nil, nil, nil, shares)
	_, err := svc.ListShareCommentsByToken(context.Background(), "tok1", "", 10, 0)
	assert.Error(t, err)
}

func TestDocumentService_ListShareCommentRepliesByToken_TokenError(t *testing.T) {
	shares := &mockShareRepo{
		getByTokenFn: func(context.Context, string) (*model.Share, error) {
			return nil, appErr.ErrNotFound
		},
	}
	svc := newDocSvc(nil, nil, nil, nil, shares)
	_, err := svc.ListShareCommentRepliesByToken(context.Background(), "tok1", "", "c1", 10, 0)
	assert.Error(t, err)
}

func TestDocumentService_CreateShareCommentByToken_TokenError(t *testing.T) {
	shares := &mockShareRepo{
		getByTokenFn: func(context.Context, string) (*model.Share, error) {
			return nil, appErr.ErrNotFound
		},
	}
	svc := newDocSvc(nil, nil, nil, nil, shares)
	_, err := svc.CreateShareCommentByToken(context.Background(), CreateShareCommentInput{Token: "tok1"})
	assert.Error(t, err)
}

func TestDocumentService_CreateShareCommentByToken_CreateError(t *testing.T) {
	shares := &mockShareRepo{
		getByTokenFn: func(context.Context, string) (*model.Share, error) {
			return &model.Share{
				ID: "s1", DocumentID: "d1", State: repo.ShareStateActive,
				Permission: repo.SharePermissionComment,
			}, nil
		},
		getCommentByIDFn: func(context.Context, string) (*model.ShareComment, error) {
			return nil, appErr.ErrNotFound
		},
		createCommentFn: func(context.Context, *model.ShareComment) error { return errors.New("fail") },
	}
	svc := newDocSvc(nil, nil, nil, nil, shares)
	_, err := svc.CreateShareCommentByToken(context.Background(), CreateShareCommentInput{
		Token: "tok1", Author: "Alice", Content: "Hello",
	})
	assert.Error(t, err)
}

func TestDocumentService_ProcessPendingSummaries(t *testing.T) {
	t.Run("nil_ai", func(t *testing.T) {
		svc := newDocSvc(nil, nil, nil, nil, nil)
		err := svc.ProcessPendingSummaries(context.Background(), 0)
		assert.NoError(t, err)
	})

	t.Run("nil_summaries", func(t *testing.T) {
		mgr := &mockAIManager{maxInputCharFn: func() int { return 0 }}
		aiSvc := newTestAIService(mgr, nil, nil)
		svc := NewDocumentService(nil, nil, nil, nil, nil, nil, nil, nil, aiSvc, 10)
		err := svc.ProcessPendingSummaries(context.Background(), 0)
		assert.NoError(t, err)
	})

	t.Run("list_error", func(t *testing.T) {
		mgr := &mockAIManager{maxInputCharFn: func() int { return 0 }}
		aiSvc := newTestAIService(mgr, nil, nil)
		summaries := &mockDocumentSummaryRepo{
			listPendingDocumentsFn: func(context.Context, int, int64) ([]model.Document, error) {
				return nil, errors.New("db err")
			},
		}
		svc := NewDocumentService(nil, nil, summaries, nil, nil, nil, nil, nil, aiSvc, 10)
		err := svc.ProcessPendingSummaries(context.Background(), 60)
		assert.Error(t, err)
	})

	t.Run("empty_docs", func(t *testing.T) {
		mgr := &mockAIManager{maxInputCharFn: func() int { return 0 }}
		aiSvc := newTestAIService(mgr, nil, nil)
		summaries := &mockDocumentSummaryRepo{
			listPendingDocumentsFn: func(context.Context, int, int64) ([]model.Document, error) {
				return nil, nil
			},
		}
		svc := NewDocumentService(nil, nil, summaries, nil, nil, nil, nil, nil, aiSvc, 10)
		err := svc.ProcessPendingSummaries(context.Background(), 0)
		assert.NoError(t, err)
	})

	t.Run("ctx_canceled", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		mgr := &mockAIManager{maxInputCharFn: func() int { return 0 }}
		aiSvc := newTestAIService(mgr, nil, nil)
		summaries := &mockDocumentSummaryRepo{
			listPendingDocumentsFn: func(context.Context, int, int64) ([]model.Document, error) {
				return []model.Document{{ID: "d1", UserID: "u1", Content: "short"}}, nil
			},
		}
		svc := NewDocumentService(nil, nil, summaries, nil, nil, nil, nil, nil, aiSvc, 10)
		err := svc.ProcessPendingSummaries(ctx, 0)
		assert.Error(t, err)
	})

	t.Run("short_content_marks_empty", func(t *testing.T) {
		mgr := &mockAIManager{
			summarizeFn:    func(context.Context, string) (string, error) { return "sum", nil },
			maxInputCharFn: func() int { return 0 },
		}
		aiSvc := newTestAIService(mgr, nil, nil)
		upserted := false
		summaries := &mockDocumentSummaryRepo{
			listPendingDocumentsFn: func(context.Context, int, int64) ([]model.Document, error) {
				return []model.Document{{ID: "d1", UserID: "u1", Content: "short"}}, nil
			},
			upsertFn: func(_ context.Context, _, _, summary string, _ int64) error {
				upserted = true
				assert.Empty(t, summary)
				return nil
			},
		}
		svc := NewDocumentService(nil, nil, summaries, nil, nil, nil, nil, nil, aiSvc, 10)
		err := svc.ProcessPendingSummaries(context.Background(), 0)
		assert.NoError(t, err)
		assert.True(t, upserted)
	})

	t.Run("summarize_rate_limit", func(t *testing.T) {
		longContent := strings.Repeat("a", 200)
		mgr := &mockAIManager{
			summarizeFn: func(context.Context, string) (string, error) {
				return "", errors.New("rate limit exceeded")
			},
			maxInputCharFn: func() int { return 0 },
		}
		aiSvc := newTestAIService(mgr, nil, nil)
		summaries := &mockDocumentSummaryRepo{
			listPendingDocumentsFn: func(context.Context, int, int64) ([]model.Document, error) {
				return []model.Document{{ID: "d1", UserID: "u1", Content: longContent}}, nil
			},
		}
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		svc := NewDocumentService(nil, nil, summaries, nil, nil, nil, nil, nil, aiSvc, 10)
		err := svc.ProcessPendingSummaries(ctx, 0)
		assert.Error(t, err)
	})

	t.Run("summarize_non_rate_limit_error", func(t *testing.T) {
		longContent := strings.Repeat("a", 200)
		mgr := &mockAIManager{
			summarizeFn: func(context.Context, string) (string, error) {
				return "", errors.New("internal error")
			},
			maxInputCharFn: func() int { return 0 },
		}
		aiSvc := newTestAIService(mgr, nil, nil)
		summaries := &mockDocumentSummaryRepo{
			listPendingDocumentsFn: func(context.Context, int, int64) ([]model.Document, error) {
				return []model.Document{{ID: "d1", UserID: "u1", Content: longContent}}, nil
			},
		}
		svc := NewDocumentService(nil, nil, summaries, nil, nil, nil, nil, nil, aiSvc, 10)
		err := svc.ProcessPendingSummaries(context.Background(), 0)
		assert.NoError(t, err)
	})

	t.Run("summarize_success", func(t *testing.T) {
		longContent := strings.Repeat("a", 200)
		mgr := &mockAIManager{
			summarizeFn:    func(context.Context, string) (string, error) { return "summary", nil },
			maxInputCharFn: func() int { return 0 },
		}
		aiSvc := newTestAIService(mgr, nil, nil)
		summaries := &mockDocumentSummaryRepo{
			listPendingDocumentsFn: func(context.Context, int, int64) ([]model.Document, error) {
				return []model.Document{{ID: "d1", UserID: "u1", Content: longContent}}, nil
			},
			upsertFn: func(context.Context, string, string, string, int64) error { return nil },
		}
		svc := NewDocumentService(nil, nil, summaries, nil, nil, nil, nil, nil, aiSvc, 10)
		err := svc.ProcessPendingSummaries(context.Background(), 0)
		assert.NoError(t, err)
	})
}

func TestDocumentService_Create_Errors(t *testing.T) {
	t.Run("create_doc_error", func(t *testing.T) {
		docs := &mockDocumentRepo{
			createFn: func(context.Context, *model.Document) error { return errors.New("fail") },
		}
		svc := newDocSvc(docs, noopSummaryRepo(), nil, nil, nil)
		_, err := svc.Create(context.Background(), "u1", DocumentCreateInput{Title: "T", Content: "C"})
		assert.Error(t, err)
	})

	t.Run("summary_upsert_error", func(t *testing.T) {
		docs := &mockDocumentRepo{
			createFn: func(context.Context, *model.Document) error { return nil },
		}
		summaries := &mockDocumentSummaryRepo{
			upsertFn: func(context.Context, string, string, string, int64) error { return errors.New("fail") },
		}
		svc := newDocSvc(docs, summaries, nil, nil, nil)
		_, err := svc.Create(context.Background(), "u1", DocumentCreateInput{Title: "T", Content: "C", Summary: "S"})
		assert.Error(t, err)
	})

	t.Run("version_create_error", func(t *testing.T) {
		docs := &mockDocumentRepo{
			createFn: func(context.Context, *model.Document) error { return nil },
		}
		versions := &mockVersionRepo{
			createFn: func(context.Context, *model.DocumentVersion) error { return errors.New("fail") },
		}
		svc := newDocSvc(docs, noopSummaryRepo(), versions, nil, nil)
		_, err := svc.Create(context.Background(), "u1", DocumentCreateInput{Title: "T", Content: "C"})
		assert.Error(t, err)
	})

	t.Run("prune_error", func(t *testing.T) {
		docs := &mockDocumentRepo{
			createFn: func(context.Context, *model.Document) error { return nil },
		}
		versions := &mockVersionRepo{
			createFn:            func(context.Context, *model.DocumentVersion) error { return nil },
			deleteOldVersionsFn: func(context.Context, string, string, int) error { return errors.New("fail") },
		}
		svc := newDocSvc(docs, noopSummaryRepo(), versions, nil, nil)
		_, err := svc.Create(context.Background(), "u1", DocumentCreateInput{Title: "T", Content: "C"})
		assert.Error(t, err)
	})

	t.Run("tag_delete_error", func(t *testing.T) {
		docs := &mockDocumentRepo{
			createFn:      func(context.Context, *model.Document) error { return nil },
			updateLinksFn: func(context.Context, string, string, []string, int64) error { return nil },
		}
		versions := &mockVersionRepo{
			createFn:            func(context.Context, *model.DocumentVersion) error { return nil },
			deleteOldVersionsFn: func(context.Context, string, string, int) error { return nil },
		}
		tags := &mockDocumentTagRepo{
			deleteByDocFn: func(context.Context, string, string) error { return errors.New("fail") },
		}
		svc := newDocSvc(docs, noopSummaryRepo(), versions, tags, nil)
		_, err := svc.Create(context.Background(), "u1", DocumentCreateInput{Title: "T", Content: "C", TagIDs: []string{"t1"}})
		assert.Error(t, err)
	})

	t.Run("tag_add_error", func(t *testing.T) {
		docs := &mockDocumentRepo{
			createFn:      func(context.Context, *model.Document) error { return nil },
			updateLinksFn: func(context.Context, string, string, []string, int64) error { return nil },
		}
		versions := &mockVersionRepo{
			createFn:            func(context.Context, *model.DocumentVersion) error { return nil },
			deleteOldVersionsFn: func(context.Context, string, string, int) error { return nil },
		}
		tags := &mockDocumentTagRepo{
			deleteByDocFn: func(context.Context, string, string) error { return nil },
			addFn:         func(context.Context, *model.DocumentTag) error { return errors.New("fail") },
		}
		svc := newDocSvc(docs, noopSummaryRepo(), versions, tags, nil)
		_, err := svc.Create(context.Background(), "u1", DocumentCreateInput{Title: "T", Content: "C", TagIDs: []string{"t1"}})
		assert.Error(t, err)
	})

	t.Run("link_update_error", func(t *testing.T) {
		docs := &mockDocumentRepo{
			createFn:      func(context.Context, *model.Document) error { return nil },
			updateLinksFn: func(context.Context, string, string, []string, int64) error { return errors.New("fail") },
		}
		versions := &mockVersionRepo{
			createFn:            func(context.Context, *model.DocumentVersion) error { return nil },
			deleteOldVersionsFn: func(context.Context, string, string, int) error { return nil },
		}
		svc := newDocSvc(docs, noopSummaryRepo(), versions, nil, nil)
		_, err := svc.Create(context.Background(), "u1", DocumentCreateInput{Title: "T", Content: "C"})
		assert.Error(t, err)
	})

	t.Run("asset_sync_error", func(t *testing.T) {
		docs := &mockDocumentRepo{
			createFn:      func(context.Context, *model.Document) error { return nil },
			updateLinksFn: func(context.Context, string, string, []string, int64) error { return nil },
		}
		versions := &mockVersionRepo{
			createFn:            func(context.Context, *model.DocumentVersion) error { return nil },
			deleteOldVersionsFn: func(context.Context, string, string, int) error { return nil },
		}
		docAssets := &mockDocumentAssetRepo{
			replaceByDocumentFn: func(context.Context, string, string, []string, int64) error { return errors.New("fail") },
		}
		assetSvc := NewAssetService(&mockAssetRepo{}, docAssets)
		svc := newDocSvc(docs, noopSummaryRepo(), versions, nil, nil)
		svc.SetAssetService(assetSvc)
		_, err := svc.Create(context.Background(), "u1", DocumentCreateInput{Title: "T", Content: "C"})
		assert.Error(t, err)
	})

	t.Run("success_full_flow", func(t *testing.T) {
		docs := &mockDocumentRepo{
			createFn:      func(context.Context, *model.Document) error { return nil },
			updateLinksFn: func(context.Context, string, string, []string, int64) error { return nil },
		}
		versions := &mockVersionRepo{
			createFn:            func(context.Context, *model.DocumentVersion) error { return nil },
			deleteOldVersionsFn: func(context.Context, string, string, int) error { return nil },
		}
		tags := &mockDocumentTagRepo{
			deleteByDocFn: func(context.Context, string, string) error { return nil },
			addFn:         func(context.Context, *model.DocumentTag) error { return nil },
		}
		summaries := &mockDocumentSummaryRepo{
			upsertFn: func(context.Context, string, string, string, int64) error { return nil },
			getByDocIDFn: func(context.Context, string, string) (string, error) {
				return "", appErr.ErrNotFound
			},
		}
		svc := newDocSvc(docs, summaries, versions, tags, nil)
		doc, err := svc.Create(context.Background(), "u1", DocumentCreateInput{
			Title: "T", Content: "C", Summary: "S", TagIDs: []string{"t1"},
		})
		require.NoError(t, err)
		assert.NotEmpty(t, doc.ID)
		assert.Equal(t, "S", doc.Summary)
	})
}

func TestDocumentService_GetShareByToken_Errors(t *testing.T) {
	activeShare := &model.Share{
		ID: "s1", UserID: "u1", DocumentID: "d1",
		State: repo.ShareStateActive, Permission: repo.SharePermissionView,
	}

	t.Run("doc_get_error", func(t *testing.T) {
		shares := &mockShareRepo{
			getByTokenFn: func(context.Context, string) (*model.Share, error) { return activeShare, nil },
		}
		docs := &mockDocumentRepo{
			getByIDFn: func(context.Context, string, string) (*model.Document, error) {
				return nil, errors.New("fail")
			},
		}
		svc := newDocSvc(docs, nil, nil, nil, shares)
		_, err := svc.GetShareByToken(context.Background(), "tok", "")
		assert.Error(t, err)
	})

	t.Run("user_get_error", func(t *testing.T) {
		shares := &mockShareRepo{
			getByTokenFn: func(context.Context, string) (*model.Share, error) { return activeShare, nil },
		}
		docs := &mockDocumentRepo{
			getByIDFn: func(context.Context, string, string) (*model.Document, error) {
				return &model.Document{ID: "d1"}, nil
			},
		}
		users := &mockUserRepo{
			getByIDFn: func(context.Context, string) (*model.User, error) { return nil, errors.New("fail") },
		}
		svc := NewDocumentService(nil, docs, nil, nil, nil, shares, nil, users, nil, 10)
		_, err := svc.GetShareByToken(context.Background(), "tok", "")
		assert.Error(t, err)
	})

	t.Run("tag_ids_error", func(t *testing.T) {
		shares := &mockShareRepo{
			getByTokenFn: func(context.Context, string) (*model.Share, error) { return activeShare, nil },
		}
		docs := &mockDocumentRepo{
			getByIDFn: func(context.Context, string, string) (*model.Document, error) {
				return &model.Document{ID: "d1"}, nil
			},
		}
		users := &mockUserRepo{
			getByIDFn: func(context.Context, string) (*model.User, error) {
				return &model.User{ID: "u1", Email: "a@b.com"}, nil
			},
		}
		docTags := &mockDocumentTagRepo{
			listTagIDsFn: func(context.Context, string, string) ([]string, error) { return nil, errors.New("fail") },
		}
		svc := NewDocumentService(nil, docs, nil, nil, docTags, shares, nil, users, nil, 10)
		_, err := svc.GetShareByToken(context.Background(), "tok", "")
		assert.Error(t, err)
	})

	t.Run("tag_repo_error", func(t *testing.T) {
		shares := &mockShareRepo{
			getByTokenFn: func(context.Context, string) (*model.Share, error) { return activeShare, nil },
		}
		docs := &mockDocumentRepo{
			getByIDFn: func(context.Context, string, string) (*model.Document, error) {
				return &model.Document{ID: "d1"}, nil
			},
		}
		users := &mockUserRepo{
			getByIDFn: func(context.Context, string) (*model.User, error) {
				return &model.User{ID: "u1", Email: "a@b.com"}, nil
			},
		}
		docTags := &mockDocumentTagRepo{
			listTagIDsFn: func(context.Context, string, string) ([]string, error) { return []string{"t1"}, nil },
		}
		tagRepo := &mockTagRepo{
			listByIDsFn: func(context.Context, string, []string) ([]model.Tag, error) { return nil, errors.New("fail") },
		}
		svc := NewDocumentService(nil, docs, nil, nil, docTags, shares, tagRepo, users, nil, 10)
		_, err := svc.GetShareByToken(context.Background(), "tok", "")
		assert.Error(t, err)
	})

	t.Run("success", func(t *testing.T) {
		shares := &mockShareRepo{
			getByTokenFn: func(context.Context, string) (*model.Share, error) { return activeShare, nil },
		}
		docs := &mockDocumentRepo{
			getByIDFn: func(context.Context, string, string) (*model.Document, error) {
				return &model.Document{ID: "d1", Title: "Note"}, nil
			},
		}
		users := &mockUserRepo{
			getByIDFn: func(context.Context, string) (*model.User, error) {
				return &model.User{ID: "u1", Email: "a@b.com"}, nil
			},
		}
		docTags := &mockDocumentTagRepo{
			listTagIDsFn: func(context.Context, string, string) ([]string, error) { return []string{"t1"}, nil },
		}
		tagRepo := &mockTagRepo{
			listByIDsFn: func(context.Context, string, []string) ([]model.Tag, error) {
				return []model.Tag{{ID: "t1", Name: "go"}}, nil
			},
		}
		svc := NewDocumentService(nil, docs, nil, nil, docTags, shares, tagRepo, users, nil, 10)
		detail, err := svc.GetShareByToken(context.Background(), "tok", "")
		require.NoError(t, err)
		assert.Equal(t, "a@b.com", detail.Author)
		assert.Len(t, detail.Tags, 1)
	})
}

func TestDocumentService_GetBacklinks_Error(t *testing.T) {
	docs := &mockDocumentRepo{
		getBacklinksFn: func(context.Context, string, string) ([]model.Document, error) {
			return nil, errors.New("fail")
		},
	}
	svc := newDocSvc(docs, nil, nil, nil, nil)
	_, err := svc.GetBacklinks(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestDocumentService_GetBacklinks_Success(t *testing.T) {
	docs := &mockDocumentRepo{
		getBacklinksFn: func(context.Context, string, string) ([]model.Document, error) {
			return []model.Document{{ID: "d2"}}, nil
		},
	}
	summaries := &mockDocumentSummaryRepo{
		listByDocIDsFn: func(context.Context, string, []string) (map[string]string, error) {
			return map[string]string{"d2": "sum"}, nil
		},
	}
	svc := newDocSvc(docs, summaries, nil, nil, nil)
	result, err := svc.GetBacklinks(context.Background(), "u1", "d1")
	require.NoError(t, err)
	assert.Len(t, result, 1)
	assert.Equal(t, "sum", result[0].Summary)
}

func TestDocumentService_Delete_DocError(t *testing.T) {
	docs := &mockDocumentRepo{
		deleteFn: func(context.Context, string, string, int64) error { return errors.New("fail") },
	}
	svc := newDocSvc(docs, nil, nil, nil, nil)
	err := svc.Delete(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestDocumentService_Delete_Success(t *testing.T) {
	docs := &mockDocumentRepo{
		deleteFn: func(context.Context, string, string, int64) error { return nil },
	}
	shares := &mockShareRepo{
		revokeByDocumentFn: func(context.Context, string, string, int64) error { return nil },
	}
	tags := &mockDocumentTagRepo{
		deleteByDocFn: func(context.Context, string, string) error { return nil },
	}
	svc := newDocSvc(docs, nil, nil, tags, shares)
	err := svc.Delete(context.Background(), "u1", "d1")
	assert.NoError(t, err)
}

func TestDocumentService_Search_ListError(t *testing.T) {
	docs := &mockDocumentRepo{
		listFn: func(context.Context, string, *int, uint, uint, string) ([]model.Document, error) {
			return nil, errors.New("fail")
		},
	}
	svc := newDocSvc(docs, noopSummaryRepo(), nil, nil, nil)
	_, err := svc.Search(context.Background(), "u1", "", "", nil, 10, 0, "")
	assert.Error(t, err)
}

func TestDocumentService_Search_AttachSummariesError(t *testing.T) {
	docs := &mockDocumentRepo{
		listFn: func(context.Context, string, *int, uint, uint, string) ([]model.Document, error) {
			return []model.Document{{ID: "d1"}}, nil
		},
	}
	summaries := &mockDocumentSummaryRepo{
		listByDocIDsFn: func(context.Context, string, []string) (map[string]string, error) {
			return nil, errors.New("fail")
		},
	}
	svc := newDocSvc(docs, summaries, nil, nil, nil)
	_, err := svc.Search(context.Background(), "u1", "", "", nil, 10, 0, "")
	assert.Error(t, err)
}

func TestDocumentService_Summary_StarredCountError(t *testing.T) {
	callCount := 0
	docs := &mockDocumentRepo{
		listFn: func(context.Context, string, *int, uint, uint, string) ([]model.Document, error) {
			return nil, nil
		},
		countFn: func(_ context.Context, _ string, starred *int) (int, error) {
			callCount++
			if callCount == 2 {
				return 0, errors.New("fail")
			}
			return 10, nil
		},
	}
	tags := &mockDocumentTagRepo{
		listByUserFn: func(context.Context, string) ([]model.DocumentTag, error) { return nil, nil },
	}
	svc := newDocSvc(docs, noopSummaryRepo(), nil, tags, nil)
	_, err := svc.Summary(context.Background(), "u1", 5)
	assert.Error(t, err)
}

func TestDocumentService_ListShareCommentsByToken_Errors(t *testing.T) {
	activeShare := &model.Share{
		ID: "s1", UserID: "u1", DocumentID: "d1",
		State: repo.ShareStateActive, Permission: repo.SharePermissionComment,
	}

	t.Run("count_error", func(t *testing.T) {
		shares := &mockShareRepo{
			getByTokenFn: func(context.Context, string) (*model.Share, error) { return activeShare, nil },
			countRootCommentsByShareFn: func(context.Context, string) (int, error) {
				return 0, errors.New("fail")
			},
		}
		svc := newDocSvc(nil, nil, nil, nil, shares)
		_, err := svc.ListShareCommentsByToken(context.Background(), "tok", "", 10, 0)
		assert.Error(t, err)
	})

	t.Run("list_error", func(t *testing.T) {
		shares := &mockShareRepo{
			getByTokenFn:               func(context.Context, string) (*model.Share, error) { return activeShare, nil },
			countRootCommentsByShareFn: func(context.Context, string) (int, error) { return 5, nil },
			listCommentsByShareFn: func(context.Context, string, int, int) ([]model.ShareComment, error) {
				return nil, errors.New("fail")
			},
		}
		svc := newDocSvc(nil, nil, nil, nil, shares)
		_, err := svc.ListShareCommentsByToken(context.Background(), "tok", "", 10, 0)
		assert.Error(t, err)
	})

	t.Run("count_replies_error", func(t *testing.T) {
		shares := &mockShareRepo{
			getByTokenFn:               func(context.Context, string) (*model.Share, error) { return activeShare, nil },
			countRootCommentsByShareFn: func(context.Context, string) (int, error) { return 5, nil },
			listCommentsByShareFn: func(context.Context, string, int, int) ([]model.ShareComment, error) {
				return []model.ShareComment{{ID: "c1"}}, nil
			},
			countRepliesByRootIDsFn: func(context.Context, string, []string) (map[string]int, error) {
				return nil, errors.New("fail")
			},
		}
		svc := newDocSvc(nil, nil, nil, nil, shares)
		_, err := svc.ListShareCommentsByToken(context.Background(), "tok", "", 10, 0)
		assert.Error(t, err)
	})

	t.Run("list_replies_error", func(t *testing.T) {
		shares := &mockShareRepo{
			getByTokenFn:               func(context.Context, string) (*model.Share, error) { return activeShare, nil },
			countRootCommentsByShareFn: func(context.Context, string) (int, error) { return 5, nil },
			listCommentsByShareFn: func(context.Context, string, int, int) ([]model.ShareComment, error) {
				return []model.ShareComment{{ID: "c1"}}, nil
			},
			countRepliesByRootIDsFn: func(context.Context, string, []string) (map[string]int, error) {
				return map[string]int{"c1": 2}, nil
			},
			listRepliesByRootIDsFn: func(context.Context, string, []string) ([]model.ShareComment, error) {
				return nil, errors.New("fail")
			},
		}
		svc := newDocSvc(nil, nil, nil, nil, shares)
		_, err := svc.ListShareCommentsByToken(context.Background(), "tok", "", 10, 0)
		assert.Error(t, err)
	})
}

func TestDocumentService_ListShareCommentRepliesByToken_Errors(t *testing.T) {
	activeShare := &model.Share{
		ID: "s1", UserID: "u1", DocumentID: "d1",
		State: repo.ShareStateActive, Permission: repo.SharePermissionComment,
	}

	t.Run("root_not_found", func(t *testing.T) {
		shares := &mockShareRepo{
			getByTokenFn: func(context.Context, string) (*model.Share, error) { return activeShare, nil },
			getCommentByIDFn: func(context.Context, string) (*model.ShareComment, error) {
				return nil, errors.New("fail")
			},
		}
		svc := newDocSvc(nil, nil, nil, nil, shares)
		_, err := svc.ListShareCommentRepliesByToken(context.Background(), "tok", "", "c1", 10, 0)
		assert.Error(t, err)
	})

	t.Run("wrong_share", func(t *testing.T) {
		shares := &mockShareRepo{
			getByTokenFn: func(context.Context, string) (*model.Share, error) { return activeShare, nil },
			getCommentByIDFn: func(context.Context, string) (*model.ShareComment, error) {
				return &model.ShareComment{ID: "c1", ShareID: "other-share"}, nil
			},
		}
		svc := newDocSvc(nil, nil, nil, nil, shares)
		_, err := svc.ListShareCommentRepliesByToken(context.Background(), "tok", "", "c1", 10, 0)
		assert.ErrorIs(t, err, appErr.ErrNotFound)
	})

	t.Run("list_replies_error", func(t *testing.T) {
		shares := &mockShareRepo{
			getByTokenFn: func(context.Context, string) (*model.Share, error) { return activeShare, nil },
			getCommentByIDFn: func(context.Context, string) (*model.ShareComment, error) {
				return &model.ShareComment{ID: "c1", ShareID: "s1"}, nil
			},
			listRepliesByRootIDFn: func(context.Context, string, string, int, int) ([]model.ShareComment, error) {
				return nil, errors.New("fail")
			},
		}
		svc := newDocSvc(nil, nil, nil, nil, shares)
		_, err := svc.ListShareCommentRepliesByToken(context.Background(), "tok", "", "c1", 10, 0)
		assert.Error(t, err)
	})

	t.Run("nil_replies_returns_empty", func(t *testing.T) {
		shares := &mockShareRepo{
			getByTokenFn: func(context.Context, string) (*model.Share, error) { return activeShare, nil },
			getCommentByIDFn: func(context.Context, string) (*model.ShareComment, error) {
				return &model.ShareComment{ID: "c1", ShareID: "s1"}, nil
			},
			listRepliesByRootIDFn: func(context.Context, string, string, int, int) ([]model.ShareComment, error) {
				return nil, nil
			},
		}
		svc := newDocSvc(nil, nil, nil, nil, shares)
		result, err := svc.ListShareCommentRepliesByToken(context.Background(), "tok", "", "c1", 10, 0)
		require.NoError(t, err)
		assert.Empty(t, result)
	})
}

func TestDocumentService_CreateShareCommentByToken_Errors(t *testing.T) {
	activeShare := &model.Share{
		ID: "s1", DocumentID: "d1", State: repo.ShareStateActive,
		Permission: repo.SharePermissionComment,
	}

	t.Run("view_only_forbidden", func(t *testing.T) {
		viewShare := *activeShare
		viewShare.Permission = repo.SharePermissionView
		shares := &mockShareRepo{
			getByTokenFn: func(context.Context, string) (*model.Share, error) { return &viewShare, nil },
		}
		svc := newDocSvc(nil, nil, nil, nil, shares)
		_, err := svc.CreateShareCommentByToken(context.Background(), CreateShareCommentInput{
			Token: "tok", Author: "A", Content: "Hi",
		})
		assert.ErrorIs(t, err, appErr.ErrForbidden)
	})

	t.Run("empty_content", func(t *testing.T) {
		shares := &mockShareRepo{
			getByTokenFn: func(context.Context, string) (*model.Share, error) { return activeShare, nil },
		}
		svc := newDocSvc(nil, nil, nil, nil, shares)
		_, err := svc.CreateShareCommentByToken(context.Background(), CreateShareCommentInput{
			Token: "tok", Author: "A", Content: "",
		})
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})

	t.Run("reply_to_wrong_share_ignored", func(t *testing.T) {
		var capturedRootID string
		shares := &mockShareRepo{
			getByTokenFn: func(context.Context, string) (*model.Share, error) { return activeShare, nil },
			getCommentByIDFn: func(context.Context, string) (*model.ShareComment, error) {
				return &model.ShareComment{ID: "c1", ShareID: "other"}, nil
			},
			createCommentFn: func(_ context.Context, c *model.ShareComment) error {
				capturedRootID = c.RootID
				return nil
			},
		}
		svc := newDocSvc(nil, nil, nil, nil, shares)
		comment, err := svc.CreateShareCommentByToken(context.Background(), CreateShareCommentInput{
			Token: "tok", Author: "A", Content: "Hi", ReplyToID: "c1",
		})
		require.NoError(t, err)
		assert.Empty(t, capturedRootID)
		assert.NotNil(t, comment)
	})
}

func TestDocumentService_ResolveAccessibleShareByToken(t *testing.T) {
	t.Run("inactive_share", func(t *testing.T) {
		shares := &mockShareRepo{
			getByTokenFn: func(context.Context, string) (*model.Share, error) {
				return &model.Share{ID: "s1", State: repo.ShareStateRevoked}, nil
			},
		}
		svc := newDocSvc(nil, nil, nil, nil, shares)
		_, err := svc.GetShareByToken(context.Background(), "tok", "")
		assert.Error(t, err)
	})

	t.Run("expired_share", func(t *testing.T) {
		shares := &mockShareRepo{
			getByTokenFn: func(context.Context, string) (*model.Share, error) {
				return &model.Share{ID: "s1", State: repo.ShareStateActive, ExpiresAt: 1}, nil
			},
		}
		svc := newDocSvc(nil, nil, nil, nil, shares)
		_, err := svc.GetShareByToken(context.Background(), "tok", "")
		assert.Error(t, err)
	})

	t.Run("password_required", func(t *testing.T) {
		shares := &mockShareRepo{
			getByTokenFn: func(context.Context, string) (*model.Share, error) {
				return &model.Share{
					ID: "s1", State: repo.ShareStateActive, PasswordHash: "secret",
				}, nil
			},
		}
		svc := newDocSvc(nil, nil, nil, nil, shares)
		_, err := svc.GetShareByToken(context.Background(), "tok", "")
		assert.Error(t, err)
	})

	t.Run("password_bcrypt_match", func(t *testing.T) {
		hashed, hashErr := password.Hash("secret")
		require.NoError(t, hashErr)
		shares := &mockShareRepo{
			getByTokenFn: func(context.Context, string) (*model.Share, error) {
				return &model.Share{
					ID: "s1", UserID: "u1", DocumentID: "d1",
					State: repo.ShareStateActive, PasswordHash: hashed,
				}, nil
			},
		}
		docs := &mockDocumentRepo{
			getByIDFn: func(context.Context, string, string) (*model.Document, error) {
				return &model.Document{ID: "d1"}, nil
			},
		}
		users := &mockUserRepo{
			getByIDFn: func(context.Context, string) (*model.User, error) {
				return &model.User{ID: "u1", Email: "a@b.com"}, nil
			},
		}
		docTags := &mockDocumentTagRepo{
			listTagIDsFn: func(context.Context, string, string) ([]string, error) { return nil, nil },
		}
		tagRepo := &mockTagRepo{
			listByIDsFn: func(context.Context, string, []string) ([]model.Tag, error) { return nil, nil },
		}
		svc := NewDocumentService(nil, docs, nil, nil, docTags, shares, tagRepo, users, nil, 10)
		detail, err := svc.GetShareByToken(context.Background(), "tok", "secret")
		require.NoError(t, err)
		assert.NotNil(t, detail)
	})
}

func TestDocumentService_UpdateSummary_TouchMtimeError(t *testing.T) {
	docs := &mockDocumentRepo{
		getByIDFn: func(context.Context, string, string) (*model.Document, error) {
			return &model.Document{ID: "d1"}, nil
		},
		touchMtimeFn: func(context.Context, string, string, int64) error { return errors.New("fail") },
	}
	summaries := &mockDocumentSummaryRepo{
		upsertFn: func(context.Context, string, string, string, int64) error { return nil },
	}
	svc := newDocSvc(docs, summaries, nil, nil, nil)
	err := svc.UpdateSummary(context.Background(), "u1", "d1", "sum")
	assert.Error(t, err)
}

func TestDocumentService_UpdateShareConfig_InvalidExpiry(t *testing.T) {
	docs := &mockDocumentRepo{
		getByIDFn: func(context.Context, string, string) (*model.Document, error) {
			return &model.Document{ID: "d1"}, nil
		},
	}
	shares := &mockShareRepo{
		getActiveByDocumentFn: func(context.Context, string, string) (*model.Share, error) {
			return &model.Share{ID: "s1", Permission: 1}, nil
		},
	}
	svc := newDocSvc(docs, nil, nil, nil, shares)
	_, err := svc.UpdateShareConfig(context.Background(), "u1", "d1", ShareConfigInput{
		Permission: repo.SharePermissionView, ExpiresAt: -1,
	})
	assert.ErrorIs(t, err, appErr.ErrInvalid)
}

func TestDocumentService_SemanticSearch_Errors(t *testing.T) {
	t.Run("empty_query", func(t *testing.T) {
		svc := newDocSvc(nil, nil, nil, nil, nil)
		docs, scores, err := svc.SemanticSearch(context.Background(), "u1", "", "", nil, 10, 0, "", "")
		require.NoError(t, err)
		assert.Empty(t, docs)
		assert.Empty(t, scores)
	})

	t.Run("nil_ai", func(t *testing.T) {
		svc := newDocSvc(nil, nil, nil, nil, nil)
		docs, scores, err := svc.SemanticSearch(context.Background(), "u1", "query", "", nil, 10, 0, "", "")
		require.NoError(t, err)
		assert.Empty(t, docs)
		assert.Empty(t, scores)
	})

	t.Run("list_by_ids_error", func(t *testing.T) {
		mgr := &mockAIManager{
			embedFn: func(context.Context, string, string) ([]float32, error) { return []float32{0.1}, nil },
		}
		emb := &mockEmbeddingRepo{
			searchChunksFn: func(context.Context, string, []float32, float32, int) ([]repo.ChunkSearchResult, error) {
				return []repo.ChunkSearchResult{{DocumentID: "d1", Score: 0.9, ChunkType: model.ChunkTypeText}}, nil
			},
		}
		aiSvc := newTestAIService(mgr, emb, nil)
		docRepo := &mockDocumentRepo{
			listByIDsFn: func(context.Context, string, []string) ([]model.Document, error) {
				return nil, errors.New("fail")
			},
		}
		svc := NewDocumentService(nil, docRepo, noopSummaryRepo(), nil, nil, nil, nil, nil, aiSvc, 10)
		_, _, err := svc.SemanticSearch(context.Background(), "u1", "query", "", nil, 10, 0, "", "")
		assert.Error(t, err)
	})

	t.Run("offset_beyond_results", func(t *testing.T) {
		mgr := &mockAIManager{
			embedFn: func(context.Context, string, string) ([]float32, error) { return []float32{0.1}, nil },
		}
		emb := &mockEmbeddingRepo{
			searchChunksFn: func(context.Context, string, []float32, float32, int) ([]repo.ChunkSearchResult, error) {
				return []repo.ChunkSearchResult{{DocumentID: "d1", Score: 0.9, ChunkType: model.ChunkTypeText}}, nil
			},
		}
		aiSvc := newTestAIService(mgr, emb, nil)
		docRepo := &mockDocumentRepo{
			listByIDsFn: func(context.Context, string, []string) ([]model.Document, error) {
				return []model.Document{{ID: "d1"}}, nil
			},
		}
		summaries := &mockDocumentSummaryRepo{
			listByDocIDsFn: func(context.Context, string, []string) (map[string]string, error) {
				return nil, nil
			},
		}
		svc := NewDocumentService(nil, docRepo, summaries, nil, nil, nil, nil, nil, aiSvc, 10)
		docs, scores, err := svc.SemanticSearch(context.Background(), "u1", "query", "", nil, 10, 100, "", "")
		require.NoError(t, err)
		assert.Empty(t, docs)
		assert.Empty(t, scores)
	})
}

func TestDocumentService_ListByTag_EmptyIDs(t *testing.T) {
	tags := &mockDocumentTagRepo{
		listDocIDsByTagFn: func(context.Context, string, string) ([]string, error) {
			return nil, nil
		},
	}
	docs := &mockDocumentRepo{
		listByIDsFn: func(context.Context, string, []string) ([]model.Document, error) {
			return nil, nil
		},
	}
	svc := newDocSvc(docs, noopSummaryRepo(), nil, tags, nil)
	result, err := svc.ListByTag(context.Background(), "u1", "t1")
	require.NoError(t, err)
	assert.Empty(t, result)
}

func TestDocumentService_ListShareCommentsByToken(t *testing.T) {
	t.Run("success_with_replies", func(t *testing.T) {
		shares := &mockShareRepo{
			getByTokenFn: func(context.Context, string) (*model.Share, error) {
				return &model.Share{
					ID: "s1", State: repo.ShareStateActive,
				}, nil
			},
			countRootCommentsByShareFn: func(context.Context, string) (int, error) {
				return 1, nil
			},
			listCommentsByShareFn: func(context.Context, string, int, int) ([]model.ShareComment, error) {
				return []model.ShareComment{{ID: "c1", ShareID: "s1"}}, nil
			},
			countRepliesByRootIDsFn: func(context.Context, string, []string) (map[string]int, error) {
				return map[string]int{"c1": 2}, nil
			},
			listRepliesByRootIDsFn: func(_ context.Context, _ string, _ []string) ([]model.ShareComment, error) {
				return []model.ShareComment{{ID: "r1", RootID: "c1"}}, nil
			},
		}
		svc := newDocSvc(nil, nil, nil, nil, shares)
		result, err := svc.ListShareCommentsByToken(context.Background(), "tok1", "", 10, 0)
		require.NoError(t, err)
		assert.Equal(t, 1, result.Total)
		assert.Len(t, result.Items, 1)
		assert.Equal(t, 2, result.Items[0].ReplyCount)
		assert.Len(t, result.Items[0].Replies, 1)
	})

	t.Run("empty_comments", func(t *testing.T) {
		shares := &mockShareRepo{
			getByTokenFn: func(context.Context, string) (*model.Share, error) {
				return &model.Share{ID: "s1", State: repo.ShareStateActive}, nil
			},
			countRootCommentsByShareFn: func(context.Context, string) (int, error) {
				return 0, nil
			},
			listCommentsByShareFn: func(context.Context, string, int, int) ([]model.ShareComment, error) {
				return nil, nil
			},
		}
		svc := newDocSvc(nil, nil, nil, nil, shares)
		result, err := svc.ListShareCommentsByToken(context.Background(), "tok1", "", 10, 0)
		require.NoError(t, err)
		assert.Equal(t, 0, result.Total)
		assert.Empty(t, result.Items)
	})
}

func TestDocumentService_ListShareCommentRepliesByToken(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		shares := &mockShareRepo{
			getByTokenFn: func(context.Context, string) (*model.Share, error) {
				return &model.Share{ID: "s1", State: repo.ShareStateActive}, nil
			},
			getCommentByIDFn: func(context.Context, string) (*model.ShareComment, error) {
				return &model.ShareComment{ID: "c1", ShareID: "s1"}, nil
			},
			listRepliesByRootIDFn: func(context.Context, string, string, int, int) ([]model.ShareComment, error) {
				return []model.ShareComment{{ID: "r1"}}, nil
			},
		}
		svc := newDocSvc(nil, nil, nil, nil, shares)
		result, err := svc.ListShareCommentRepliesByToken(context.Background(), "tok1", "", "c1", 10, 0)
		require.NoError(t, err)
		assert.Len(t, result, 1)
	})

	t.Run("wrong_share", func(t *testing.T) {
		shares := &mockShareRepo{
			getByTokenFn: func(context.Context, string) (*model.Share, error) {
				return &model.Share{ID: "s1", State: repo.ShareStateActive}, nil
			},
			getCommentByIDFn: func(context.Context, string) (*model.ShareComment, error) {
				return &model.ShareComment{ID: "c1", ShareID: "other"}, nil
			},
		}
		svc := newDocSvc(nil, nil, nil, nil, shares)
		_, err := svc.ListShareCommentRepliesByToken(context.Background(), "tok1", "", "c1", 10, 0)
		assert.ErrorIs(t, err, appErr.ErrNotFound)
	})

	t.Run("nil_replies", func(t *testing.T) {
		shares := &mockShareRepo{
			getByTokenFn: func(context.Context, string) (*model.Share, error) {
				return &model.Share{ID: "s1", State: repo.ShareStateActive}, nil
			},
			getCommentByIDFn: func(context.Context, string) (*model.ShareComment, error) {
				return &model.ShareComment{ID: "c1", ShareID: "s1"}, nil
			},
			listRepliesByRootIDFn: func(context.Context, string, string, int, int) ([]model.ShareComment, error) {
				return nil, nil
			},
		}
		svc := newDocSvc(nil, nil, nil, nil, shares)
		result, err := svc.ListShareCommentRepliesByToken(context.Background(), "tok1", "", "c1", 10, 0)
		require.NoError(t, err)
		assert.Empty(t, result)
	})
}

func TestDocumentService_ProcessOneSummary(t *testing.T) {
	t.Run("short_content_marks_empty", func(t *testing.T) {
		summaries := &mockDocumentSummaryRepo{
			upsertFn: func(_ context.Context, _, _, summary string, _ int64) error {
				assert.Empty(t, summary)
				return nil
			},
		}
		svc := newDocSvc(nil, summaries, nil, nil, nil)
		svc.ai = &AIService{}
		doc := model.Document{ID: "d1", UserID: "u1", Content: "short"}
		err := svc.processOneSummary(context.Background(), noopLogger(), doc)
		require.NoError(t, err)
	})

	t.Run("successful_summary", func(t *testing.T) {
		longContent := ""
		for i := 0; i < 200; i++ {
			longContent += "word "
		}
		mgr := &mockAIManager{
			summarizeFn: func(context.Context, string) (string, error) {
				return "AI summary", nil
			},
			maxInputCharFn: func() int { return 0 },
		}
		summaries := &mockDocumentSummaryRepo{
			upsertFn: func(_ context.Context, _, _, summary string, _ int64) error {
				assert.Equal(t, "AI summary", summary)
				return nil
			},
		}
		svc := newDocSvc(nil, summaries, nil, nil, nil)
		svc.ai = newTestAIService(mgr, nil, nil)
		doc := model.Document{ID: "d1", UserID: "u1", Content: longContent}
		err := svc.processOneSummary(context.Background(), noopLogger(), doc)
		require.NoError(t, err)
	})
}

func TestDocumentService_HandleSummaryError(t *testing.T) {
	svc := newDocSvc(nil, nil, nil, nil, nil)

	t.Run("rate_limit_error", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		err := svc.handleSummaryError(ctx, noopLogger(), "d1", errors.New("rate limit exceeded"))
		assert.Error(t, err)
	})

	t.Run("non_rate_limit_error", func(t *testing.T) {
		err := svc.handleSummaryError(context.Background(), noopLogger(), "d1", errors.New("some other error"))
		require.NoError(t, err)
	})
}

func TestDocumentService_UpdateShareConfig(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		docs := &mockDocumentRepo{
			getByIDFn: func(context.Context, string, string) (*model.Document, error) {
				return &model.Document{ID: "d1"}, nil
			},
		}
		shares := &mockShareRepo{
			getActiveByDocumentFn: func(context.Context, string, string) (*model.Share, error) {
				return &model.Share{ID: "s1", Permission: repo.SharePermissionView}, nil
			},
			updateConfigByDocumentFn: func(context.Context, string, string, int64, string, int, int, int64) error {
				return nil
			},
		}
		svc := newDocSvc(docs, nil, nil, nil, shares)
		result, err := svc.UpdateShareConfig(context.Background(), "u1", "d1", ShareConfigInput{
			Permission: repo.SharePermissionComment,
		})
		require.NoError(t, err)
		assert.NotNil(t, result)
	})

	t.Run("invalid_permission", func(t *testing.T) {
		docs := &mockDocumentRepo{
			getByIDFn: func(context.Context, string, string) (*model.Document, error) {
				return &model.Document{ID: "d1"}, nil
			},
		}
		shares := &mockShareRepo{
			getActiveByDocumentFn: func(context.Context, string, string) (*model.Share, error) {
				return &model.Share{ID: "s1"}, nil
			},
		}
		svc := newDocSvc(docs, nil, nil, nil, shares)
		_, err := svc.UpdateShareConfig(context.Background(), "u1", "d1", ShareConfigInput{
			Permission: 99,
		})
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})
}
