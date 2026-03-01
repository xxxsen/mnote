package service

import (
	"context"
	"regexp"
	"sort"
	"strings"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/pkg/timeutil"
	"github.com/xxxsen/mnote/internal/repo"
)

type AssetService struct {
	assets    *repo.AssetRepo
	docAssets *repo.DocumentAssetRepo
}

type AssetListItem struct {
	model.Asset
	RefCount int `json:"ref_count"`
}

type AssetReference struct {
	DocumentID string `json:"document_id"`
	Title      string `json:"title"`
	Mtime      int64  `json:"mtime"`
}

func NewAssetService(assets *repo.AssetRepo, docAssets *repo.DocumentAssetRepo) *AssetService {
	return &AssetService{assets: assets, docAssets: docAssets}
}

func (s *AssetService) RecordUpload(ctx context.Context, userID, fileKey, url, name, contentType string, size int64) error {
	if userID == "" || fileKey == "" {
		return nil
	}
	now := timeutil.NowUnix()
	asset := &model.Asset{
		ID:          newID(),
		UserID:      userID,
		FileKey:     fileKey,
		URL:         url,
		Name:        name,
		ContentType: contentType,
		Size:        size,
		Ctime:       now,
		Mtime:       now,
	}
	return s.assets.UpsertByFileKey(ctx, asset)
}

func (s *AssetService) SyncDocumentReferences(ctx context.Context, userID, docID, content string) error {
	if s == nil || s.assets == nil || s.docAssets == nil {
		return nil
	}
	keys := extractFileKeys(content)
	urls := extractAssetURLs(content)
	if len(keys) == 0 && len(urls) == 0 {
		return s.docAssets.ReplaceByDocument(ctx, userID, docID, []string{}, timeutil.NowUnix())
	}
	assets := make([]model.Asset, 0)
	if len(keys) > 0 {
		items, err := s.assets.ListByFileKeys(ctx, userID, keys)
		if err != nil {
			return err
		}
		assets = append(assets, items...)
	}
	if len(urls) > 0 {
		items, err := s.assets.ListByURLs(ctx, userID, urls)
		if err != nil {
			return err
		}
		assets = append(assets, items...)
	}
	idSet := make(map[string]struct{}, len(assets))
	assetIDs := make([]string, 0, len(assets))
	for _, item := range assets {
		if _, exists := idSet[item.ID]; exists {
			continue
		}
		idSet[item.ID] = struct{}{}
		assetIDs = append(assetIDs, item.ID)
	}
	sort.Strings(assetIDs)
	return s.docAssets.ReplaceByDocument(ctx, userID, docID, assetIDs, timeutil.NowUnix())
}

func (s *AssetService) List(ctx context.Context, userID, query string, limit, offset uint) ([]AssetListItem, error) {
	items, err := s.assets.ListByUser(ctx, userID, strings.TrimSpace(query), limit, offset)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(items))
	for _, item := range items {
		ids = append(ids, item.ID)
	}
	counts, err := s.docAssets.CountByAssets(ctx, userID, ids)
	if err != nil {
		return nil, err
	}
	result := make([]AssetListItem, 0, len(items))
	for _, item := range items {
		result = append(result, AssetListItem{Asset: item, RefCount: counts[item.ID]})
	}
	return result, nil
}

func (s *AssetService) ListReferences(ctx context.Context, userID, assetID string) ([]AssetReference, error) {
	if _, err := s.assets.GetByID(ctx, userID, assetID); err != nil {
		return nil, err
	}
	items, err := s.docAssets.ListReferences(ctx, userID, assetID)
	if err != nil {
		return nil, err
	}
	result := make([]AssetReference, 0, len(items))
	for _, item := range items {
		result = append(result, AssetReference{DocumentID: item.DocumentID, Title: item.Title, Mtime: item.Mtime})
	}
	return result, nil
}

func (s *AssetService) RemoveDocumentReferences(ctx context.Context, userID, docID string) error {
	if s == nil || s.docAssets == nil {
		return nil
	}
	return s.docAssets.DeleteByDocument(ctx, userID, docID)
}

var fileKeyRegex = regexp.MustCompile(`(?:https?://[^\s)]+)?/api/v1/files/([a-zA-Z0-9._\-]+)`)
var assetURLRegex = regexp.MustCompile(`https?://[^\s)"'>]+`)

func extractFileKeys(content string) []string {
	matches := fileKeyRegex.FindAllStringSubmatch(content, -1)
	if len(matches) == 0 {
		return []string{}
	}
	keys := make([]string, 0, len(matches))
	seen := make(map[string]struct{})
	for _, match := range matches {
		if len(match) < 2 {
			continue
		}
		key := strings.TrimSpace(match[1])
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		keys = append(keys, key)
	}
	return keys
}

func extractAssetURLs(content string) []string {
	matches := assetURLRegex.FindAllString(content, -1)
	if len(matches) == 0 {
		return []string{}
	}
	urls := make([]string, 0, len(matches))
	seen := make(map[string]struct{})
	for _, raw := range matches {
		u := strings.TrimSpace(raw)
		if u == "" {
			continue
		}
		if _, ok := seen[u]; ok {
			continue
		}
		seen[u] = struct{}{}
		urls = append(urls, u)
	}
	return urls
}
