package service

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

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

type NotesExportItem struct {
	Title   string   `json:"title"`
	Content string   `json:"content"`
	Summary string   `json:"summary,omitempty"`
	TagList []string `json:"tag_list,omitempty"`
}

func NewExportService(docs *repo.DocumentRepo, versions *repo.VersionRepo, tags *repo.TagRepo, docTags *repo.DocumentTagRepo) *ExportService {
	return &ExportService{docs: docs, versions: versions, tags: tags, docTags: docTags}
}

func (s *ExportService) Export(ctx context.Context, userID string) (*ExportPayload, error) {
	docs, err := s.docs.List(ctx, userID, nil, 0, 0, "")
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

func (s *ExportService) ExportNotesZip(ctx context.Context, userID string) (string, error) {
	docs, err := s.docs.List(ctx, userID, nil, 0, 0, "")
	if err != nil {
		return "", err
	}
	tags, err := s.tags.List(ctx, userID)
	if err != nil {
		return "", err
	}
	ids := make([]string, 0, len(docs))
	for _, doc := range docs {
		ids = append(ids, doc.ID)
	}
	docTags, err := s.docTags.ListTagIDsByDocIDs(ctx, userID, ids)
	if err != nil {
		return "", err
	}
	tagNames := make(map[string]string)
	for _, tag := range tags {
		tagNames[tag.ID] = tag.Name
	}

	tmp, err := os.CreateTemp("", "mnote-notes-*.zip")
	if err != nil {
		return "", err
	}
	defer tmp.Close()
	writer := zip.NewWriter(tmp)
	nameCounts := make(map[string]int)
	for _, doc := range docs {
		baseTitle := strings.TrimSpace(doc.Title)
		if baseTitle == "" {
			baseTitle = "Untitled"
		}
		hash := sha256.Sum256([]byte(baseTitle))
		name := hex.EncodeToString(hash[:])
		nameCounts[name] += 1
		filename := name
		if nameCounts[name] > 1 {
			filename = fmt.Sprintf("%s-%d", name, nameCounts[name])
		}
		filename = filename + ".json"
		tagIDs := docTags[doc.ID]
		tagList := make([]string, 0, len(tagIDs))
		for _, tagID := range tagIDs {
			if tagName, ok := tagNames[tagID]; ok {
				tagList = append(tagList, tagName)
			}
		}
		payload := NotesExportItem{
			Title:   doc.Title,
			Content: doc.Content,
			Summary: strings.TrimSpace(doc.Summary),
			TagList: tagList,
		}
		content, err := json.Marshal(payload)
		if err != nil {
			_ = writer.Close()
			return "", err
		}
		entry, err := writer.Create(filepath.ToSlash(filename))
		if err != nil {
			_ = writer.Close()
			return "", err
		}
		if _, err := entry.Write(content); err != nil {
			_ = writer.Close()
			return "", err
		}
	}
	if err := writer.Close(); err != nil {
		return "", err
	}
	return tmp.Name(), nil
}
