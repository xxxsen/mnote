package repo_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"mnote/internal/model"
	appErr "mnote/internal/pkg/errors"
	"mnote/internal/pkg/timeutil"
	"mnote/internal/repo"
	"mnote/test/testutil"
)

func TestDocumentRepoCRUDAndIsolation(t *testing.T) {
	db, cleanup := testutil.OpenTestDB(t)
	defer cleanup()

	docs := repo.NewDocumentRepo(db)
	now := timeutil.NowUnix()
	doc := &model.Document{
		ID:      "doc-1",
		UserID:  "user-1",
		Title:   "title",
		Content: "content",
		State:   repo.DocumentStateNormal,
		Ctime:   now,
		Mtime:   now,
	}
	require.NoError(t, docs.Create(context.Background(), doc))

	fetched, err := docs.GetByID(context.Background(), "user-1", "doc-1")
	require.NoError(t, err)
	require.Equal(t, "title", fetched.Title)

	_, err = docs.GetByID(context.Background(), "user-2", "doc-1")
	require.ErrorIs(t, err, appErr.ErrNotFound)

	doc.Title = "updated"
	doc.Content = "updated content"
	doc.Mtime = timeutil.NowUnix()
	require.NoError(t, docs.Update(context.Background(), doc))

	err = docs.Delete(context.Background(), "user-1", "doc-1", timeutil.NowUnix())
	require.NoError(t, err)

	_, err = docs.GetByID(context.Background(), "user-1", "doc-1")
	require.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestFTSRepoUpsertDelete(t *testing.T) {
	db, cleanup := testutil.OpenTestDB(t)
	defer cleanup()

	fts := repo.NewFTSRepo(db)
	require.NoError(t, fts.Upsert(context.Background(), "doc-1", "user-1", "hello", "world"))
	ids, err := fts.SearchDocIDs(context.Background(), "user-1", "hello", 10)
	require.NoError(t, err)
	require.Len(t, ids, 1)
	require.Equal(t, "doc-1", ids[0])

	require.NoError(t, fts.Delete(context.Background(), "user-1", "doc-1"))
	ids, err = fts.SearchDocIDs(context.Background(), "user-1", "hello", 10)
	require.NoError(t, err)
	require.Len(t, ids, 0)
}
