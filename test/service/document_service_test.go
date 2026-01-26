package service_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/repo"
	"github.com/xxxsen/mnote/internal/service"
	"github.com/xxxsen/mnote/test/testutil"
)

func TestDocumentServiceVersioningAndDelete(t *testing.T) {
	db, cleanup := testutil.OpenTestDB(t)
	defer cleanup()

	docRepo := repo.NewDocumentRepo(db)
	versionRepo := repo.NewVersionRepo(db)
	docTagRepo := repo.NewDocumentTagRepo(db)
	shareRepo := repo.NewShareRepo(db)
	tagRepo := repo.NewTagRepo(db)
	userRepo := repo.NewUserRepo(db)

	docs := service.NewDocumentService(docRepo, versionRepo, docTagRepo, shareRepo, tagRepo, userRepo)

	doc, err := docs.Create(context.Background(), "user-1", service.DocumentCreateInput{Title: "t1", Content: "c1"})
	require.NoError(t, err)

	versions, err := docs.ListVersions(context.Background(), "user-1", doc.ID)
	require.NoError(t, err)
	require.Len(t, versions, 1)
	require.Equal(t, 1, versions[0].Version)

	require.NoError(t, docs.Update(context.Background(), "user-1", doc.ID, service.DocumentUpdateInput{Title: "t2", Content: "c2"}))

	versions, err = docs.ListVersions(context.Background(), "user-1", doc.ID)
	require.NoError(t, err)
	require.Len(t, versions, 2)
	require.Equal(t, 2, versions[0].Version)

	require.NoError(t, docs.Delete(context.Background(), "user-1", doc.ID))
	_, err = docs.Get(context.Background(), "user-1", doc.ID)
	require.Error(t, err)
}

func TestDocumentServiceShareState(t *testing.T) {
	db, cleanup := testutil.OpenTestDB(t)
	defer cleanup()

	docRepo := repo.NewDocumentRepo(db)
	versionRepo := repo.NewVersionRepo(db)
	docTagRepo := repo.NewDocumentTagRepo(db)
	shareRepo := repo.NewShareRepo(db)
	tagRepo := repo.NewTagRepo(db)
	userRepo := repo.NewUserRepo(db)

	docs := service.NewDocumentService(docRepo, versionRepo, docTagRepo, shareRepo, tagRepo, userRepo)

	doc, err := docs.Create(context.Background(), "user-1", service.DocumentCreateInput{Title: "t1", Content: "c1"})
	require.NoError(t, err)

	share, err := docs.CreateShare(context.Background(), "user-1", doc.ID)
	require.NoError(t, err)
	require.Equal(t, repo.ShareStateActive, share.State)

	share2, err := docs.CreateShare(context.Background(), "user-1", doc.ID)
	require.NoError(t, err)
	require.Equal(t, repo.ShareStateActive, share2.State)
	require.NotEqual(t, share.Token, share2.Token)

	fetched, err := shareRepo.GetByToken(context.Background(), share.Token)
	require.NoError(t, err)
	require.Equal(t, repo.ShareStateRevoked, fetched.State)
}
