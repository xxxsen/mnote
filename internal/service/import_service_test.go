package service

import (
	"archive/zip"
	"context"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

type mockImportJobRepo struct {
	createFn         func(ctx context.Context, job *model.ImportJob) error
	getFn            func(ctx context.Context, userID, jobID string) (*model.ImportJob, error)
	updateStatusIfFn func(ctx context.Context, userID, jobID, from, to string, mtime int64) (bool, error)
	updateSummaryFn  func(ctx context.Context, job *model.ImportJob) error
	updateProgressFn func(ctx context.Context, userID, jobID string, processed, total int, report *model.ImportReport, status string, mtime int64) error
	deleteFn         func(ctx context.Context, userID, jobID string) error
}

func (m *mockImportJobRepo) Create(ctx context.Context, job *model.ImportJob) error {
	return m.createFn(ctx, job)
}

func (m *mockImportJobRepo) Get(ctx context.Context, userID, jobID string) (*model.ImportJob, error) {
	return m.getFn(ctx, userID, jobID)
}

func (m *mockImportJobRepo) UpdateStatusIf(ctx context.Context, userID, jobID, from, to string, mtime int64) (bool, error) {
	return m.updateStatusIfFn(ctx, userID, jobID, from, to, mtime)
}

func (m *mockImportJobRepo) UpdateSummary(ctx context.Context, job *model.ImportJob) error {
	return m.updateSummaryFn(ctx, job)
}

func (m *mockImportJobRepo) UpdateProgress(ctx context.Context, userID, jobID string, processed, total int, report *model.ImportReport, status string, mtime int64) error {
	return m.updateProgressFn(ctx, userID, jobID, processed, total, report, status, mtime)
}

func (m *mockImportJobRepo) Delete(ctx context.Context, userID, jobID string) error {
	return m.deleteFn(ctx, userID, jobID)
}

type mockImportJobNoteRepo struct {
	insertBatchFn func(ctx context.Context, notes []model.ImportJobNote) error
	listByJobFn   func(ctx context.Context, userID, jobID string) ([]model.ImportJobNote, error)
	listByJobLiFn func(ctx context.Context, userID, jobID string, limit int) ([]model.ImportJobNote, error)
	listTitlesFn  func(ctx context.Context, userID, jobID string) ([]string, error)
}

func (m *mockImportJobNoteRepo) InsertBatch(ctx context.Context, notes []model.ImportJobNote) error {
	return m.insertBatchFn(ctx, notes)
}

func (m *mockImportJobNoteRepo) ListByJob(ctx context.Context, userID, jobID string) ([]model.ImportJobNote, error) {
	return m.listByJobFn(ctx, userID, jobID)
}

func (m *mockImportJobNoteRepo) ListByJobLimit(ctx context.Context, userID, jobID string, limit int) ([]model.ImportJobNote, error) {
	return m.listByJobLiFn(ctx, userID, jobID, limit)
}

func (m *mockImportJobNoteRepo) ListTitles(ctx context.Context, userID, jobID string) ([]string, error) {
	return m.listTitlesFn(ctx, userID, jobID)
}

func createTestZipWithMD(t *testing.T, files map[string]string) string {
	t.Helper()
	tmp, err := os.CreateTemp("", "test-import-*.zip")
	require.NoError(t, err)
	w := zip.NewWriter(tmp)
	for name, content := range files {
		f, werr := w.Create(name)
		require.NoError(t, werr)
		_, werr = f.Write([]byte(content))
		require.NoError(t, werr)
	}
	require.NoError(t, w.Close())
	require.NoError(t, tmp.Close())
	return tmp.Name()
}

func createTestZipWithJSON(t *testing.T, items map[string]notesImportPayload) string {
	t.Helper()
	tmp, err := os.CreateTemp("", "test-import-*.zip")
	require.NoError(t, err)
	w := zip.NewWriter(tmp)
	for name, payload := range items {
		data, jerr := json.Marshal(payload)
		require.NoError(t, jerr)
		f, werr := w.Create(name)
		require.NoError(t, werr)
		_, werr = f.Write(data)
		require.NoError(t, werr)
	}
	require.NoError(t, w.Close())
	require.NoError(t, tmp.Close())
	return tmp.Name()
}

func TestImportService_Status(t *testing.T) {
	jobRepo := &mockImportJobRepo{
		getFn: func(_ context.Context, _, _ string) (*model.ImportJob, error) {
			return &model.ImportJob{ID: "j1", Status: "ready", Total: 5}, nil
		},
	}
	svc := NewImportService(nil, nil, jobRepo, nil)
	job, err := svc.Status(context.Background(), "u1", "j1")
	require.NoError(t, err)
	assert.Equal(t, "ready", job.Status)
	assert.Equal(t, 5, job.Total)
}

func TestImportService_Status_Error(t *testing.T) {
	jobRepo := &mockImportJobRepo{
		getFn: func(context.Context, string, string) (*model.ImportJob, error) {
			return nil, appErr.ErrNotFound
		},
	}
	svc := NewImportService(nil, nil, jobRepo, nil)
	_, err := svc.Status(context.Background(), "u1", "bad")
	assert.Error(t, err)
}

func TestImportService_Preview(t *testing.T) {
	t.Run("success_no_conflicts", func(t *testing.T) {
		docRepo := &mockDocumentRepo{
			getByTitleFn: func(context.Context, string, string) (*model.Document, error) {
				return nil, appErr.ErrNotFound
			},
		}
		docSvc := newDocSvc(docRepo, noopSummaryRepo(), nil, nil, nil)
		jobRepo := &mockImportJobRepo{
			getFn: func(context.Context, string, string) (*model.ImportJob, error) {
				return &model.ImportJob{
					ID: "j1", Total: 2, Tags: []string{"go", "rust"},
				}, nil
			},
		}
		noteRepo := &mockImportJobNoteRepo{
			listTitlesFn: func(context.Context, string, string) ([]string, error) {
				return []string{"Note 1", "Note 2"}, nil
			},
			listByJobLiFn: func(context.Context, string, string, int) ([]model.ImportJobNote, error) {
				return []model.ImportJobNote{
					{Title: "Note 1", Content: "c1", Tags: []string{"go"}},
				}, nil
			},
		}
		svc := NewImportService(docSvc, nil, jobRepo, noteRepo)
		preview, err := svc.Preview(context.Background(), "u1", "j1")
		require.NoError(t, err)
		assert.Equal(t, 2, preview.NotesCount)
		assert.Equal(t, 0, preview.Conflicts)
		assert.Len(t, preview.Samples, 1)
		assert.Equal(t, 2, preview.TagsCount)
	})

	t.Run("with_conflicts", func(t *testing.T) {
		docRepo := &mockDocumentRepo{
			getByTitleFn: func(_ context.Context, _, title string) (*model.Document, error) {
				if title == "Note 1" {
					return &model.Document{ID: "existing"}, nil
				}
				return nil, appErr.ErrNotFound
			},
		}
		docSvc := newDocSvc(docRepo, noopSummaryRepo(), nil, nil, nil)
		jobRepo := &mockImportJobRepo{
			getFn: func(context.Context, string, string) (*model.ImportJob, error) {
				return &model.ImportJob{ID: "j1", Total: 2, Tags: []string{"go"}}, nil
			},
		}
		noteRepo := &mockImportJobNoteRepo{
			listTitlesFn: func(context.Context, string, string) ([]string, error) {
				return []string{"Note 1", "Note 2"}, nil
			},
			listByJobLiFn: func(context.Context, string, string, int) ([]model.ImportJobNote, error) {
				return nil, nil
			},
		}
		svc := NewImportService(docSvc, nil, jobRepo, noteRepo)
		preview, err := svc.Preview(context.Background(), "u1", "j1")
		require.NoError(t, err)
		assert.Equal(t, 1, preview.Conflicts)
	})

	t.Run("nil_note_repo", func(t *testing.T) {
		jobRepo := &mockImportJobRepo{
			getFn: func(context.Context, string, string) (*model.ImportJob, error) {
				return &model.ImportJob{ID: "j1"}, nil
			},
		}
		svc := NewImportService(nil, nil, jobRepo, nil)
		_, err := svc.Preview(context.Background(), "u1", "j1")
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})
}

func TestImportService_Confirm(t *testing.T) {
	t.Run("invalid_mode", func(t *testing.T) {
		jobRepo := &mockImportJobRepo{
			getFn: func(context.Context, string, string) (*model.ImportJob, error) {
				return &model.ImportJob{ID: "j1", Status: "ready"}, nil
			},
		}
		svc := NewImportService(nil, nil, jobRepo, nil)
		err := svc.Confirm(context.Background(), "u1", "j1", "invalid")
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})

	t.Run("already_running", func(t *testing.T) {
		jobRepo := &mockImportJobRepo{
			getFn: func(context.Context, string, string) (*model.ImportJob, error) {
				return &model.ImportJob{ID: "j1", Status: "running"}, nil
			},
		}
		svc := NewImportService(nil, nil, jobRepo, nil)
		err := svc.Confirm(context.Background(), "u1", "j1", "append")
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})

	t.Run("default_mode_append", func(t *testing.T) {
		jobRepo := &mockImportJobRepo{
			getFn: func(context.Context, string, string) (*model.ImportJob, error) {
				return &model.ImportJob{ID: "j1", Status: "ready", UserID: "u1"}, nil
			},
			updateStatusIfFn: func(_ context.Context, _, _, _, toStatus string, _ int64) (bool, error) {
				assert.Equal(t, "running", toStatus)
				return true, nil
			},
			updateProgressFn: func(context.Context, string, string, int, int, *model.ImportReport, string, int64) error {
				return nil
			},
		}
		noteRepo := &mockImportJobNoteRepo{
			listByJobFn: func(context.Context, string, string) ([]model.ImportJobNote, error) {
				return nil, nil
			},
		}
		docRepo := &mockDocumentRepo{}
		docSvc := newDocSvc(docRepo, noopSummaryRepo(), nil, nil, nil)
		svc := NewImportService(docSvc, nil, jobRepo, noteRepo)
		err := svc.Confirm(context.Background(), "u1", "j1", "")
		require.NoError(t, err)
	})

	t.Run("status_update_failed", func(t *testing.T) {
		jobRepo := &mockImportJobRepo{
			getFn: func(context.Context, string, string) (*model.ImportJob, error) {
				return &model.ImportJob{ID: "j1", Status: "ready"}, nil
			},
			updateStatusIfFn: func(context.Context, string, string, string, string, int64) (bool, error) {
				return false, nil
			},
		}
		svc := NewImportService(nil, nil, jobRepo, nil)
		err := svc.Confirm(context.Background(), "u1", "j1", "append")
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})
}

func TestImportService_EnsureTags(t *testing.T) {
	t.Run("empty_tags", func(t *testing.T) {
		svc := &ImportService{}
		ids, err := svc.ensureTags(context.Background(), "u1", nil)
		require.NoError(t, err)
		assert.Empty(t, ids)
	})

	t.Run("all_existing", func(t *testing.T) {
		tagRepo := &mockTagRepo{
			listByNamesFn: func(_ context.Context, _ string, names []string) ([]model.Tag, error) {
				result := make([]model.Tag, 0, len(names))
				for _, n := range names {
					result = append(result, model.Tag{ID: "id-" + n, Name: n})
				}
				return result, nil
			},
		}
		docTagRepo := &mockDocumentTagRepo{}
		tagSvc := NewTagService(nil, tagRepo, docTagRepo)
		svc := &ImportService{tags: tagSvc}
		ids, err := svc.ensureTags(context.Background(), "u1", []string{"go", "rust"})
		require.NoError(t, err)
		assert.Len(t, ids, 2)
	})

	t.Run("with_new_tags", func(t *testing.T) {
		tagRepo := &mockTagRepo{
			listByNamesFn: func(context.Context, string, []string) ([]model.Tag, error) {
				return []model.Tag{{ID: "t1", Name: "go"}}, nil
			},
			createBatchFn: func(_ context.Context, tags []model.Tag) error {
				for i := range tags {
					tags[i].ID = "new-" + tags[i].Name
				}
				return nil
			},
		}
		docTagRepo := &mockDocumentTagRepo{}
		tagSvc := NewTagService(nil, tagRepo, docTagRepo)
		svc := &ImportService{tags: tagSvc}
		ids, err := svc.ensureTags(context.Background(), "u1", []string{"go", "rust"})
		require.NoError(t, err)
		assert.Len(t, ids, 2)
	})

	t.Run("list_error", func(t *testing.T) {
		tagRepo := &mockTagRepo{
			listByNamesFn: func(context.Context, string, []string) ([]model.Tag, error) {
				return nil, errors.New("db error")
			},
		}
		tagSvc := NewTagService(nil, tagRepo, nil)
		svc := &ImportService{tags: tagSvc}
		_, err := svc.ensureTags(context.Background(), "u1", []string{"go"})
		assert.Error(t, err)
	})
}

func TestImportService_AppendSuffix(t *testing.T) {
	docRepo := &mockDocumentRepo{
		getByTitleFn: func(_ context.Context, _, title string) (*model.Document, error) {
			if title == "Note" || title == "Note (2)" {
				return &model.Document{ID: "d1"}, nil
			}
			return nil, appErr.ErrNotFound
		},
	}
	docSvc := newDocSvc(docRepo, noopSummaryRepo(), nil, nil, nil)
	svc := &ImportService{documents: docSvc}
	result := svc.appendSuffix(context.Background(), "u1", "Note")
	assert.Equal(t, "Note (3)", result)
}

func TestImportService_AppendSuffix_Empty(t *testing.T) {
	docRepo := &mockDocumentRepo{
		getByTitleFn: func(context.Context, string, string) (*model.Document, error) {
			return nil, appErr.ErrNotFound
		},
	}
	docSvc := newDocSvc(docRepo, noopSummaryRepo(), nil, nil, nil)
	svc := &ImportService{documents: docSvc}
	result := svc.appendSuffix(context.Background(), "u1", "")
	assert.Equal(t, "Untitled (2)", result)
}

func TestImportService_LookupByTitle(t *testing.T) {
	t.Run("found", func(t *testing.T) {
		docRepo := &mockDocumentRepo{
			getByTitleFn: func(context.Context, string, string) (*model.Document, error) {
				return &model.Document{ID: "d1"}, nil
			},
		}
		docSvc := newDocSvc(docRepo, noopSummaryRepo(), nil, nil, nil)
		svc := &ImportService{documents: docSvc}
		id, found, err := svc.lookupByTitle(context.Background(), "u1", "Note")
		require.NoError(t, err)
		assert.True(t, found)
		assert.Equal(t, "d1", id)
	})

	t.Run("not_found", func(t *testing.T) {
		docRepo := &mockDocumentRepo{
			getByTitleFn: func(context.Context, string, string) (*model.Document, error) {
				return nil, appErr.ErrNotFound
			},
		}
		docSvc := newDocSvc(docRepo, noopSummaryRepo(), nil, nil, nil)
		svc := &ImportService{documents: docSvc}
		_, found, err := svc.lookupByTitle(context.Background(), "u1", "Note")
		require.NoError(t, err)
		assert.False(t, found)
	})

	t.Run("error", func(t *testing.T) {
		docRepo := &mockDocumentRepo{
			getByTitleFn: func(context.Context, string, string) (*model.Document, error) {
				return nil, errors.New("db error")
			},
		}
		docSvc := newDocSvc(docRepo, noopSummaryRepo(), nil, nil, nil)
		svc := &ImportService{documents: docSvc}
		_, _, err := svc.lookupByTitle(context.Background(), "u1", "Note")
		assert.Error(t, err)
	})
}

func TestImportService_ResolveExisting(t *testing.T) {
	t.Run("append_not_exist", func(t *testing.T) {
		docRepo := &mockDocumentRepo{
			getByTitleFn: func(context.Context, string, string) (*model.Document, error) {
				return nil, appErr.ErrNotFound
			},
		}
		docSvc := newDocSvc(docRepo, noopSummaryRepo(), nil, nil, nil)
		svc := &ImportService{documents: docSvc}
		id, exists, err := svc.resolveExisting(context.Background(), "u1", "Note", "append")
		require.NoError(t, err)
		assert.Empty(t, id)
		assert.False(t, exists)
	})

	t.Run("skip_exists", func(t *testing.T) {
		docRepo := &mockDocumentRepo{
			getByTitleFn: func(context.Context, string, string) (*model.Document, error) {
				return &model.Document{ID: "d1"}, nil
			},
		}
		docSvc := newDocSvc(docRepo, noopSummaryRepo(), nil, nil, nil)
		svc := &ImportService{documents: docSvc}
		id, exists, err := svc.resolveExisting(context.Background(), "u1", "Note", "skip")
		require.NoError(t, err)
		assert.Equal(t, "d1", id)
		assert.True(t, exists)
	})
}

func TestImportService_ImportProgress(t *testing.T) {
	prog := &importProgress{
		ctx:    context.Background(),
		job:    &model.ImportJob{ID: "j1", UserID: "u1", Total: 10},
		report: &model.ImportReport{},
		service: &ImportService{
			jobRepo: &mockImportJobRepo{
				updateProgressFn: func(context.Context, string, string, int, int, *model.ImportReport, string, int64) error {
					return nil
				},
			},
		},
	}

	prog.recordFail("err msg", "title1")
	assert.Equal(t, 1, prog.report.Failed)
	assert.Equal(t, 1, prog.processed)
	assert.Contains(t, prog.report.Errors, "err msg")
	assert.Contains(t, prog.report.FailedTitles, "title1")

	prog.tick()
	assert.Equal(t, 2, prog.processed)
}

func TestImportService_CreateHedgeDocJob(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		zipPath := createTestZipWithMD(t, map[string]string{
			"note1.md": "# Hello\n###### tags: `go` `rust`\nBody text",
			"note2.md": "# World\nContent here",
		})
		defer func() { _ = os.Remove(zipPath) }()

		jobRepo := &mockImportJobRepo{
			createFn:        func(context.Context, *model.ImportJob) error { return nil },
			updateSummaryFn: func(context.Context, *model.ImportJob) error { return nil },
			deleteFn:        func(context.Context, string, string) error { return nil },
		}
		noteRepo := &mockImportJobNoteRepo{
			insertBatchFn: func(_ context.Context, notes []model.ImportJobNote) error {
				assert.Len(t, notes, 2)
				return nil
			},
		}
		svc := NewImportService(nil, nil, jobRepo, noteRepo)
		job, err := svc.CreateHedgeDocJob(context.Background(), "u1", zipPath)
		require.NoError(t, err)
		assert.Equal(t, "ready", job.Status)
		assert.Equal(t, 2, job.Total)
		assert.Contains(t, job.Tags, "go")
		assert.Contains(t, job.Tags, "rust")
	})

	t.Run("nil_repos", func(t *testing.T) {
		zipPath := createTestZipWithMD(t, map[string]string{"note.md": "hello"})
		defer func() { _ = os.Remove(zipPath) }()
		svc := NewImportService(nil, nil, nil, nil)
		_, err := svc.CreateHedgeDocJob(context.Background(), "u1", zipPath)
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})

	t.Run("invalid_zip", func(t *testing.T) {
		svc := NewImportService(nil, nil, &mockImportJobRepo{}, &mockImportJobNoteRepo{})
		_, err := svc.CreateHedgeDocJob(context.Background(), "u1", "/nonexistent.zip")
		assert.Error(t, err)
	})

	t.Run("empty_zip", func(t *testing.T) {
		zipPath := createTestZipWithMD(t, map[string]string{
			"readme.txt": "not a markdown",
		})
		defer func() { _ = os.Remove(zipPath) }()

		jobRepo := &mockImportJobRepo{
			createFn: func(context.Context, *model.ImportJob) error { return nil },
			deleteFn: func(context.Context, string, string) error { return nil },
		}
		svc := NewImportService(nil, nil, jobRepo, &mockImportJobNoteRepo{})
		_, err := svc.CreateHedgeDocJob(context.Background(), "u1", zipPath)
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})
}

func TestImportService_CreateNotesJob(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		zipPath := createTestZipWithJSON(t, map[string]notesImportPayload{
			"note1.json": {Title: "Note 1", Content: "Hello", TagList: []string{"go"}},
			"note2.json": {Title: "Note 2", Content: "World", Summary: "A note"},
		})
		defer func() { _ = os.Remove(zipPath) }()

		jobRepo := &mockImportJobRepo{
			createFn:        func(context.Context, *model.ImportJob) error { return nil },
			updateSummaryFn: func(context.Context, *model.ImportJob) error { return nil },
			deleteFn:        func(context.Context, string, string) error { return nil },
		}
		noteRepo := &mockImportJobNoteRepo{
			insertBatchFn: func(_ context.Context, notes []model.ImportJobNote) error {
				assert.Len(t, notes, 2)
				return nil
			},
		}
		svc := NewImportService(nil, nil, jobRepo, noteRepo)
		job, err := svc.CreateNotesJob(context.Background(), "u1", zipPath)
		require.NoError(t, err)
		assert.Equal(t, "ready", job.Status)
		assert.Equal(t, 2, job.Total)
	})

	t.Run("invalid_json", func(t *testing.T) {
		tmp, err := os.CreateTemp("", "test-import-*.zip")
		require.NoError(t, err)
		w := zip.NewWriter(tmp)
		f, _ := w.Create("bad.json")
		_, _ = f.Write([]byte("not json"))
		_ = w.Close()
		_ = tmp.Close()
		defer func() { _ = os.Remove(tmp.Name()) }()

		jobRepo := &mockImportJobRepo{
			createFn: func(context.Context, *model.ImportJob) error { return nil },
			deleteFn: func(context.Context, string, string) error { return nil },
		}
		svc := NewImportService(nil, nil, jobRepo, &mockImportJobNoteRepo{})
		_, err = svc.CreateNotesJob(context.Background(), "u1", tmp.Name())
		assert.ErrorIs(t, err, appErr.ErrImportInvalidJSON)
	})
}

func TestImportService_RunImport(t *testing.T) {
	t.Run("success_append_new", func(t *testing.T) {
		var createdTitles []string
		docRepo := &mockDocumentRepo{
			createFn: func(_ context.Context, doc *model.Document) error {
				createdTitles = append(createdTitles, doc.Title)
				return nil
			},
			updateLinksFn: func(context.Context, string, string, []string, int64) error { return nil },
			getByTitleFn: func(context.Context, string, string) (*model.Document, error) {
				return nil, appErr.ErrNotFound
			},
		}
		summaries := &mockDocumentSummaryRepo{
			upsertFn: func(context.Context, string, string, string, int64) error { return nil },
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

		var finalStatus string
		jobRepo := &mockImportJobRepo{
			updateProgressFn: func(_ context.Context, _, _ string, _, _ int, _ *model.ImportReport, status string, _ int64) error {
				finalStatus = status
				return nil
			},
		}
		noteRepo := &mockImportJobNoteRepo{
			listByJobFn: func(context.Context, string, string) ([]model.ImportJobNote, error) {
				return []model.ImportJobNote{
					{Title: "Note1", Content: "body1", Tags: nil},
					{Title: "Note2", Content: "body2", Tags: nil},
				}, nil
			},
		}

		svc := NewImportService(docSvc, nil, jobRepo, noteRepo)
		job := &model.ImportJob{ID: "j1", UserID: "u1", Total: 2}
		svc.runImport(context.Background(), job, "append")

		assert.Equal(t, "done", finalStatus)
		assert.Len(t, createdTitles, 2)
	})

	t.Run("skip_existing", func(t *testing.T) {
		docRepo := &mockDocumentRepo{
			getByTitleFn: func(context.Context, string, string) (*model.Document, error) {
				return &model.Document{ID: "d1"}, nil
			},
		}
		docSvc := newDocSvc(docRepo, noopSummaryRepo(), nil, nil, nil)

		var report *model.ImportReport
		jobRepo := &mockImportJobRepo{
			updateProgressFn: func(_ context.Context, _, _ string, _, _ int, r *model.ImportReport, _ string, _ int64) error {
				report = r
				return nil
			},
		}
		noteRepo := &mockImportJobNoteRepo{
			listByJobFn: func(context.Context, string, string) ([]model.ImportJobNote, error) {
				return []model.ImportJobNote{
					{Title: "Note1", Content: "body1"},
				}, nil
			},
		}

		svc := NewImportService(docSvc, nil, jobRepo, noteRepo)
		job := &model.ImportJob{ID: "j1", UserID: "u1", Total: 1}
		svc.runImport(context.Background(), job, "skip")

		require.NotNil(t, report)
		assert.Equal(t, 1, report.Skipped)
	})

	t.Run("nil_repos", func(_ *testing.T) {
		svc := &ImportService{
			jobRepo:  nil,
			noteRepo: nil,
		}
		job := &model.ImportJob{ID: "j1", UserID: "u1"}
		svc.runImport(context.Background(), job, "append")
	})
}

func TestImportService_ImportNote_EmptyTitle(t *testing.T) {
	svc := &ImportService{}
	prog := &importProgress{
		report: &model.ImportReport{},
		job:    &model.ImportJob{RequireContent: false},
	}
	note := model.ImportJobNote{Title: "", Source: "test.md"}
	svc.importNote(context.Background(), prog.job, "append", note, prog)
	assert.Equal(t, 1, prog.report.Failed)
}

func TestImportService_ImportNote_RequireContent(t *testing.T) {
	svc := &ImportService{}
	prog := &importProgress{
		report: &model.ImportReport{},
		job:    &model.ImportJob{RequireContent: true},
	}
	note := model.ImportJobNote{Title: "Note", Content: "  ", Source: "test.json"}
	svc.importNote(context.Background(), prog.job, "append", note, prog)
	assert.Equal(t, 1, prog.report.Failed)
}

func TestImportService_OverwriteNote(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		docRepo := &mockDocumentRepo{
			updateFn:      func(context.Context, *model.Document) error { return nil },
			updateLinksFn: func(context.Context, string, string, []string, int64) error { return nil },
		}
		summaries := &mockDocumentSummaryRepo{
			upsertFn: func(context.Context, string, string, string, int64) error { return nil },
			getByDocIDFn: func(context.Context, string, string) (string, error) {
				return "", appErr.ErrNotFound
			},
			listByDocIDsFn: func(context.Context, string, []string) (map[string]string, error) {
				return nil, nil
			},
		}
		versions := &mockVersionRepo{
			createFn:            func(context.Context, *model.DocumentVersion) error { return nil },
			getLatestVersionFn:  func(context.Context, string, string) (int, error) { return 1, nil },
			deleteOldVersionsFn: func(context.Context, string, string, int) error { return nil },
		}
		dtags := &mockDocumentTagRepo{
			deleteByDocFn: func(context.Context, string, string) error { return nil },
			addFn:         func(context.Context, *model.DocumentTag) error { return nil },
		}
		docSvc := newDocSvc(docRepo, summaries, versions, dtags, nil)
		svc := &ImportService{documents: docSvc}

		prog := &importProgress{report: &model.ImportReport{}, job: &model.ImportJob{UserID: "u1"}}
		note := model.ImportJobNote{Title: "Note", Content: "updated", Summary: "sum"}
		svc.overwriteNote(context.Background(), prog.job, "d1", note, []string{"t1"}, prog)
		assert.Equal(t, 1, prog.report.Updated)
	})

	t.Run("error", func(t *testing.T) {
		docRepo := &mockDocumentRepo{
			updateFn: func(context.Context, *model.Document) error { return errors.New("db fail") },
		}
		docSvc := newDocSvc(docRepo, nil, nil, nil, nil)
		svc := &ImportService{documents: docSvc}

		prog := &importProgress{report: &model.ImportReport{}, job: &model.ImportJob{UserID: "u1"}}
		note := model.ImportJobNote{Title: "Note", Content: "c"}
		svc.overwriteNote(context.Background(), prog.job, "d1", note, nil, prog)
		assert.Equal(t, 1, prog.report.Failed)
	})
}

func TestImportService_ImportNote_Overwrite(t *testing.T) {
	docRepo := &mockDocumentRepo{
		getByTitleFn: func(context.Context, string, string) (*model.Document, error) {
			return &model.Document{ID: "d1"}, nil
		},
		updateFn:      func(context.Context, *model.Document) error { return nil },
		updateLinksFn: func(context.Context, string, string, []string, int64) error { return nil },
	}
	summaries := &mockDocumentSummaryRepo{
		upsertFn:       func(context.Context, string, string, string, int64) error { return nil },
		getByDocIDFn:   func(context.Context, string, string) (string, error) { return "", appErr.ErrNotFound },
		listByDocIDsFn: func(context.Context, string, []string) (map[string]string, error) { return nil, nil },
	}
	versions := &mockVersionRepo{
		createFn:            func(context.Context, *model.DocumentVersion) error { return nil },
		getLatestVersionFn:  func(context.Context, string, string) (int, error) { return 1, nil },
		deleteOldVersionsFn: func(context.Context, string, string, int) error { return nil },
	}
	dtags := &mockDocumentTagRepo{
		deleteByDocFn: func(context.Context, string, string) error { return nil },
		addFn:         func(context.Context, *model.DocumentTag) error { return nil },
	}
	docSvc := newDocSvc(docRepo, summaries, versions, dtags, nil)

	tagRepo := &mockTagRepo{
		listByNamesFn: func(context.Context, string, []string) ([]model.Tag, error) {
			return nil, nil
		},
		createBatchFn: func(_ context.Context, tags []model.Tag) error {
			for i := range tags {
				tags[i].ID = "new-" + tags[i].Name
			}
			return nil
		},
	}
	tagSvc := NewTagService(nil, tagRepo, &mockDocumentTagRepo{})

	svc := NewImportService(docSvc, tagSvc, nil, nil)
	prog := &importProgress{
		report:  &model.ImportReport{},
		job:     &model.ImportJob{UserID: "u1", RequireContent: false},
		service: svc,
	}
	note := model.ImportJobNote{Title: "Note", Content: "body", Tags: []string{"go"}}
	svc.importNote(context.Background(), prog.job, "overwrite", note, prog)
	assert.Equal(t, 1, prog.report.Updated)
}

func TestSaveTempFile(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		content := "hello world"
		path, err := SaveTempFile("test", strings.NewReader(content))
		require.NoError(t, err)
		defer func() { _ = os.Remove(path) }()

		data, readErr := os.ReadFile(path)
		require.NoError(t, readErr)
		assert.Equal(t, content, string(data))
	})

	t.Run("copy_error", func(t *testing.T) {
		r := &errorReader{}
		_, err := SaveTempFile("test", r)
		assert.Error(t, err)
	})
}

type errorReader struct{}

func (e *errorReader) Read(_ []byte) (int, error) { return 0, errors.New("read error") }

func TestImportService_Preview_Errors(t *testing.T) {
	t.Run("get_error", func(t *testing.T) {
		jobRepo := &mockImportJobRepo{
			getFn: func(context.Context, string, string) (*model.ImportJob, error) {
				return nil, errors.New("db error")
			},
		}
		svc := NewImportService(nil, nil, jobRepo, nil)
		_, err := svc.Preview(context.Background(), "u1", "j1")
		assert.Error(t, err)
	})

	t.Run("list_titles_error", func(t *testing.T) {
		jobRepo := &mockImportJobRepo{
			getFn: func(context.Context, string, string) (*model.ImportJob, error) {
				return &model.ImportJob{ID: "j1"}, nil
			},
		}
		noteRepo := &mockImportJobNoteRepo{
			listTitlesFn: func(context.Context, string, string) ([]string, error) {
				return nil, errors.New("db error")
			},
		}
		svc := NewImportService(nil, nil, jobRepo, noteRepo)
		_, err := svc.Preview(context.Background(), "u1", "j1")
		assert.Error(t, err)
	})

	t.Run("list_by_job_limit_error", func(t *testing.T) {
		docRepo := &mockDocumentRepo{
			getByTitleFn: func(context.Context, string, string) (*model.Document, error) {
				return nil, appErr.ErrNotFound
			},
		}
		docSvc := newDocSvc(docRepo, noopSummaryRepo(), nil, nil, nil)
		jobRepo := &mockImportJobRepo{
			getFn: func(context.Context, string, string) (*model.ImportJob, error) {
				return &model.ImportJob{ID: "j1", Total: 1, Tags: []string{"go"}}, nil
			},
		}
		noteRepo := &mockImportJobNoteRepo{
			listTitlesFn: func(context.Context, string, string) ([]string, error) {
				return []string{"Note"}, nil
			},
			listByJobLiFn: func(context.Context, string, string, int) ([]model.ImportJobNote, error) {
				return nil, errors.New("db error")
			},
		}
		svc := NewImportService(docSvc, nil, jobRepo, noteRepo)
		_, err := svc.Preview(context.Background(), "u1", "j1")
		assert.Error(t, err)
	})

	t.Run("empty_title_skipped", func(t *testing.T) {
		docRepo := &mockDocumentRepo{
			getByTitleFn: func(context.Context, string, string) (*model.Document, error) {
				return nil, appErr.ErrNotFound
			},
		}
		docSvc := newDocSvc(docRepo, noopSummaryRepo(), nil, nil, nil)
		jobRepo := &mockImportJobRepo{
			getFn: func(context.Context, string, string) (*model.ImportJob, error) {
				return &model.ImportJob{ID: "j1", Total: 1, Tags: []string{}}, nil
			},
		}
		noteRepo := &mockImportJobNoteRepo{
			listTitlesFn: func(context.Context, string, string) ([]string, error) {
				return []string{"", "Note"}, nil
			},
			listByJobLiFn: func(context.Context, string, string, int) ([]model.ImportJobNote, error) {
				return nil, nil
			},
		}
		svc := NewImportService(docSvc, nil, jobRepo, noteRepo)
		preview, err := svc.Preview(context.Background(), "u1", "j1")
		require.NoError(t, err)
		assert.Equal(t, 0, preview.Conflicts)
	})
}

func TestImportService_Confirm_Errors(t *testing.T) {
	t.Run("get_error", func(t *testing.T) {
		jobRepo := &mockImportJobRepo{
			getFn: func(context.Context, string, string) (*model.ImportJob, error) {
				return nil, errors.New("db error")
			},
		}
		svc := NewImportService(nil, nil, jobRepo, nil)
		err := svc.Confirm(context.Background(), "u1", "j1", "append")
		assert.Error(t, err)
	})

	t.Run("update_status_error", func(t *testing.T) {
		jobRepo := &mockImportJobRepo{
			getFn: func(context.Context, string, string) (*model.ImportJob, error) {
				return &model.ImportJob{ID: "j1", Status: "ready"}, nil
			},
			updateStatusIfFn: func(context.Context, string, string, string, string, int64) (bool, error) {
				return false, errors.New("db error")
			},
		}
		svc := NewImportService(nil, nil, jobRepo, nil)
		err := svc.Confirm(context.Background(), "u1", "j1", "append")
		assert.Error(t, err)
	})
}

func TestImportService_RunImport_ListError(t *testing.T) {
	jobRepo := &mockImportJobRepo{
		updateProgressFn: func(context.Context, string, string, int, int, *model.ImportReport, string, int64) error {
			return nil
		},
	}
	noteRepo := &mockImportJobNoteRepo{
		listByJobFn: func(context.Context, string, string) ([]model.ImportJobNote, error) {
			return nil, errors.New("db error")
		},
	}
	svc := NewImportService(nil, nil, jobRepo, noteRepo)
	job := &model.ImportJob{ID: "j1", UserID: "u1", Total: 1}
	svc.runImport(context.Background(), job, "append")
}

func TestImportService_Tick_Mod10(t *testing.T) {
	updateCalled := false
	prog := &importProgress{
		ctx:       context.Background(),
		processed: 9,
		job:       &model.ImportJob{ID: "j1", UserID: "u1", Total: 20},
		report:    &model.ImportReport{},
		service: &ImportService{
			jobRepo: &mockImportJobRepo{
				updateProgressFn: func(context.Context, string, string, int, int, *model.ImportReport, string, int64) error {
					updateCalled = true
					return nil
				},
			},
		},
	}
	prog.tick()
	assert.Equal(t, 10, prog.processed)
	assert.True(t, updateCalled)
}

func TestImportService_ImportNote_AppendExisting(t *testing.T) {
	docRepo := &mockDocumentRepo{
		getByTitleFn: func(_ context.Context, _, title string) (*model.Document, error) {
			if title == "Note" || title == "Note (2)" {
				return &model.Document{ID: "d1"}, nil
			}
			return nil, appErr.ErrNotFound
		},
		createFn:      func(context.Context, *model.Document) error { return nil },
		updateLinksFn: func(context.Context, string, string, []string, int64) error { return nil },
	}
	summaries := &mockDocumentSummaryRepo{
		upsertFn:       func(context.Context, string, string, string, int64) error { return nil },
		getByDocIDFn:   func(context.Context, string, string) (string, error) { return "", appErr.ErrNotFound },
		listByDocIDsFn: func(context.Context, string, []string) (map[string]string, error) { return nil, nil },
	}
	versions := &mockVersionRepo{
		createFn:            func(context.Context, *model.DocumentVersion) error { return nil },
		getLatestVersionFn:  func(context.Context, string, string) (int, error) { return 0, appErr.ErrNotFound },
		deleteOldVersionsFn: func(context.Context, string, string, int) error { return nil },
	}
	dtags := &mockDocumentTagRepo{
		deleteByDocFn: func(context.Context, string, string) error { return nil },
	}
	docSvc := newDocSvc(docRepo, summaries, versions, dtags, nil)
	tagSvc := NewTagService(nil, &mockTagRepo{
		listByNamesFn: func(context.Context, string, []string) ([]model.Tag, error) { return nil, nil },
		createBatchFn: func(_ context.Context, tags []model.Tag) error {
			for i := range tags {
				tags[i].ID = "new-" + tags[i].Name
			}
			return nil
		},
	}, &mockDocumentTagRepo{})

	svc := NewImportService(docSvc, tagSvc, nil, nil)
	prog := &importProgress{
		report:  &model.ImportReport{},
		job:     &model.ImportJob{UserID: "u1", RequireContent: false},
		service: svc,
	}
	note := model.ImportJobNote{Title: "Note", Content: "body"}
	svc.importNote(context.Background(), prog.job, "append", note, prog)
	assert.Equal(t, 1, prog.report.Created)
}

func TestImportService_ImportNote_LookupError(t *testing.T) {
	docRepo := &mockDocumentRepo{
		getByTitleFn: func(context.Context, string, string) (*model.Document, error) {
			return nil, errors.New("db error")
		},
	}
	docSvc := newDocSvc(docRepo, noopSummaryRepo(), nil, nil, nil)
	svc := NewImportService(docSvc, nil, nil, nil)
	prog := &importProgress{
		report:  &model.ImportReport{},
		job:     &model.ImportJob{UserID: "u1", RequireContent: false},
		service: svc,
	}
	note := model.ImportJobNote{Title: "Note", Content: "body"}
	svc.importNote(context.Background(), prog.job, "skip", note, prog)
	assert.Equal(t, 1, prog.report.Failed)
}

func TestImportService_ImportNote_CreateError(t *testing.T) {
	docRepo := &mockDocumentRepo{
		getByTitleFn: func(context.Context, string, string) (*model.Document, error) {
			return nil, appErr.ErrNotFound
		},
		createFn: func(context.Context, *model.Document) error { return errors.New("fail") },
	}
	docSvc := newDocSvc(docRepo, noopSummaryRepo(), nil, nil, nil)
	tagSvc := NewTagService(nil, &mockTagRepo{
		listByNamesFn: func(context.Context, string, []string) ([]model.Tag, error) { return nil, nil },
		createBatchFn: func(context.Context, []model.Tag) error { return nil },
	}, &mockDocumentTagRepo{})
	svc := NewImportService(docSvc, tagSvc, nil, nil)
	prog := &importProgress{
		report:  &model.ImportReport{},
		job:     &model.ImportJob{UserID: "u1"},
		service: svc,
	}
	note := model.ImportJobNote{Title: "Note", Content: "body", Tags: []string{"go"}}
	svc.importNote(context.Background(), prog.job, "append", note, prog)
	assert.Equal(t, 1, prog.report.Failed)
}

func TestImportService_ImportNote_EnsureTagsError(t *testing.T) {
	docRepo := &mockDocumentRepo{
		getByTitleFn: func(context.Context, string, string) (*model.Document, error) {
			return nil, appErr.ErrNotFound
		},
	}
	docSvc := newDocSvc(docRepo, noopSummaryRepo(), nil, nil, nil)
	tagSvc := NewTagService(nil, &mockTagRepo{
		listByNamesFn: func(context.Context, string, []string) ([]model.Tag, error) {
			return nil, errors.New("db error")
		},
	}, &mockDocumentTagRepo{})
	svc := NewImportService(docSvc, tagSvc, nil, nil)
	prog := &importProgress{
		report:  &model.ImportReport{},
		job:     &model.ImportJob{UserID: "u1"},
		service: svc,
	}
	note := model.ImportJobNote{Title: "Note", Content: "body", Tags: []string{"go"}}
	svc.importNote(context.Background(), prog.job, "append", note, prog)
	assert.Equal(t, 1, prog.report.Failed)
}

func TestImportService_CreateNotesJob_NoteTooLarge(t *testing.T) {
	largeContent := strings.Repeat("x", maxNoteBytes+1)
	zipPath := createTestZipWithJSON(t, map[string]notesImportPayload{
		"big.json": {Title: "Big", Content: largeContent},
	})
	defer func() { _ = os.Remove(zipPath) }()

	jobRepo := &mockImportJobRepo{
		createFn: func(context.Context, *model.ImportJob) error { return nil },
		deleteFn: func(context.Context, string, string) error { return nil },
	}
	svc := NewImportService(nil, nil, jobRepo, &mockImportJobNoteRepo{})
	_, err := svc.CreateNotesJob(context.Background(), "u1", zipPath)
	assert.ErrorIs(t, err, appErr.ErrImportNoteTooLarge)
}

func TestImportService_CreateImportJob_InsertBatchError(t *testing.T) {
	zipPath := createTestZipWithMD(t, map[string]string{"note.md": "content"})
	defer func() { _ = os.Remove(zipPath) }()

	jobRepo := &mockImportJobRepo{
		createFn: func(context.Context, *model.ImportJob) error { return nil },
		deleteFn: func(context.Context, string, string) error { return nil },
	}
	noteRepo := &mockImportJobNoteRepo{
		insertBatchFn: func(context.Context, []model.ImportJobNote) error { return errors.New("db error") },
	}
	svc := NewImportService(nil, nil, jobRepo, noteRepo)
	_, err := svc.CreateHedgeDocJob(context.Background(), "u1", zipPath)
	assert.Error(t, err)
}

func TestImportService_CreateImportJob_UpdateSummaryError(t *testing.T) {
	zipPath := createTestZipWithMD(t, map[string]string{"note.md": "content"})
	defer func() { _ = os.Remove(zipPath) }()

	jobRepo := &mockImportJobRepo{
		createFn:        func(context.Context, *model.ImportJob) error { return nil },
		updateSummaryFn: func(context.Context, *model.ImportJob) error { return errors.New("db error") },
		deleteFn:        func(context.Context, string, string) error { return nil },
	}
	noteRepo := &mockImportJobNoteRepo{
		insertBatchFn: func(context.Context, []model.ImportJobNote) error { return nil },
	}
	svc := NewImportService(nil, nil, jobRepo, noteRepo)
	_, err := svc.CreateHedgeDocJob(context.Background(), "u1", zipPath)
	assert.Error(t, err)
}
