package service

import (
	"archive/zip"
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
)

func newExportSvc(
	docs documentRepo,
	versions versionRepo,
	tags tagRepo,
	docTags documentTagRepo,
) *ExportService {
	return NewExportService(docs, versions, tags, docTags)
}

func TestExportService_Export(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		docs := &mockDocumentRepo{
			listFn: func(context.Context, string, *int, uint, uint, string) ([]model.Document, error) {
				return []model.Document{{ID: "d1", Title: "Note"}}, nil
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
		svc := newExportSvc(docs, versions, tags, docTags)
		payload, err := svc.Export(context.Background(), "u1")
		require.NoError(t, err)
		assert.Len(t, payload.Documents, 1)
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
		svc := newExportSvc(docs, nil, nil, nil)
		_, err := svc.Export(context.Background(), "u1")
		assert.Error(t, err)
	})

	t.Run("versions_error", func(t *testing.T) {
		docs := &mockDocumentRepo{
			listFn: func(context.Context, string, *int, uint, uint, string) ([]model.Document, error) {
				return nil, nil
			},
		}
		versions := &mockVersionRepo{
			listByUserFn: func(context.Context, string) ([]model.DocumentVersion, error) {
				return nil, errors.New("db error")
			},
		}
		svc := newExportSvc(docs, versions, nil, nil)
		_, err := svc.Export(context.Background(), "u1")
		assert.Error(t, err)
	})

	t.Run("tags_error", func(t *testing.T) {
		docs := &mockDocumentRepo{
			listFn: func(context.Context, string, *int, uint, uint, string) ([]model.Document, error) {
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
		svc := newExportSvc(docs, versions, tags, nil)
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
		svc := newExportSvc(docs, nil, tags, docTags)
		path, err := svc.ExportNotesZip(context.Background(), "u1")
		require.NoError(t, err)
		assert.NotEmpty(t, path)
		defer func() { _ = os.Remove(path) }()

		info, statErr := os.Stat(path)
		require.NoError(t, statErr)
		assert.True(t, info.Size() > 0)

		archive, openErr := zip.OpenReader(path)
		require.NoError(t, openErr)
		defer func() { _ = archive.Close() }()
		require.NotEmpty(t, archive.File)
		exported, openFileErr := archive.File[0].Open()
		require.NoError(t, openFileErr)
		payloadBytes, readErr := io.ReadAll(exported)
		require.NoError(t, readErr)
		require.NoError(t, exported.Close())
		var payload map[string]any
		require.NoError(t, json.Unmarshal(payloadBytes, &payload))
		assert.NotContains(t, payload, "summary")
	})

	t.Run("list_error", func(t *testing.T) {
		docs := &mockDocumentRepo{
			listFn: func(context.Context, string, *int, uint, uint, string) ([]model.Document, error) {
				return nil, errors.New("db error")
			},
		}
		svc := newExportSvc(docs, nil, nil, nil)
		_, err := svc.ExportNotesZip(context.Background(), "u1")
		assert.Error(t, err)
	})

	t.Run("tags_error", func(t *testing.T) {
		docs := &mockDocumentRepo{
			listFn: func(context.Context, string, *int, uint, uint, string) ([]model.Document, error) {
				return nil, nil
			},
		}
		tags := &mockTagRepo{
			listFn: func(context.Context, string) ([]model.Tag, error) {
				return nil, errors.New("db error")
			},
		}
		svc := newExportSvc(docs, nil, tags, nil)
		_, err := svc.ExportNotesZip(context.Background(), "u1")
		assert.Error(t, err)
	})

	t.Run("docTags_error", func(t *testing.T) {
		docs := &mockDocumentRepo{
			listFn: func(context.Context, string, *int, uint, uint, string) ([]model.Document, error) {
				return []model.Document{{ID: "d1"}}, nil
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
		svc := newExportSvc(docs, nil, tags, docTags)
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
		tags := &mockTagRepo{listFn: func(context.Context, string) ([]model.Tag, error) { return nil, nil }}
		docTags := &mockDocumentTagRepo{
			listTagIDsByDocIDsFn: func(context.Context, string, []string) (map[string][]string, error) {
				return nil, nil
			},
		}
		svc := newExportSvc(docs, nil, tags, docTags)
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
		tags := &mockTagRepo{listFn: func(context.Context, string) ([]model.Tag, error) { return nil, nil }}
		docTags := &mockDocumentTagRepo{
			listTagIDsByDocIDsFn: func(context.Context, string, []string) (map[string][]string, error) {
				return nil, nil
			},
		}
		svc := newExportSvc(docs, nil, tags, docTags)
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
	svc := newExportSvc(docs, versions, tags, docTags)
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
		svc := newExportSvc(docs, nil, nil, nil)
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
		svc := newExportSvc(docs, nil, nil, nil)
		_, err := svc.ConvertMarkdownToConfluenceHTML(context.Background(), "u1", "d1")
		assert.Error(t, err)
	})
}
