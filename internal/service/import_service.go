package service

import (
	"archive/zip"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

type ImportNote struct {
	Title   string   `json:"title"`
	Content string   `json:"content"`
	Tags    []string `json:"tags"`
	Source  string   `json:"source"`
}

type ImportJob struct {
	ID        string
	UserID    string
	Notes     []ImportNote
	Tags      []string
	CreatedAt time.Time
	Status    string
	Processed int
	Total     int
	Report    *ImportReport
}

type ImportPreview struct {
	NotesCount int          `json:"notes_count"`
	Tags       []string     `json:"tags"`
	TagsCount  int          `json:"tags_count"`
	Conflicts  int          `json:"conflicts"`
	Samples    []ImportNote `json:"samples"`
}

type ImportReport struct {
	Created      int      `json:"created"`
	Updated      int      `json:"updated"`
	Skipped      int      `json:"skipped"`
	Failed       int      `json:"failed"`
	Errors       []string `json:"errors"`
	FailedTitles []string `json:"failed_titles"`
}

type ImportService struct {
	documents *DocumentService
	tags      *TagService
	jobs      map[string]*ImportJob
	mu        sync.Mutex
}

func NewImportService(documents *DocumentService, tags *TagService) *ImportService {
	return &ImportService{
		documents: documents,
		tags:      tags,
		jobs:      make(map[string]*ImportJob),
	}
}

func (s *ImportService) CreateHedgeDocJob(ctx context.Context, userID string, filePath string) (*ImportJob, error) {
	reader, err := zip.OpenReader(filePath)
	if err != nil {
		return nil, err
	}
	defer reader.Close()

	notes := make([]ImportNote, 0)
	uniqueTags := make(map[string]bool)
	nameCounts := make(map[string]int)
	for _, file := range reader.File {
		if file.FileInfo().IsDir() {
			continue
		}
		if strings.ToLower(filepath.Ext(file.Name)) != ".md" {
			continue
		}
		opened, err := file.Open()
		if err != nil {
			return nil, err
		}
		contentBytes, err := io.ReadAll(opened)
		_ = opened.Close()
		if err != nil {
			return nil, err
		}
		content := string(contentBytes)
		cleaned, tags := extractHedgeDocTags(content)
		for _, tag := range tags {
			uniqueTags[tag] = true
		}
		title := strings.TrimSuffix(filepath.Base(file.Name), filepath.Ext(file.Name))
		title = strings.TrimSpace(title)
		if title == "" {
			title = "Untitled"
		}
		title = uniqueTitle(title, nameCounts)
		notes = append(notes, ImportNote{
			Title:   title,
			Content: cleaned,
			Tags:    tags,
			Source:  file.Name,
		})
	}
	if len(notes) == 0 {
		return nil, appErr.ErrInvalid
	}
	allTags := make([]string, 0, len(uniqueTags))
	for tag := range uniqueTags {
		allTags = append(allTags, tag)
	}

	job := &ImportJob{
		ID:        newID(),
		UserID:    userID,
		Notes:     notes,
		Tags:      allTags,
		CreatedAt: time.Now(),
		Status:    "ready",
		Processed: 0,
		Total:     len(notes),
	}
	s.mu.Lock()
	s.jobs[job.ID] = job
	s.mu.Unlock()
	return job, nil
}

func (s *ImportService) Preview(userID, jobID string) (*ImportPreview, error) {
	job, err := s.getJob(userID, jobID)
	if err != nil {
		return nil, err
	}
	conflicts := 0
	for _, note := range job.Notes {
		if note.Title == "" {
			continue
		}
		if _, err := s.documents.GetByTitle(context.Background(), userID, note.Title); err == nil {
			conflicts += 1
		}
	}
	samples := make([]ImportNote, 0)
	limit := 3
	for i := 0; i < len(job.Notes) && i < limit; i += 1 {
		samples = append(samples, job.Notes[i])
	}
	return &ImportPreview{
		NotesCount: len(job.Notes),
		Tags:       job.Tags,
		TagsCount:  len(job.Tags),
		Conflicts:  conflicts,
		Samples:    samples,
	}, nil
}

func (s *ImportService) Confirm(ctx context.Context, userID, jobID string, mode string) error {
	job, err := s.getJob(userID, jobID)
	if err != nil {
		return err
	}
	mode = strings.ToLower(strings.TrimSpace(mode))
	if mode == "" {
		mode = "append"
	}
	if mode != "append" && mode != "skip" && mode != "overwrite" {
		return appErr.ErrInvalid
	}
	if job.Status == "running" {
		return appErr.ErrInvalid
	}
	job.Status = "running"
	job.Processed = 0
	job.Total = len(job.Notes)
	job.Report = &ImportReport{}
	go s.runImport(context.Background(), job, mode)
	return nil
}

func (s *ImportService) Status(userID, jobID string) (*ImportJob, error) {
	job, err := s.getJob(userID, jobID)
	if err != nil {
		return nil, err
	}
	return job, nil
}

func (s *ImportService) runImport(ctx context.Context, job *ImportJob, mode string) {
	report := &ImportReport{}
	for _, note := range job.Notes {
		if note.Title == "" {
			report.Failed += 1
			report.Errors = append(report.Errors, fmt.Sprintf("empty title in %s", note.Source))
			report.FailedTitles = append(report.FailedTitles, note.Source)
			job.Processed += 1
			continue
		}
		var existingID string
		var exists bool
		if mode != "append" {
			if doc, err := s.documents.GetByTitle(ctx, job.UserID, note.Title); err == nil {
				existingID = doc.ID
				exists = true
			} else if !errors.Is(err, appErr.ErrNotFound) {
				report.Failed += 1
				report.Errors = append(report.Errors, fmt.Sprintf("lookup title failed: %s", note.Title))
				report.FailedTitles = append(report.FailedTitles, note.Title)
				job.Processed += 1
				continue
			}
		}
		if existingID != "" && mode == "skip" {
			report.Skipped += 1
			job.Processed += 1
			continue
		}
		if mode == "append" {
			if doc, err := s.documents.GetByTitle(ctx, job.UserID, note.Title); err == nil {
				exists = true
				_ = doc
			} else if !errors.Is(err, appErr.ErrNotFound) {
				report.Failed += 1
				report.Errors = append(report.Errors, fmt.Sprintf("lookup title failed: %s", note.Title))
				report.FailedTitles = append(report.FailedTitles, note.Title)
				job.Processed += 1
				continue
			}
		}
		tagIDs, err := s.ensureTags(ctx, job.UserID, note.Tags)
		if err != nil {
			report.Failed += 1
			report.Errors = append(report.Errors, fmt.Sprintf("create tags failed: %s", note.Title))
			report.FailedTitles = append(report.FailedTitles, note.Title)
			job.Processed += 1
			continue
		}
		if existingID != "" && mode == "overwrite" {
			err = s.documents.Update(ctx, job.UserID, existingID, DocumentUpdateInput{
				Title:   note.Title,
				Content: note.Content,
				TagIDs:  tagIDs,
			})
			if err != nil {
				report.Failed += 1
				report.Errors = append(report.Errors, fmt.Sprintf("overwrite failed: %s", note.Title))
				report.FailedTitles = append(report.FailedTitles, note.Title)
				job.Processed += 1
				continue
			}
			report.Updated += 1
			job.Processed += 1
			continue
		}
		finalTitle := note.Title
		if mode == "append" && exists {
			finalTitle = s.appendSuffix(ctx, job.UserID, note.Title)
		}
		_, err = s.documents.Create(ctx, job.UserID, DocumentCreateInput{
			Title:   finalTitle,
			Content: note.Content,
			TagIDs:  tagIDs,
		})
		if err != nil {
			report.Failed += 1
			report.Errors = append(report.Errors, fmt.Sprintf("create failed: %s", finalTitle))
			report.FailedTitles = append(report.FailedTitles, finalTitle)
			job.Processed += 1
			continue
		}
		report.Created += 1
		job.Processed += 1
	}
	job.Report = report
	job.Status = "done"
}

func (s *ImportService) ensureTags(ctx context.Context, userID string, tags []string) ([]string, error) {
	if len(tags) == 0 {
		return []string{}, nil
	}
	cleaned := normalizeTags(tags)
	if len(cleaned) == 0 {
		return []string{}, nil
	}
	existing, err := s.tags.ListByNames(ctx, userID, cleaned)
	if err != nil {
		return nil, err
	}
	ids := make(map[string]string)
	for _, tag := range existing {
		ids[strings.ToLower(tag.Name)] = tag.ID
	}
	missing := make([]string, 0)
	for _, name := range cleaned {
		if _, ok := ids[strings.ToLower(name)]; !ok {
			missing = append(missing, name)
		}
	}
	if len(missing) > 0 {
		created, err := s.tags.CreateBatch(ctx, userID, missing)
		if err != nil {
			return nil, err
		}
		for _, tag := range created {
			ids[strings.ToLower(tag.Name)] = tag.ID
		}
	}
	result := make([]string, 0, len(cleaned))
	for _, name := range cleaned {
		if id, ok := ids[strings.ToLower(name)]; ok {
			result = append(result, id)
		}
	}
	return result, nil
}

func (s *ImportService) appendSuffix(ctx context.Context, userID, title string) string {
	base := strings.TrimSpace(title)
	if base == "" {
		base = "Untitled"
	}
	for i := 2; i < 10000; i += 1 {
		candidate := fmt.Sprintf("%s (%d)", base, i)
		if _, err := s.documents.GetByTitle(ctx, userID, candidate); errors.Is(err, appErr.ErrNotFound) {
			return candidate
		}
	}
	return fmt.Sprintf("%s (%d)", base, time.Now().Unix())
}

func (s *ImportService) getJob(userID, jobID string) (*ImportJob, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	job, ok := s.jobs[jobID]
	if !ok {
		return nil, appErr.ErrNotFound
	}
	if job.UserID != userID {
		return nil, appErr.ErrNotFound
	}
	return job, nil
}

var tagLineRegex = regexp.MustCompile(`^######\s+tags:\s*(.*)$`)

func extractHedgeDocTags(content string) (string, []string) {
	lines := strings.Split(content, "\n")
	cleaned := make([]string, 0, len(lines))
	collected := make([]string, 0)
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		match := tagLineRegex.FindStringSubmatch(trimmed)
		if match == nil {
			cleaned = append(cleaned, line)
			continue
		}
		collected = append(collected, parseTagLine(match[1])...)
	}
	return strings.TrimSpace(strings.Join(cleaned, "\n")), normalizeTags(collected)
}

func parseTagLine(value string) []string {
	value = strings.ReplaceAll(value, ",", " ")
	parts := strings.Fields(value)
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.Trim(part, " `")
		if trimmed == "" {
			continue
		}
		result = append(result, trimmed)
	}
	return result
}

func normalizeTags(tags []string) []string {
	seen := make(map[string]bool)
	result := make([]string, 0, len(tags))
	for _, tag := range tags {
		normalized := strings.TrimSpace(tag)
		if normalized == "" {
			continue
		}
		key := strings.ToLower(normalized)
		if seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, normalized)
	}
	return result
}

func uniqueTitle(title string, counts map[string]int) string {
	counts[title] += 1
	if counts[title] == 1 {
		return title
	}
	return fmt.Sprintf("%s (%d)", title, counts[title])
}

func SaveTempFile(fileName string, reader io.Reader) (string, error) {
	tmp, err := os.CreateTemp("", "mnote-import-*.zip")
	if err != nil {
		return "", err
	}
	defer tmp.Close()
	if _, err := io.Copy(tmp, reader); err != nil {
		_ = os.Remove(tmp.Name())
		return "", err
	}
	return tmp.Name(), nil
}
