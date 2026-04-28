package service

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

type mockTemplateRepo struct {
	createFn         func(ctx context.Context, tpl *model.Template) error
	updateFn         func(ctx context.Context, tpl *model.Template) error
	deleteFn         func(ctx context.Context, userID, templateID string) error
	getByIDFn        func(ctx context.Context, userID, templateID string) (*model.Template, error)
	listByUserFn     func(ctx context.Context, userID string) ([]model.Template, error)
	listMetaByUserFn func(ctx context.Context, userID string, limit, offset int) ([]model.TemplateMeta, error)
	countByUserFn    func(ctx context.Context, userID string) (int, error)
}

func (m *mockTemplateRepo) Create(ctx context.Context, tpl *model.Template) error {
	return m.createFn(ctx, tpl)
}

func (m *mockTemplateRepo) Update(ctx context.Context, tpl *model.Template) error {
	return m.updateFn(ctx, tpl)
}

func (m *mockTemplateRepo) Delete(ctx context.Context, userID, templateID string) error {
	return m.deleteFn(ctx, userID, templateID)
}

func (m *mockTemplateRepo) GetByID(ctx context.Context, userID, templateID string) (*model.Template, error) {
	return m.getByIDFn(ctx, userID, templateID)
}

func (m *mockTemplateRepo) ListByUser(ctx context.Context, userID string) ([]model.Template, error) {
	return m.listByUserFn(ctx, userID)
}

func (m *mockTemplateRepo) ListMetaByUser(ctx context.Context, userID string, limit, offset int) ([]model.TemplateMeta, error) {
	return m.listMetaByUserFn(ctx, userID, limit, offset)
}

func (m *mockTemplateRepo) CountByUser(ctx context.Context, userID string) (int, error) {
	return m.countByUserFn(ctx, userID)
}

func TestTemplateService_List(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		repo := &mockTemplateRepo{
			listByUserFn: func(context.Context, string) ([]model.Template, error) {
				return []model.Template{{ID: "t1", Name: "Note"}}, nil
			},
		}
		svc := NewTemplateService(repo, nil, nil)
		result, err := svc.List(context.Background(), "u1")
		require.NoError(t, err)
		assert.Len(t, result, 1)
	})

	t.Run("error", func(t *testing.T) {
		repo := &mockTemplateRepo{
			listByUserFn: func(context.Context, string) ([]model.Template, error) {
				return nil, errors.New("db error")
			},
		}
		svc := NewTemplateService(repo, nil, nil)
		_, err := svc.List(context.Background(), "u1")
		assert.Error(t, err)
	})
}

func TestTemplateService_ListMeta(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		repo := &mockTemplateRepo{
			countByUserFn: func(context.Context, string) (int, error) { return 5, nil },
			listMetaByUserFn: func(_ context.Context, _ string, limit, offset int) ([]model.TemplateMeta, error) {
				assert.Equal(t, 20, limit)
				assert.Equal(t, 0, offset)
				return []model.TemplateMeta{{ID: "t1"}}, nil
			},
		}
		svc := NewTemplateService(repo, nil, nil)
		result, err := svc.ListMeta(context.Background(), "u1", 0, -1)
		require.NoError(t, err)
		assert.Equal(t, 5, result.Total)
		assert.Len(t, result.Items, 1)
	})

	t.Run("clamp_limit", func(t *testing.T) {
		repo := &mockTemplateRepo{
			countByUserFn: func(context.Context, string) (int, error) { return 0, nil },
			listMetaByUserFn: func(_ context.Context, _ string, limit, _ int) ([]model.TemplateMeta, error) {
				assert.Equal(t, 200, limit)
				return nil, nil
			},
		}
		svc := NewTemplateService(repo, nil, nil)
		_, err := svc.ListMeta(context.Background(), "u1", 999, 0)
		require.NoError(t, err)
	})

	t.Run("count_error", func(t *testing.T) {
		repo := &mockTemplateRepo{
			countByUserFn: func(context.Context, string) (int, error) { return 0, errors.New("db error") },
		}
		svc := NewTemplateService(repo, nil, nil)
		_, err := svc.ListMeta(context.Background(), "u1", 10, 0)
		assert.Error(t, err)
	})

	t.Run("list_meta_error", func(t *testing.T) {
		repo := &mockTemplateRepo{
			countByUserFn: func(context.Context, string) (int, error) { return 5, nil },
			listMetaByUserFn: func(context.Context, string, int, int) ([]model.TemplateMeta, error) {
				return nil, errors.New("db error")
			},
		}
		svc := NewTemplateService(repo, nil, nil)
		_, err := svc.ListMeta(context.Background(), "u1", 10, 0)
		assert.Error(t, err)
	})
}

func TestTemplateService_Get(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		repo := &mockTemplateRepo{
			getByIDFn: func(context.Context, string, string) (*model.Template, error) {
				return &model.Template{ID: "t1", Name: "My Template"}, nil
			},
		}
		svc := NewTemplateService(repo, nil, nil)
		tpl, err := svc.Get(context.Background(), "u1", "t1")
		require.NoError(t, err)
		assert.Equal(t, "My Template", tpl.Name)
	})

	t.Run("error", func(t *testing.T) {
		repo := &mockTemplateRepo{
			getByIDFn: func(context.Context, string, string) (*model.Template, error) {
				return nil, errors.New("db error")
			},
		}
		svc := NewTemplateService(repo, nil, nil)
		_, err := svc.Get(context.Background(), "u1", "t1")
		assert.Error(t, err)
	})
}

func TestTemplateService_Create(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		repo := &mockTemplateRepo{
			createFn: func(_ context.Context, tpl *model.Template) error {
				assert.Equal(t, "u1", tpl.UserID)
				assert.Equal(t, "Note", tpl.Name)
				return nil
			},
		}
		svc := NewTemplateService(repo, nil, nil)
		tpl, err := svc.Create(context.Background(), "u1", CreateTemplateInput{
			Name:    "Note",
			Content: "# Hello",
		})
		require.NoError(t, err)
		assert.NotEmpty(t, tpl.ID)
	})

	t.Run("empty_name", func(t *testing.T) {
		svc := NewTemplateService(&mockTemplateRepo{}, nil, nil)
		_, err := svc.Create(context.Background(), "u1", CreateTemplateInput{Name: "", Content: "hello"})
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})

	t.Run("empty_content", func(t *testing.T) {
		svc := NewTemplateService(&mockTemplateRepo{}, nil, nil)
		_, err := svc.Create(context.Background(), "u1", CreateTemplateInput{Name: "Note", Content: "  "})
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})

	t.Run("normalizes_placeholders", func(t *testing.T) {
		repo := &mockTemplateRepo{
			createFn: func(_ context.Context, tpl *model.Template) error {
				assert.Contains(t, tpl.Content, "{{TITLE}}")
				return nil
			},
		}
		svc := NewTemplateService(repo, nil, nil)
		_, err := svc.Create(context.Background(), "u1", CreateTemplateInput{
			Name:    "Note",
			Content: "{{ title }}",
		})
		require.NoError(t, err)
	})

	t.Run("repo_error", func(t *testing.T) {
		repo := &mockTemplateRepo{
			createFn: func(context.Context, *model.Template) error { return errors.New("db error") },
		}
		svc := NewTemplateService(repo, nil, nil)
		_, err := svc.Create(context.Background(), "u1", CreateTemplateInput{Name: "N", Content: "C"})
		assert.Error(t, err)
	})

	t.Run("dedup_tag_ids", func(t *testing.T) {
		repo := &mockTemplateRepo{
			createFn: func(_ context.Context, tpl *model.Template) error {
				assert.Len(t, tpl.DefaultTagIDs, 1)
				return nil
			},
		}
		svc := NewTemplateService(repo, nil, nil)
		_, err := svc.Create(context.Background(), "u1", CreateTemplateInput{
			Name:          "Note",
			Content:       "hello",
			DefaultTagIDs: []string{"t1", "t1", " t1 "},
		})
		require.NoError(t, err)
	})
}

func TestTemplateService_Update(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		repo := &mockTemplateRepo{
			updateFn: func(_ context.Context, tpl *model.Template) error {
				assert.Equal(t, "tpl1", tpl.ID)
				assert.Equal(t, "Updated", tpl.Name)
				return nil
			},
		}
		svc := NewTemplateService(repo, nil, nil)
		err := svc.Update(context.Background(), "u1", "tpl1", UpdateTemplateInput{
			Name: "Updated", Content: "content",
		})
		require.NoError(t, err)
	})

	t.Run("empty_name", func(t *testing.T) {
		svc := NewTemplateService(&mockTemplateRepo{}, nil, nil)
		err := svc.Update(context.Background(), "u1", "tpl1", UpdateTemplateInput{Content: "c"})
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})

	t.Run("repo_error", func(t *testing.T) {
		repo := &mockTemplateRepo{
			updateFn: func(context.Context, *model.Template) error { return errors.New("db error") },
		}
		svc := NewTemplateService(repo, nil, nil)
		err := svc.Update(context.Background(), "u1", "tpl1", UpdateTemplateInput{Name: "N", Content: "C"})
		assert.Error(t, err)
	})
}

func TestTemplateService_Delete(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		repo := &mockTemplateRepo{
			deleteFn: func(context.Context, string, string) error { return nil },
		}
		svc := NewTemplateService(repo, nil, nil)
		err := svc.Delete(context.Background(), "u1", "tpl1")
		require.NoError(t, err)
	})

	t.Run("error", func(t *testing.T) {
		repo := &mockTemplateRepo{
			deleteFn: func(context.Context, string, string) error { return errors.New("db error") },
		}
		svc := NewTemplateService(repo, nil, nil)
		err := svc.Delete(context.Background(), "u1", "tpl1")
		assert.Error(t, err)
	})
}

func TestTemplateService_CreateDocumentFromTemplate(t *testing.T) {
	t.Run("success_with_variables", func(t *testing.T) {
		tplRepo := &mockTemplateRepo{
			getByIDFn: func(context.Context, string, string) (*model.Template, error) {
				return &model.Template{
					ID:            "tpl1",
					Name:          "My Template",
					Content:       "Hello {{NAME}}, today is {{SYS:DATE}}",
					DefaultTagIDs: []string{"t1"},
				}, nil
			},
		}
		docRepo := &mockDocumentRepo{
			createFn:      func(context.Context, *model.Document) error { return nil },
			updateLinksFn: func(context.Context, string, string, []string, int64) error { return nil },
		}
		summaries := &mockDocumentSummaryRepo{
			getByDocIDFn: func(context.Context, string, string) (string, error) {
				return "", appErr.ErrNotFound
			},
			listByDocIDsFn: func(context.Context, string, []string) (map[string]string, error) {
				return nil, nil
			},
		}
		versions := &mockVersionRepo{
			createFn:            func(context.Context, *model.DocumentVersion) error { return nil },
			getLatestVersionFn:  func(context.Context, string, string) (int, error) { return 0, appErr.ErrNotFound },
			deleteOldVersionsFn: func(context.Context, string, string, int) error { return nil },
		}
		tags := &mockDocumentTagRepo{
			deleteByDocFn: func(context.Context, string, string) error { return nil },
			addFn:         func(context.Context, *model.DocumentTag) error { return nil },
		}
		docSvc := newDocSvc(docRepo, summaries, versions, tags, nil)

		tagRepoMock := &mockTagRepo{
			listByIDsFn: func(context.Context, string, []string) ([]model.Tag, error) {
				return []model.Tag{{ID: "t1", Name: "go"}}, nil
			},
		}
		svc := NewTemplateService(tplRepo, docSvc, tagRepoMock)
		doc, err := svc.CreateDocumentFromTemplate(context.Background(), "u1", CreateDocumentFromTemplateInput{
			TemplateID: "tpl1",
			Title:      "Custom Title",
			Variables:  map[string]string{"name": "Alice"},
		})
		require.NoError(t, err)
		assert.Equal(t, "Custom Title", doc.Title)
	})

	t.Run("infer_title", func(t *testing.T) {
		tplRepo := &mockTemplateRepo{
			getByIDFn: func(context.Context, string, string) (*model.Template, error) {
				return &model.Template{
					ID:      "tpl1",
					Name:    "Fallback",
					Content: "# Generated Title\nBody content",
				}, nil
			},
		}
		var capturedTitle string
		docRepo := &mockDocumentRepo{
			createFn: func(_ context.Context, doc *model.Document) error {
				capturedTitle = doc.Title
				return nil
			},
			updateLinksFn: func(context.Context, string, string, []string, int64) error { return nil },
		}
		versions := &mockVersionRepo{
			createFn:            func(context.Context, *model.DocumentVersion) error { return nil },
			getLatestVersionFn:  func(context.Context, string, string) (int, error) { return 0, appErr.ErrNotFound },
			deleteOldVersionsFn: func(context.Context, string, string, int) error { return nil },
		}
		dtags := &mockDocumentTagRepo{
			deleteByDocFn: func(context.Context, string, string) error { return nil },
			addFn:         func(context.Context, *model.DocumentTag) error { return nil },
		}
		docSvc := newDocSvc(docRepo, noopSummaryRepo(), versions, dtags, nil)

		svc := NewTemplateService(tplRepo, docSvc, nil)
		doc, err := svc.CreateDocumentFromTemplate(context.Background(), "u1", CreateDocumentFromTemplateInput{
			TemplateID: "tpl1",
		})
		require.NoError(t, err)
		assert.Equal(t, "Generated Title", capturedTitle)
		assert.NotNil(t, doc)
	})

	t.Run("template_not_found", func(t *testing.T) {
		tplRepo := &mockTemplateRepo{
			getByIDFn: func(context.Context, string, string) (*model.Template, error) {
				return nil, appErr.ErrNotFound
			},
		}
		svc := NewTemplateService(tplRepo, nil, nil)
		_, err := svc.CreateDocumentFromTemplate(context.Background(), "u1", CreateDocumentFromTemplateInput{
			TemplateID: "bad",
		})
		assert.Error(t, err)
	})

	t.Run("filter_non_existing_tags", func(t *testing.T) {
		tplRepo := &mockTemplateRepo{
			getByIDFn: func(context.Context, string, string) (*model.Template, error) {
				return &model.Template{
					ID:            "tpl1",
					Name:          "Template",
					Content:       "body",
					DefaultTagIDs: []string{"t1", "t2", "t3"},
				}, nil
			},
		}
		var addedTagIDs []string
		docRepo := &mockDocumentRepo{
			createFn:      func(context.Context, *model.Document) error { return nil },
			updateLinksFn: func(context.Context, string, string, []string, int64) error { return nil },
		}
		versions := &mockVersionRepo{
			createFn:            func(context.Context, *model.DocumentVersion) error { return nil },
			getLatestVersionFn:  func(context.Context, string, string) (int, error) { return 0, appErr.ErrNotFound },
			deleteOldVersionsFn: func(context.Context, string, string, int) error { return nil },
		}
		dtags := &mockDocumentTagRepo{
			deleteByDocFn: func(context.Context, string, string) error { return nil },
			addFn: func(_ context.Context, dt *model.DocumentTag) error {
				addedTagIDs = append(addedTagIDs, dt.TagID)
				return nil
			},
		}
		docSvc := newDocSvc(docRepo, noopSummaryRepo(), versions, dtags, nil)

		tagRepoMock := &mockTagRepo{
			listByIDsFn: func(context.Context, string, []string) ([]model.Tag, error) {
				return []model.Tag{{ID: "t1"}, {ID: "t3"}}, nil
			},
		}
		svc := NewTemplateService(tplRepo, docSvc, tagRepoMock)
		_, err := svc.CreateDocumentFromTemplate(context.Background(), "u1", CreateDocumentFromTemplateInput{
			TemplateID: "tpl1",
			Title:      "Title",
		})
		require.NoError(t, err)
		assert.Equal(t, []string{"t1", "t3"}, addedTagIDs)
	})
}
