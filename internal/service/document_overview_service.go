package service

import (
	"context"
	"fmt"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/pkg/safeconv"
)

type DocumentOverview struct {
	Recent       []model.Document
	TagCounts    map[string]int
	Total        int
	StarredTotal int
}

func (s *DocumentService) Overview(
	ctx context.Context, userID string, recentLimit uint,
) (*DocumentOverview, error) {
	page := Page{Limit: safeconv.UintToInt(recentLimit)}.Clamp(5, 20)
	recentLimit = safeconv.IntToUint(page.Limit)
	recent, err := s.docs.List(ctx, userID, nil, recentLimit, 0, "mtime desc")
	if err != nil {
		return nil, fmt.Errorf("list: %w", err)
	}
	items, err := s.tags.ListByUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list by user: %w", err)
	}
	counts := make(map[string]int)
	for _, item := range items {
		counts[item.TagID]++
	}
	count, err := s.docs.Count(ctx, userID, nil)
	if err != nil {
		return nil, fmt.Errorf("count total: %w", err)
	}
	starredVal := 1
	starredCount, err := s.docs.Count(ctx, userID, &starredVal)
	if err != nil {
		return nil, fmt.Errorf("count starred: %w", err)
	}
	return &DocumentOverview{
		Recent: recent, TagCounts: counts, Total: count, StarredTotal: starredCount,
	}, nil
}
