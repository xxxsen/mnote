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

	"github.com/xxxsen/md2cfhtml"

	"github.com/xxxsen/mnote/internal/model"
)

type ExportPayload struct {
	Documents []model.Document        `json:"documents"`
	Versions  []model.DocumentVersion `json:"versions"`
	Tags      []model.Tag             `json:"tags"`
	DocTags   []model.DocumentTag     `json:"document_tags"`
}

type ExportService struct {
	docs      documentRepo
	summaries documentSummaryRepo
	versions  versionRepo
	tags      tagRepo
	docTags   documentTagRepo
}

type NotesExportItem struct {
	Title   string   `json:"title"`
	Content string   `json:"content"`
	Summary string   `json:"summary,omitempty"`
	TagList []string `json:"tag_list,omitempty"`
}

func NewExportService(
	docs documentRepo,
	summaries documentSummaryRepo,
	versions versionRepo,
	tags tagRepo,
	docTags documentTagRepo,
) *ExportService {
	return &ExportService{docs: docs, summaries: summaries, versions: versions, tags: tags, docTags: docTags}
}

func (s *ExportService) Export(ctx context.Context, userID string) (*ExportPayload, error) {
	docs, err := s.docs.List(ctx, userID, nil, 0, 0, "")
	if err != nil {
		return nil, fmt.Errorf("list documents: %w", err)
	}
	if err := s.attachSummaries(ctx, userID, docs); err != nil {
		return nil, fmt.Errorf("attach summaries: %w", err)
	}
	versions, err := s.versions.ListByUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list versions by user: %w", err)
	}
	tags, err := s.tags.List(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list tags: %w", err)
	}
	docTags, err := s.docTags.ListByUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list doc tags by user: %w", err)
	}
	return &ExportPayload{Documents: docs, Versions: versions, Tags: tags, DocTags: docTags}, nil
}

func (s *ExportService) ExportNotesZip(ctx context.Context, userID string) (string, error) {
	docs, err := s.docs.List(ctx, userID, nil, 0, 0, "")
	if err != nil {
		return "", fmt.Errorf("list documents: %w", err)
	}
	if err := s.attachSummaries(ctx, userID, docs); err != nil {
		return "", fmt.Errorf("attach summaries: %w", err)
	}
	tags, err := s.tags.List(ctx, userID)
	if err != nil {
		return "", fmt.Errorf("list tags: %w", err)
	}
	ids := make([]string, 0, len(docs))
	for _, doc := range docs {
		ids = append(ids, doc.ID)
	}
	docTags, err := s.docTags.ListTagIDsByDocIDs(ctx, userID, ids)
	if err != nil {
		return "", fmt.Errorf("list tag ids by doc ids: %w", err)
	}
	tagNames := make(map[string]string)
	for _, tag := range tags {
		tagNames[tag.ID] = tag.Name
	}

	tmp, err := os.CreateTemp("", "mnote-notes-*.zip")
	if err != nil {
		return "", fmt.Errorf("open file: %w", err)
	}
	defer func() { _ = tmp.Close() }()
	writer := zip.NewWriter(tmp)
	nameCounts := make(map[string]int)
	for _, doc := range docs {
		if err := writeExportEntry(writer, doc, docTags[doc.ID], tagNames, nameCounts); err != nil {
			_ = writer.Close()
			return "", err
		}
	}
	if err := writer.Close(); err != nil {
		return "", fmt.Errorf("write: %w", err)
	}
	return tmp.Name(), nil
}

func (s *ExportService) ConvertMarkdownToConfluenceHTML(ctx context.Context, userID, docID string) (string, error) {
	doc, err := s.docs.GetByID(ctx, userID, docID)
	if err != nil {
		return "", fmt.Errorf("get by id: %w", err)
	}
	html, err := md2cfhtml.ConvertString(doc.Content)
	if err != nil {
		return "", fmt.Errorf("convert string: %w", err)
	}
	return html, nil
}

func writeExportEntry(
	w *zip.Writer, doc model.Document, tagIDs []string,
	tagNames map[string]string, nameCounts map[string]int,
) error {
	baseTitle := strings.TrimSpace(doc.Title)
	if baseTitle == "" {
		baseTitle = "Untitled"
	}
	hash := sha256.Sum256([]byte(baseTitle))
	name := hex.EncodeToString(hash[:])
	nameCounts[name]++
	filename := name
	if nameCounts[name] > 1 {
		filename = fmt.Sprintf("%s-%d", name, nameCounts[name])
	}
	filename += ".json"
	tagList := make([]string, 0, len(tagIDs))
	for _, tagID := range tagIDs {
		if tagName, ok := tagNames[tagID]; ok {
			tagList = append(tagList, tagName)
		}
	}
	payload := NotesExportItem{
		Title: doc.Title, Content: doc.Content,
		Summary: strings.TrimSpace(doc.Summary), TagList: tagList,
	}
	content, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	entry, err := w.Create(filepath.ToSlash(filename))
	if err != nil {
		return fmt.Errorf("create entry: %w", err)
	}
	if _, err := entry.Write(content); err != nil {
		return fmt.Errorf("write: %w", err)
	}
	return nil
}

func (s *ExportService) attachSummaries(ctx context.Context, userID string, docs []model.Document) error {
	return populateDocSummaries(ctx, s.summaries, userID, docs)
}
