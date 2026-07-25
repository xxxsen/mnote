//go:build integration

package service_test

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/repo"
	"github.com/xxxsen/mnote/internal/service"
	"github.com/xxxsen/mnote/internal/testutil"
)

func newEmbeddingV2DocumentService(
	db *sql.DB,
	embedding *service.EmbeddingService,
) *service.DocumentService {
	return service.NewDocumentService(
		service.NewRuntime(repo.NewTransactor(db)),
		repo.NewDocumentRepo(db),
		repo.NewVersionRepo(db),
		repo.NewDocumentTagRepo(db),
		repo.NewShareRepo(db),
		repo.NewTagRepo(db),
		repo.NewUserRepo(db),
		embedding,
		10,
		nil,
	)
}

func TestDocumentServiceEmbeddingV2QueueIsTransactional(t *testing.T) {
	db, cleanup := testutil.OpenTestDB(t)
	t.Cleanup(cleanup)
	ctx := context.Background()
	now := time.Now().Unix()
	embeddingRepo := repo.NewEmbeddingV2Repo(db)
	profile := model.EmbeddingProfile{
		ID:               "document-service-profile",
		Fingerprint:      "document-service-profile-fingerprint",
		SpaceID:          "document-service-space",
		Model:            "document-service-model",
		Dimensions:       384,
		Metric:           "cosine",
		QueryTaskType:    "RETRIEVAL_QUERY",
		DocumentTaskType: "RETRIEVAL_DOCUMENT",
		ChunkerVersion:   2,
		Ctime:            now,
	}
	require.NoError(t, embeddingRepo.EnsureProfile(ctx, profile))
	generation, err := embeddingRepo.CreateBuildingGeneration(
		ctx,
		profile.ID,
		"initial",
		false,
		now,
	)
	require.NoError(t, err)

	embeddingService := service.NewEmbeddingService(
		nil,
		repo.NewEmbeddingRepo(db),
	)
	embeddingService.ConfigureV2(embeddingRepo, 0, nil, nil)
	documents := newEmbeddingV2DocumentService(db, embeddingService)
	document, err := documents.Create(
		ctx,
		"embedding-v2-transaction-user",
		service.DocumentCreateInput{Title: "Created", Content: "body"},
	)
	require.NoError(t, err)

	var desiredHash, status string
	var desiredRevision int64
	require.NoError(t, db.QueryRowContext(
		ctx,
		`SELECT desired_content_hash, desired_revision, status
		 FROM embedding_jobs
		 WHERE generation_id = $1::uuid AND document_id = $2`,
		generation.ID,
		document.ID,
	).Scan(&desiredHash, &desiredRevision, &status))
	assert.Equal(t, document.ContentHash, desiredHash)
	assert.Equal(t, int64(1), desiredRevision)
	assert.Equal(t, "pending", status)

	result, err := documents.Save(
		ctx,
		document.UserID,
		document.ID,
		service.DocumentUpdateInput{
			Title:        "Updated",
			Content:      "updated body",
			BaseRevision: 1,
			SaveSeq:      2,
		},
	)
	require.NoError(t, err)
	require.True(t, result.Accepted)
	require.NoError(t, db.QueryRowContext(
		ctx,
		`SELECT desired_content_hash, desired_revision, status
		 FROM embedding_jobs
		 WHERE generation_id = $1::uuid AND document_id = $2`,
		generation.ID,
		document.ID,
	).Scan(&desiredHash, &desiredRevision, &status))
	assert.Equal(t, result.ContentHash, desiredHash)
	assert.Equal(t, int64(2), desiredRevision)
	assert.Equal(t, "pending", status)

	require.NoError(t, documents.Delete(ctx, document.UserID, document.ID))
	var jobs int
	require.NoError(t, db.QueryRowContext(
		ctx,
		"SELECT COUNT(*) FROM embedding_jobs WHERE document_id = $1",
		document.ID,
	).Scan(&jobs))
	assert.Zero(t, jobs)
}

func TestDocumentServiceEmbeddingV2QueueFailureRollsBackDocument(t *testing.T) {
	db, cleanup := testutil.OpenTestDB(t)
	t.Cleanup(cleanup)
	ctx := context.Background()
	now := time.Now().Unix()
	embeddingRepo := repo.NewEmbeddingV2Repo(db)
	profile := model.EmbeddingProfile{
		ID:               "document-rollback-profile",
		Fingerprint:      "document-rollback-profile-fingerprint",
		SpaceID:          "document-rollback-space",
		Model:            "document-rollback-model",
		Dimensions:       384,
		Metric:           "cosine",
		QueryTaskType:    "RETRIEVAL_QUERY",
		DocumentTaskType: "RETRIEVAL_DOCUMENT",
		ChunkerVersion:   2,
		Ctime:            now,
	}
	require.NoError(t, embeddingRepo.EnsureProfile(ctx, profile))
	_, err := embeddingRepo.CreateBuildingGeneration(
		ctx,
		profile.ID,
		"initial",
		false,
		now,
	)
	require.NoError(t, err)
	_, err = db.ExecContext(ctx, "DROP TABLE embedding_jobs")
	require.NoError(t, err)

	embeddingService := service.NewEmbeddingService(nil, repo.NewEmbeddingRepo(db))
	embeddingService.ConfigureV2(embeddingRepo, 0, nil, nil)
	documents := newEmbeddingV2DocumentService(db, embeddingService)
	_, err = documents.Create(
		ctx,
		"embedding-v2-rollback-user",
		service.DocumentCreateInput{
			Title:   "Must roll back",
			Content: "body",
		},
	)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "enqueue embedding")

	var documentCount, versionCount int
	require.NoError(t, db.QueryRowContext(
		ctx,
		"SELECT COUNT(*) FROM documents WHERE title = 'Must roll back'",
	).Scan(&documentCount))
	require.NoError(t, db.QueryRowContext(
		ctx,
		"SELECT COUNT(*) FROM document_versions WHERE title = 'Must roll back'",
	).Scan(&versionCount))
	assert.Zero(t, documentCount)
	assert.Zero(t, versionCount)
}

func TestDocumentServiceVersioningAndDelete(t *testing.T) {
	db, cleanup := testutil.OpenTestDB(t)
	defer cleanup()

	docRepo := repo.NewDocumentRepo(db)
	versionRepo := repo.NewVersionRepo(db)
	docTagRepo := repo.NewDocumentTagRepo(db)
	shareRepo := repo.NewShareRepo(db)
	tagRepo := repo.NewTagRepo(db)
	userRepo := repo.NewUserRepo(db)
	runtime := service.NewRuntime(repo.NewTransactor(db))

	docs := service.NewDocumentService(
		runtime, docRepo, versionRepo, docTagRepo, shareRepo,
		tagRepo, userRepo, nil, 10, nil)

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
	runtime := service.NewRuntime(repo.NewTransactor(db))

	docs := service.NewDocumentService(
		runtime, docRepo, versionRepo, docTagRepo, shareRepo,
		tagRepo, userRepo, nil, 10, nil)

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

func TestDocumentServiceShareComments(t *testing.T) {
	db, cleanup := testutil.OpenTestDB(t)
	defer cleanup()

	docRepo := repo.NewDocumentRepo(db)
	versionRepo := repo.NewVersionRepo(db)
	docTagRepo := repo.NewDocumentTagRepo(db)
	shareRepo := repo.NewShareRepo(db)
	tagRepo := repo.NewTagRepo(db)
	userRepo := repo.NewUserRepo(db)
	runtime := service.NewRuntime(repo.NewTransactor(db))

	docs := service.NewDocumentService(
		runtime, docRepo, versionRepo, docTagRepo, shareRepo,
		tagRepo, userRepo, nil, 10, nil)

	doc, err := docs.Create(context.Background(), "user-1", service.DocumentCreateInput{Title: "t1", Content: "c1"})
	require.NoError(t, err)

	share, err := docs.CreateShare(context.Background(), "user-1", doc.ID)
	require.NoError(t, err)

	_, err = docs.CreateShareCommentByToken(context.Background(), service.CreateShareCommentInput{
		Token:   share.Token,
		Author:  "Alice",
		Content: "first comment",
	})
	require.Error(t, err)

	_, err = docs.UpdateShareConfig(context.Background(), "user-1", doc.ID, service.ShareConfigInput{
		Permission:    repo.SharePermissionComment,
		AllowDownload: true,
	})
	require.NoError(t, err)

	created, err := docs.CreateShareCommentByToken(context.Background(), service.CreateShareCommentInput{
		Token:   share.Token,
		Author:  "Alice",
		Content: "first comment",
	})
	require.NoError(t, err)
	require.Equal(t, "Alice", created.Author)

	result, err := docs.ListShareCommentsByToken(context.Background(), share.Token, "", 20, 0)
	require.NoError(t, err)
	require.Equal(t, 1, result.Total)
	require.Len(t, result.Items, 1)
	require.Equal(t, "first comment", result.Items[0].Content)
}
