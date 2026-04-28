package service

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
)

func newExportSvc(
	docs documentRepo,
	summaries documentSummaryRepo,
	versions versionRepo,
	tags tagRepo,
	docTags documentTagRepo,
) *ExportService {
	return NewExportService(docs, summaries, versions, tags, docTags)
}

func TestExportService_Export(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		docs := &mockDocumentRepo{
			listFn: func(context.Context, string, *int, uint, uint, string) ([]model.Document, error) {
				return []model.Document{{ID: "d1", Title: "Note"}}, nil
			},
		}
		summaries := &mockDocumentSummaryRepo{
			listByDocIDsFn: func(context.Context, string, []string) (map[string]string, error) {
				return map[string]string{"d1": "summary"}, nil
			},
		}
		versions := &mockVersionRepo{
			listByUserFn: func(context.Context, string) ([]model.DocumentVersion, error) {
				return []model.DocumentVersion{{ID: "v1"}}, nil
			},
		}
		tags := &mockTagRepo{
			listFn: func(context.Context, string) ([]model.Tag, error) {
				return []model.Tag{{ID: "t1", Name: "go"}}, nil
			},
		}
		docTags := &mockDocumentTagRepo{
			listByUserFn: func(context.Context, string) ([]model.DocumentTag, error) {
				return []model.DocumentTag{{DocumentID: "d1", TagID: "t1"}}, nil
			},
		}
		svc := newExportSvc(docs, summaries, versions, tags, docTags)
		payload, err := svc.Export(context.Background(), "u1")
		require.NoError(t, err)
		assert.Len(t, payload.Documents, 1)
		assert.Equal(t, "summary", payload.Documents[0].Summary)
		assert.Len(t, payload.Versions, 1)
		assert.Len(t, payload.Tags, 1)
		assert.Len(t, payload.DocTags, 1)
	})

	t.Run("list_error", func(t *testing.T) {
		docs := &mockDocumentRepo{
			listFn: func(context.Context, string, *int, uint, uint, string) ([]model.Document, error) {
				return nil, errors.New("db error")
			},
		}
		svc := newExportSvc(docs, nil, nil, nil, nil)
		_, err := svc.Export(context.Background(), "u1")
		assert.Error(t, err)
	})

	t.Run("versions_error", func(t *testing.T) {
		docs := &mockDocumentRepo{
			listFn: func(context.Context, string, *int, uint, uint, string) ([]model.Document, error) {
				return nil, nil
			},
		}
		summaries := &mockDocumentSummaryRepo{
			listByDocIDsFn: func(context.Context, string, []string) (map[string]string, error) {
				return nil, nil
			},
		}
		versions := &mockVersionRepo{
			listByUserFn: func(context.Context, string) ([]model.DocumentVersion, error) {
				return nil, errors.New("db error")
			},
		}
		svc := newExportSvc(docs, summaries, versions, nil, nil)
		_, err := svc.Export(context.Background(), "u1")
		assert.Error(t, err)
	})

	t.Run("tags_error", func(t *testing.T) {
		docs := &mockDocumentRepo{
			listFn: func(context.Context, string, *int, uint, uint, string) ([]model.Document, error) {
				return nil, nil
			},
		}
		summaries := &mockDocumentSummaryRepo{
			listByDocIDsFn: func(context.Context, string, []string) (map[string]string, error) {
				return nil, nil
			},
		}
		versions := &mockVersionRepo{
			listByUserFn: func(context.Context, string) ([]model.DocumentVersion, error) {
				return nil, nil
			},
		}
		tags := &mockTagRepo{
			listFn: func(context.Context, string) ([]model.Tag, error) {
				return nil, errors.New("db error")
			},
		}
		svc := newExportSvc(docs, summaries, versions, tags, nil)
		_, err := svc.Export(context.Background(), "u1")
		assert.Error(t, err)
	})
}

func TestExportService_ExportNotesZip(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		docs := &mockDocumentRepo{
			listFn: func(context.Context, string, *int, uint, uint, string) ([]model.Document, error) {
				return []model.Document{
					{ID: "d1", Title: "Note 1", Content: "# Hello"},
					{ID: "d2", Title: "Note 2", Content: "World"},
				}, nil
			},
		}
		summaries := &mockDocumentSummaryRepo{
			listByDocIDsFn: func(context.Context, string, []string) (map[string]string, error) {
				return map[string]string{"d1": "s1"}, nil
			},
		}
		tags := &mockTagRepo{
			listFn: func(context.Context, string) ([]model.Tag, error) {
				return []model.Tag{{ID: "t1", Name: "go"}}, nil
			},
		}
		docTags := &mockDocumentTagRepo{
			listTagIDsByDocIDsFn: func(context.Context, string, []string) (map[string][]string, error) {
				return map[string][]string{"d1": {"t1"}}, nil
			},
		}
		svc := newExportSvc(docs, summaries, nil, tags, docTags)
		path, err := svc.ExportNotesZip(context.Background(), "u1")
		require.NoError(t, err)
		assert.NotEmpty(t, path)
		defer func() { _ = os.Remove(path) }()

		info, statErr := os.Stat(path)
		require.NoError(t, statErr)
		assert.True(t, info.Size() > 0)
	})

	t.Run("list_error", func(t *testing.T) {
		docs := &mockDocumentRepo{
			listFn: func(context.Context, string, *int, uint, uint, string) ([]model.Document, error) {
				return nil, errors.New("db error")
			},
		}
		svc := newExportSvc(docs, nil, nil, nil, nil)
		_, err := svc.ExportNotesZip(context.Background(), "u1")
		assert.Error(t, err)
	})

	t.Run("summaries_error", func(t *testing.T) {
		docs := &mockDocumentRepo{
			listFn: func(context.Context, string, *int, uint, uint, string) ([]model.Document, error) {
				return []model.Document{{ID: "d1"}}, nil
			},
		}
		summaries := &mockDocumentSummaryRepo{
			listByDocIDsFn: func(context.Context, string, []string) (map[string]string, error) {
				return nil, errors.New("db error")
			},
		}
		svc := newExportSvc(docs, summaries, nil, nil, nil)
		_, err := svc.ExportNotesZip(context.Background(), "u1")
		assert.Error(t, err)
	})

	t.Run("tags_error", func(t *testing.T) {
		docs := &mockDocumentRepo{
			listFn: func(context.Context, string, *int, uint, uint, string) ([]model.Document, error) {
				return nil, nil
			},
		}
		summaries := &mockDocumentSummaryRepo{
			listByDocIDsFn: func(context.Context, string, []string) (map[string]string, error) {
				return nil, nil
			},
		}
		tags := &mockTagRepo{
			listFn: func(context.Context, string) ([]model.Tag, error) {
				return nil, errors.New("db error")
			},
		}
		svc := newExportSvc(docs, summaries, nil, tags, nil)
		_, err := svc.ExportNotesZip(context.Background(), "u1")
		assert.Error(t, err)
	})

	t.Run("docTags_error", func(t *testing.T) {
		docs := &mockDocumentRepo{
			listFn: func(context.Context, string, *int, uint, uint, string) ([]model.Document, error) {
				return []model.Document{{ID: "d1"}}, nil
			},
		}
		summaries := &mockDocumentSummaryRepo{
			listByDocIDsFn: func(context.Context, string, []string) (map[string]string, error) {
				return nil, nil
			},
		}
		tags := &mockTagRepo{
			listFn: func(context.Context, string) ([]model.Tag, error) { return nil, nil },
		}
		docTags := &mockDocumentTagRepo{
			listTagIDsByDocIDsFn: func(context.Context, string, []string) (map[string][]string, error) {
				return nil, errors.New("db error")
			},
		}
		svc := newExportSvc(docs, summaries, nil, tags, docTags)
		_, err := svc.ExportNotesZip(context.Background(), "u1")
		assert.Error(t, err)
	})

	t.Run("duplicate_titles", func(t *testing.T) {
		docs := &mockDocumentRepo{
			listFn: func(context.Context, string, *int, uint, uint, string) ([]model.Document, error) {
				return []model.Document{
					{ID: "d1", Title: "Same Title", Content: "A"},
					{ID: "d2", Title: "Same Title", Content: "B"},
				}, nil
			},
		}
		summaries := &mockDocumentSummaryRepo{
			listByDocIDsFn: func(context.Context, string, []string) (map[string]string, error) {
				return nil, nil
			},
		}
		tags := &mockTagRepo{listFn: func(context.Context, string) ([]model.Tag, error) { return nil, nil }}
		docTags := &mockDocumentTagRepo{
			listTagIDsByDocIDsFn: func(context.Context, string, []string) (map[string][]string, error) {
				return nil, nil
			},
		}
		svc := newExportSvc(docs, summaries, nil, tags, docTags)
		path, err := svc.ExportNotesZip(context.Background(), "u1")
		require.NoError(t, err)
		assert.NotEmpty(t, path)
		defer func() { _ = os.Remove(path) }()
	})

	t.Run("empty_title", func(t *testing.T) {
		docs := &mockDocumentRepo{
			listFn: func(context.Context, string, *int, uint, uint, string) ([]model.Document, error) {
				return []model.Document{{ID: "d1", Title: "", Content: "C"}}, nil
			},
		}
		summaries := &mockDocumentSummaryRepo{
			listByDocIDsFn: func(context.Context, string, []string) (map[string]string, error) {
				return nil, nil
			},
		}
		tags := &mockTagRepo{listFn: func(context.Context, string) ([]model.Tag, error) { return nil, nil }}
		docTags := &mockDocumentTagRepo{
			listTagIDsByDocIDsFn: func(context.Context, string, []string) (map[string][]string, error) {
				return nil, nil
			},
		}
		svc := newExportSvc(docs, summaries, nil, tags, docTags)
		path, err := svc.ExportNotesZip(context.Background(), "u1")
		require.NoError(t, err)
		assert.NotEmpty(t, path)
		defer func() { _ = os.Remove(path) }()
	})
}

func TestExportService_Export_DocTagsError(t *testing.T) {
	docs := &mockDocumentRepo{
		listFn: func(context.Context, string, *int, uint, uint, string) ([]model.Document, error) {
			return nil, nil
		},
	}
	summaries := &mockDocumentSummaryRepo{
		listByDocIDsFn: func(context.Context, string, []string) (map[string]string, error) {
			return nil, nil
		},
	}
	versions := &mockVersionRepo{
		listByUserFn: func(context.Context, string) ([]model.DocumentVersion, error) { return nil, nil },
	}
	tags := &mockTagRepo{
		listFn: func(context.Context, string) ([]model.Tag, error) { return nil, nil },
	}
	docTags := &mockDocumentTagRepo{
		listByUserFn: func(context.Context, string) ([]model.DocumentTag, error) {
			return nil, errors.New("db error")
		},
	}
	svc := newExportSvc(docs, summaries, versions, tags, docTags)
	_, err := svc.Export(context.Background(), "u1")
	assert.Error(t, err)
}

func TestExportService_Export_SummaryError(t *testing.T) {
	docs := &mockDocumentRepo{
		listFn: func(context.Context, string, *int, uint, uint, string) ([]model.Document, error) {
			return []model.Document{{ID: "d1"}}, nil
		},
	}
	summaries := &mockDocumentSummaryRepo{
		listByDocIDsFn: func(context.Context, string, []string) (map[string]string, error) {
			return nil, errors.New("db error")
		},
	}
	svc := newExportSvc(docs, summaries, nil, nil, nil)
	_, err := svc.Export(context.Background(), "u1")
	assert.Error(t, err)
}

func TestExportService_ConvertMarkdownToConfluenceHTML(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		docs := &mockDocumentRepo{
			getByIDFn: func(context.Context, string, string) (*model.Document, error) {
				return &model.Document{ID: "d1", Content: "# Hello\n\nWorld"}, nil
			},
		}
		svc := newExportSvc(docs, nil, nil, nil, nil)
		html, err := svc.ConvertMarkdownToConfluenceHTML(context.Background(), "u1", "d1")
		require.NoError(t, err)
		assert.Contains(t, html, "Hello")
	})

	t.Run("doc_not_found", func(t *testing.T) {
		docs := &mockDocumentRepo{
			getByIDFn: func(context.Context, string, string) (*model.Document, error) {
				return nil, errors.New("not found")
			},
		}
		svc := newExportSvc(docs, nil, nil, nil, nil)
		_, err := svc.ConvertMarkdownToConfluenceHTML(context.Background(), "u1", "d1")
		assert.Error(t, err)
	})
}
