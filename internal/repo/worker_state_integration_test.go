//go:build integration

package repo_test

import (
	"context"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/repo"
	"github.com/xxxsen/mnote/internal/testutil"
)

func TestImportJobClaimHasSingleConcurrentWinner(t *testing.T) {
	database, cleanup := testutil.OpenTestDB(t)
	defer cleanup()

	ctx := context.Background()
	jobs := repo.NewImportJobRepo(database)
	require.NoError(t, jobs.Create(ctx, &model.ImportJob{
		ID: "job-1", UserID: "user-1", Source: "notes",
		Status: model.ImportStatusReady, Ctime: 100, Mtime: 100,
	}))
	confirmed, err := jobs.Confirm(ctx, "user-1", "job-1", model.ImportModeSkip, 101)
	require.NoError(t, err)
	require.True(t, confirmed)

	start := make(chan struct{})
	results := make(chan *model.ImportJob, 2)
	errors := make(chan error, 2)
	var wait sync.WaitGroup
	for range 2 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-start
			job, claimErr := jobs.Claim(ctx, 200, 500)
			results <- job
			errors <- claimErr
		}()
	}
	close(start)
	wait.Wait()
	close(results)
	close(errors)

	winners := 0
	for claimErr := range errors {
		if claimErr != nil {
			require.ErrorIs(t, claimErr, appErr.ErrNoWork)
		}
	}
	for job := range results {
		if job != nil {
			winners++
			require.Equal(t, "job-1", job.ID)
			require.Equal(t, 1, job.Attempts)
		}
	}
	require.Equal(t, 1, winners)
}

func TestAssetCleanupClaimExcludesReadyAndHasSingleWinner(t *testing.T) {
	database, cleanup := testutil.OpenTestDB(t)
	defer cleanup()

	ctx := context.Background()
	assets := repo.NewAssetRepo(database)
	require.NoError(t, assets.UpsertByFileKey(ctx, &model.Asset{
		ID: "asset-pending", UserID: "user-1", FileKey: "pending-key",
		URL: "/files/pending-key", Name: "pending", Status: model.AssetStatusPending,
		Ctime: 100, Mtime: 100,
	}))
	require.NoError(t, assets.UpsertByFileKey(ctx, &model.Asset{
		ID: "asset-ready", UserID: "user-1", FileKey: "ready-key",
		URL: "/files/ready-key", Name: "ready", Status: model.AssetStatusReady,
		Ctime: 100, Mtime: 100,
	}))

	start := make(chan struct{})
	results := make(chan *model.Asset, 2)
	errors := make(chan error, 2)
	var wait sync.WaitGroup
	for range 2 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-start
			asset, claimErr := assets.ClaimCleanup(ctx, 500, 400, 800)
			results <- asset
			errors <- claimErr
		}()
	}
	close(start)
	wait.Wait()
	close(results)
	close(errors)

	winners := 0
	for claimErr := range errors {
		if claimErr != nil {
			require.ErrorIs(t, claimErr, appErr.ErrNoWork)
		}
	}
	for asset := range results {
		if asset != nil {
			winners++
			require.Equal(t, "asset-pending", asset.ID)
		}
	}
	require.Equal(t, 1, winners)

	var readyCount int
	require.NoError(t, database.QueryRowContext(
		ctx, "SELECT COUNT(*) FROM assets WHERE id = $1 AND status = 'ready'", "asset-ready",
	).Scan(&readyCount))
	require.Equal(t, 1, readyCount)
}
