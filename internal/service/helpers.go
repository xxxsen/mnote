package service

import (
	"context"
	"fmt"

	"github.com/xxxsen/mnote/internal/model"
)

type summaryLister interface {
	ListByDocIDs(ctx context.Context, userID string, docIDs []string) (map[string]string, error)
}

func populateDocSummaries(ctx context.Context, repo summaryLister, userID string, docs []model.Document) error {
	if len(docs) == 0 {
		return nil
	}
	ids := make([]string, 0, len(docs))
	for _, doc := range docs {
		ids = append(ids, doc.ID)
	}
	summaries, err := repo.ListByDocIDs(ctx, userID, ids)
	if err != nil {
		return fmt.Errorf("list summaries by doc ids: %w", err)
	}
	for i := range docs {
		docs[i].Summary = summaries[docs[i].ID]
	}
	return nil
}
