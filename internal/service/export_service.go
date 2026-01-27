package service

import (
	"context"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/repo"
)

type ExportPayload struct {
	Documents []model.Document        `json:"documents"`
	Versions  []model.DocumentVersion `json:"versions"`
	Tags      []model.Tag             `json:"tags"`
	DocTags   []model.DocumentTag     `json:"document_tags"`
}

type ExportService struct {
	docs     *repo.DocumentRepo
	versions *repo.VersionRepo
	tags     *repo.TagRepo
	docTags  *repo.DocumentTagRepo
}

func NewExportService(docs *repo.DocumentRepo, versions *repo.VersionRepo, tags *repo.TagRepo, docTags *repo.DocumentTagRepo) *ExportService {
	return &ExportService{docs: docs, versions: versions, tags: tags, docTags: docTags}
}

func (s *ExportService) Export(ctx context.Context, userID string) (*ExportPayload, error) {
	docs, err := s.docs.List(ctx, userID, 0, 0, "")
	if err != nil {
		return nil, err
	}
	versions, err := s.versions.ListByUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	tags, err := s.tags.List(ctx, userID)
	if err != nil {
		return nil, err
	}
	docTags, err := s.docTags.ListByUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	return &ExportPayload{Documents: docs, Versions: versions, Tags: tags, DocTags: docTags}, nil
}
