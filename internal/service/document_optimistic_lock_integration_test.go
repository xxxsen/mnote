package service_test

import (
	"context"
	"database/sql"
	"errors"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/repo"
	"github.com/xxxsen/mnote/internal/service"
	"github.com/xxxsen/mnote/internal/testutil"
)

func newIntegrationDocumentService(db *sql.DB) *service.DocumentService {
	return service.NewDocumentService(
		db,
		repo.NewDocumentRepo(db),
		repo.NewDocumentSummaryRepo(db),
		repo.NewVersionRepo(db),
		repo.NewDocumentTagRepo(db),
		repo.NewShareRepo(db),
		repo.NewTagRepo(db),
		repo.NewUserRepo(db),
		nil,
		10,
	)
}

func TestDocumentServiceOptimisticLockIntegration_SameBaseHasSingleWinner(t *testing.T) {
	db, cleanup := testutil.OpenTestDB(t)
	defer cleanup()

	docs := newIntegrationDocumentService(db)
	created, err := docs.Create(
		context.Background(),
		"optimistic-lock-user",
		service.DocumentCreateInput{Title: "Initial", Content: "base"},
	)
	require.NoError(t, err)
	require.Equal(t, int64(1), created.ContentRevision)

	type outcome struct {
		result *model.SaveDocumentResult
		err    error
	}
	start := make(chan struct{})
	outcomes := make(chan outcome, 2)
	var workers sync.WaitGroup
	for _, content := range []string{"saved by A", "saved by B"} {
		workers.Add(1)
		go func(nextContent string) {
			defer workers.Done()
			<-start
			result, saveErr := docs.Save(
				context.Background(),
				created.UserID,
				created.ID,
				service.DocumentUpdateInput{
					Title:        "Updated",
					Content:      nextContent,
					BaseRevision: 1,
					SaveSeq:      2,
				},
			)
			outcomes <- outcome{result: result, err: saveErr}
		}(content)
	}
	close(start)
	workers.Wait()
	close(outcomes)

	accepted := 0
	conflicted := 0
	for item := range outcomes {
		require.NoError(t, item.err)
		require.NotNil(t, item.result)
		switch {
		case item.result.Accepted:
			accepted++
			assert.Equal(t, int64(2), item.result.ContentRevision)
		case item.result.Reason == model.SaveRejectReasonRevisionConflict:
			conflicted++
			assert.Equal(t, int64(2), item.result.ContentRevision)
		default:
			t.Fatalf("unexpected save result: %+v", item.result)
		}
	}
	assert.Equal(t, 1, accepted)
	assert.Equal(t, 1, conflicted)

	current, err := repo.NewDocumentRepo(db).GetByID(
		context.Background(),
		created.UserID,
		created.ID,
	)
	require.NoError(t, err)
	assert.Equal(t, int64(2), current.ContentRevision)
	assert.Contains(t, []string{"saved by A", "saved by B"}, current.Content)

	versions, err := repo.NewVersionRepo(db).ListSummaries(
		context.Background(),
		created.UserID,
		created.ID,
	)
	require.NoError(t, err)
	require.Len(t, versions, 2)
	assert.Equal(t, 2, versions[0].Version)
}

type failingVersionRepo struct{}

func (failingVersionRepo) Create(context.Context, *model.DocumentVersion) error {
	return errors.New("forced version failure")
}

func (failingVersionRepo) GetByVersion(
	context.Context,
	string,
	string,
	int,
) (*model.DocumentVersion, error) {
	return nil, errors.New("not implemented")
}

func (failingVersionRepo) ListSummaries(
	context.Context,
	string,
	string,
) ([]model.DocumentVersionSummary, error) {
	return nil, errors.New("not implemented")
}

func (failingVersionRepo) ListByUser(
	context.Context,
	string,
) ([]model.DocumentVersion, error) {
	return nil, errors.New("not implemented")
}

func (failingVersionRepo) DeleteOldVersions(context.Context, string, string, int) error {
	return nil
}

func TestDocumentServiceOptimisticLockIntegration_VersionFailureRollsBackDocument(t *testing.T) {
	db, cleanup := testutil.OpenTestDB(t)
	defer cleanup()

	normal := newIntegrationDocumentService(db)
	created, err := normal.Create(
		context.Background(),
		"optimistic-rollback-user",
		service.DocumentCreateInput{Title: "Initial", Content: "base"},
	)
	require.NoError(t, err)

	failing := service.NewDocumentService(
		db,
		repo.NewDocumentRepo(db),
		repo.NewDocumentSummaryRepo(db),
		failingVersionRepo{},
		repo.NewDocumentTagRepo(db),
		repo.NewShareRepo(db),
		repo.NewTagRepo(db),
		repo.NewUserRepo(db),
		nil,
		10,
	)
	_, err = failing.Save(
		context.Background(),
		created.UserID,
		created.ID,
		service.DocumentUpdateInput{
			Title:        "Must roll back",
			Content:      "must not persist",
			BaseRevision: 1,
			SaveSeq:      2,
		},
	)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "forced version failure")

	current, err := repo.NewDocumentRepo(db).GetByID(
		context.Background(),
		created.UserID,
		created.ID,
	)
	require.NoError(t, err)
	assert.Equal(t, "Initial", current.Title)
	assert.Equal(t, "base", current.Content)
	assert.Equal(t, int64(1), current.ContentRevision)

	versions, err := repo.NewVersionRepo(db).ListSummaries(
		context.Background(),
		created.UserID,
		created.ID,
	)
	require.NoError(t, err)
	require.Len(t, versions, 1)
	assert.Equal(t, 1, versions[0].Version)
}

func TestDocumentServiceOptimisticLockIntegration_InternalSaveAdvancesServerRevision(t *testing.T) {
	db, cleanup := testutil.OpenTestDB(t)
	defer cleanup()

	docs := newIntegrationDocumentService(db)
	created, err := docs.Create(
		context.Background(),
		"optimistic-internal-user",
		service.DocumentCreateInput{Title: "Initial", Content: "base"},
	)
	require.NoError(t, err)

	result, err := docs.Save(
		context.Background(),
		created.UserID,
		created.ID,
		service.DocumentUpdateInput{
			Title:   "Imported",
			Content: "trusted internal write",
		},
	)
	require.NoError(t, err)
	require.True(t, result.Accepted)
	assert.Equal(t, created.ContentRevision+1, result.ContentRevision)
}
