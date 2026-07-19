package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/xxxsen/common/logutil"
	"go.uber.org/zap"

	"github.com/xxxsen/mnote/internal/filestore"
	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

type assetCleanupRepo interface {
	ClaimCleanup(
		ctx context.Context, now, cutoff, lockedUntil int64,
	) (*model.Asset, error)
	DeleteIfNotReady(ctx context.Context, assetID string) error
	ReleaseCleanup(
		ctx context.Context, assetID, stableError string, now int64,
	) error
}

type AssetCleanupWorker struct {
	assets  assetCleanupRepo
	store   filestore.Store
	runtime Runtime
}

var errAssetCleanupDependencies = errors.New("asset cleanup dependencies are required")

func NewAssetCleanupWorker(
	assets assetCleanupRepo, store filestore.Store, runtime Runtime,
) *AssetCleanupWorker {
	runtime.validate()
	return &AssetCleanupWorker{assets: assets, store: store, runtime: runtime}
}

func (worker *AssetCleanupWorker) Run(ctx context.Context) error {
	if worker.assets == nil || worker.store == nil {
		return errAssetCleanupDependencies
	}
	for {
		if err := worker.runBatch(ctx); err != nil && !errors.Is(err, context.Canceled) {
			logutil.GetLogger(ctx).Error("asset cleanup batch failed", zap.Error(err))
		}
		timer := time.NewTimer(time.Hour)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil
		case <-timer.C:
		}
	}
}

func (worker *AssetCleanupWorker) runBatch(ctx context.Context) error {
	for range 500 {
		if err := ctx.Err(); err != nil {
			return fmt.Errorf("asset cleanup canceled: %w", err)
		}
		now := worker.runtime.Clock.Now()
		asset, err := worker.assets.ClaimCleanup(
			ctx, now.Unix(), now.Add(-time.Hour).Unix(),
			now.Add(5*time.Minute).Unix(),
		)
		if errors.Is(err, appErr.ErrNoWork) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("claim cleanup asset: %w", err)
		}
		if asset == nil {
			return nil
		}
		if err := worker.store.Delete(ctx, asset.FileKey); err != nil {
			if releaseErr := worker.assets.ReleaseCleanup(
				ctx, asset.ID, "store delete failed", now.Unix(),
			); releaseErr != nil {
				return fmt.Errorf(
					"delete asset object and release cleanup: %w",
					errors.Join(err, releaseErr),
				)
			}
			continue
		}
		if err := worker.assets.DeleteIfNotReady(ctx, asset.ID); err != nil {
			return fmt.Errorf("delete failed asset row: %w", err)
		}
	}
	return nil
}
