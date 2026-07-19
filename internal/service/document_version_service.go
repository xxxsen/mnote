package service

import (
	"context"
	"fmt"

	"github.com/xxxsen/mnote/internal/model"
)

func (
	s *DocumentService) ListVersions(ctx context.Context,
	userID,
	docID string) ([]model.DocumentVersionSummary,
	error,
) {
	if _, err := s.docs.GetByID(ctx, userID, docID); err != nil {
		return nil, fmt.Errorf("get by id: %w", err)
	}
	v0, err := s.versions.ListSummaries(ctx, userID, docID)
	if err != nil {
		return nil, fmt.Errorf("list summaries: %w", err)
	}
	return v0, nil
}

func (
	s *DocumentService) GetVersion(ctx context.Context,
	userID,
	docID string,
	version int) (*model.DocumentVersion,
	error,
) {
	if _, err := s.docs.GetByID(ctx, userID, docID); err != nil {
		return nil, fmt.Errorf("get by id: %w", err)
	}
	v0, err := s.versions.GetByVersion(ctx, userID, docID, version)
	if err != nil {
		return nil, fmt.Errorf("get by version: %w", err)
	}
	return v0, nil
}

func (s *DocumentService) pruneVersions(ctx context.Context, userID, docID string) error {
	if s.versionMaxKeep <= 0 {
		return nil
	}
	if err := s.versions.DeleteOldVersions(ctx, userID, docID, s.versionMaxKeep); err != nil {
		return fmt.Errorf("delete old versions: %w", err)
	}
	return nil
}
