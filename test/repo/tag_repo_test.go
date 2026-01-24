package repo_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"mnote/internal/model"
	"mnote/internal/pkg/timeutil"
	"mnote/internal/repo"
	"mnote/test/testutil"
)

func TestTagRepoCRUD(t *testing.T) {
	db, cleanup := testutil.OpenTestDB(t)
	defer cleanup()

	tags := repo.NewTagRepo(db)
	now := timeutil.NowUnix()
	tag := &model.Tag{ID: "tag-1", UserID: "user-1", Name: "go", Ctime: now, Mtime: now}
	require.NoError(t, tags.Create(context.Background(), tag))

	list, err := tags.List(context.Background(), "user-1")
	require.NoError(t, err)
	require.Len(t, list, 1)

	require.NoError(t, tags.Delete(context.Background(), "user-1", "tag-1"))
	list, err = tags.List(context.Background(), "user-1")
	require.NoError(t, err)
	require.Len(t, list, 0)
}
