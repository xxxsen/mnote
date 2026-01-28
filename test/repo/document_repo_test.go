package repo_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/timeutil"
	"github.com/xxxsen/mnote/internal/repo"
	"github.com/xxxsen/mnote/test/testutil"
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
	require.NoError(t, docs.Update(context.Background(), doc, false))

	err = docs.Delete(context.Background(), "user-1", "doc-1", timeutil.NowUnix())
	require.NoError(t, err)

	_, err = docs.GetByID(context.Background(), "user-1", "doc-1")
	require.ErrorIs(t, err, appErr.ErrNotFound)
}
