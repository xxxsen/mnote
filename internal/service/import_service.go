package service

import (
	"archive/zip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/repo"
)

type ImportPreview struct {
	NotesCount int                `json:"notes_count"`
	Tags       []string           `json:"tags"`
	TagsCount  int                `json:"tags_count"`
	Conflicts  int                `json:"conflicts"`
	Samples    []model.ImportNote `json:"samples"`
}

type ImportService struct {
	documents *DocumentService
	tags      *TagService
	jobRepo   *repo.ImportJobRepo
	noteRepo  *repo.ImportJobNoteRepo
}

const (
	maxImportNotes = 2000
	maxNoteBytes   = 32 * 1024
)

func NewImportService(documents *DocumentService, tags *TagService, jobRepo *repo.ImportJobRepo, noteRepo *repo.ImportJobNoteRepo) *ImportService {
	return &ImportService{
		documents: documents,
		tags:      tags,
		jobRepo:   jobRepo,
		noteRepo:  noteRepo,
	}
}

func (s *ImportService) CreateHedgeDocJob(ctx context.Context, userID string, filePath string) (*model.ImportJob, error) {
	reader, err := zip.OpenReader(filePath)
	if err != nil {
		return nil, err
	}
	defer reader.Close()
	if s.jobRepo == nil || s.noteRepo == nil {
		return nil, appErr.ErrInvalid
	}

	now := time.Now().Unix()
	job := &model.ImportJob{
		ID:             newID(),
		UserID:         userID,
		Source:         "hedgedoc",
		Status:         "parsing",
		RequireContent: false,
		Processed:      0,
		Total:          0,
		Tags:           []string{},
		Report:         nil,
		Ctime:          now,
		Mtime:          now,
	}
	if err := s.jobRepo.Create(ctx, job); err != nil {
		return nil, err
	}

	notes := make([]model.ImportNote, 0)
	noteRows := make([]model.ImportJobNote, 0)
	uniqueTags := make(map[string]bool)
	nameCounts := make(map[string]int)
	position := 0
	for _, file := range reader.File {
		if file.FileInfo().IsDir() {
			continue
		}
		if strings.ToLower(filepath.Ext(file.Name)) != ".md" {
			continue
		}
		if position >= maxImportNotes {
			_ = s.jobRepo.Delete(context.Background(), userID, job.ID)
			return nil, appErr.ErrImportTooManyNotes
		}
		opened, err := file.Open()
		if err != nil {
			return nil, err
		}
		contentBytes, err := io.ReadAll(io.LimitReader(opened, maxNoteBytes+1))
		_ = opened.Close()
		if err != nil {
			return nil, err
		}
		if len(contentBytes) > maxNoteBytes {
			_ = s.jobRepo.Delete(context.Background(), userID, job.ID)
			return nil, appErr.ErrImportNoteTooLarge
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
		notes = append(notes, model.ImportNote{
			Title:   title,
			Content: cleaned,
			Tags:    tags,
			Source:  file.Name,
		})
		noteRows = append(noteRows, model.ImportJobNote{
			ID:       newID(),
			JobID:    job.ID,
			UserID:   userID,
			Position: position,
			Title:    title,
			Content:  cleaned,
			Summary:  "",
			Tags:     tags,
			Source:   file.Name,
			Ctime:    now,
		})
		position += 1
	}
	if len(notes) == 0 {
		_ = s.jobRepo.Delete(context.Background(), userID, job.ID)
		return nil, appErr.ErrInvalid
	}
	allTags := make([]string, 0, len(uniqueTags))
	for tag := range uniqueTags {
		allTags = append(allTags, tag)
	}
	if err := s.noteRepo.InsertBatch(ctx, noteRows); err != nil {
		_ = s.jobRepo.Delete(context.Background(), userID, job.ID)
		return nil, err
	}
	job.Tags = allTags
	job.Total = len(notes)
	job.Status = "ready"
	job.Mtime = time.Now().Unix()
	if err := s.jobRepo.UpdateSummary(ctx, job); err != nil {
		return nil, err
	}
	return job, nil
}

type notesImportPayload struct {
	Title   string   `json:"title"`
	Content string   `json:"content"`
	Summary string   `json:"summary,omitempty"`
	TagList []string `json:"tag_list,omitempty"`
}

func (s *ImportService) CreateNotesJob(ctx context.Context, userID string, filePath string) (*model.ImportJob, error) {
	reader, err := zip.OpenReader(filePath)
	if err != nil {
		return nil, err
	}
	defer reader.Close()
	if s.jobRepo == nil || s.noteRepo == nil {
		return nil, appErr.ErrInvalid
	}

	now := time.Now().Unix()
	job := &model.ImportJob{
		ID:             newID(),
		UserID:         userID,
		Source:         "notes",
		Status:         "parsing",
		RequireContent: true,
		Processed:      0,
		Total:          0,
		Tags:           []string{},
		Report:         nil,
		Ctime:          now,
		Mtime:          now,
	}
	if err := s.jobRepo.Create(ctx, job); err != nil {
		return nil, err
	}

	notes := make([]model.ImportNote, 0)
	noteRows := make([]model.ImportJobNote, 0)
	uniqueTags := make(map[string]bool)
	position := 0
	for _, file := range reader.File {
		if file.FileInfo().IsDir() {
			continue
		}
		if strings.ToLower(filepath.Ext(file.Name)) != ".json" {
			continue
		}
		if position >= maxImportNotes {
			_ = s.jobRepo.Delete(context.Background(), userID, job.ID)
			return nil, appErr.ErrImportTooManyNotes
		}
		opened, err := file.Open()
		if err != nil {
			return nil, err
		}
		contentBytes, err := io.ReadAll(io.LimitReader(opened, maxNoteBytes+1))
		_ = opened.Close()
		if err != nil {
			return nil, err
		}
		var payload notesImportPayload
		if err := json.Unmarshal(contentBytes, &payload); err != nil {
			_ = s.jobRepo.Delete(context.Background(), userID, job.ID)
			return nil, appErr.ErrImportInvalidJSON
		}
		title := strings.TrimSpace(payload.Title)
		content := payload.Content
		if len([]byte(content)) > maxNoteBytes {
			_ = s.jobRepo.Delete(context.Background(), userID, job.ID)
			return nil, appErr.ErrImportNoteTooLarge
		}
		if content != "" {
			content = strings.TrimRight(content, "\n")
		}
		cleanTags := normalizeTags(payload.TagList)
		for _, tag := range cleanTags {
			uniqueTags[tag] = true
		}
		notes = append(notes, model.ImportNote{
			Title:   title,
			Content: content,
			Summary: strings.TrimSpace(payload.Summary),
			Tags:    cleanTags,
			Source:  file.Name,
		})
		noteRows = append(noteRows, model.ImportJobNote{
			ID:       newID(),
			JobID:    job.ID,
			UserID:   userID,
			Position: position,
			Title:    title,
			Content:  content,
			Summary:  strings.TrimSpace(payload.Summary),
			Tags:     cleanTags,
			Source:   file.Name,
			Ctime:    now,
		})
		position += 1
	}
	if len(notes) == 0 {
		_ = s.jobRepo.Delete(context.Background(), userID, job.ID)
		return nil, appErr.ErrInvalid
	}
	allTags := make([]string, 0, len(uniqueTags))
	for tag := range uniqueTags {
		allTags = append(allTags, tag)
	}
	if err := s.noteRepo.InsertBatch(ctx, noteRows); err != nil {
		_ = s.jobRepo.Delete(context.Background(), userID, job.ID)
		return nil, err
	}
	job.Tags = allTags
	job.Total = len(notes)
	job.Status = "ready"
	job.Mtime = time.Now().Unix()
	if err := s.jobRepo.UpdateSummary(ctx, job); err != nil {
		return nil, err
	}
	return job, nil
}

func (s *ImportService) Preview(userID, jobID string) (*ImportPreview, error) {
	job, err := s.jobRepo.Get(context.Background(), userID, jobID)
	if err != nil {
		return nil, err
	}
	if s.noteRepo == nil {
		return nil, appErr.ErrInvalid
	}
	titles, err := s.noteRepo.ListTitles(context.Background(), userID, jobID)
	if err != nil {
		return nil, err
	}
	conflicts := 0
	for _, title := range titles {
		if title == "" {
			continue
		}
		if _, err := s.documents.GetByTitle(context.Background(), userID, title); err == nil {
			conflicts += 1
		}
	}
	samples := make([]model.ImportNote, 0)
	limit := 3
	notes, err := s.noteRepo.ListByJobLimit(context.Background(), userID, jobID, limit)
	if err != nil {
		return nil, err
	}
	for _, note := range notes {
		samples = append(samples, model.ImportNote{
			Title:   note.Title,
			Content: note.Content,
			Summary: note.Summary,
			Tags:    note.Tags,
			Source:  note.Source,
		})
	}
	return &ImportPreview{
		NotesCount: job.Total,
		Tags:       job.Tags,
		TagsCount:  len(job.Tags),
		Conflicts:  conflicts,
		Samples:    samples,
	}, nil
}

func (s *ImportService) Confirm(ctx context.Context, userID, jobID string, mode string) error {
	job, err := s.jobRepo.Get(ctx, userID, jobID)
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
	updated, err := s.jobRepo.UpdateStatusIf(ctx, userID, jobID, job.Status, "running", time.Now().Unix())
	if err != nil {
		return err
	}
	if !updated {
		return appErr.ErrInvalid
	}
	go s.runImport(context.Background(), job, mode)
	return nil
}

func (s *ImportService) Status(userID, jobID string) (*model.ImportJob, error) {
	job, err := s.jobRepo.Get(context.Background(), userID, jobID)
	if err != nil {
		return nil, err
	}
	return job, nil
}

func (s *ImportService) runImport(ctx context.Context, job *model.ImportJob, mode string) {
	report := &model.ImportReport{}
	if s.noteRepo == nil || s.jobRepo == nil {
		return
	}
	notes, err := s.noteRepo.ListByJob(ctx, job.UserID, job.ID)
	if err != nil {
		_ = s.jobRepo.UpdateProgress(ctx, job.UserID, job.ID, 0, job.Total, report, "done", time.Now().Unix())
		return
	}
	processed := 0
	for _, note := range notes {
		if note.Title == "" || (job.RequireContent && strings.TrimSpace(note.Content) == "") {
			report.Failed += 1
			report.Errors = append(report.Errors, fmt.Sprintf("empty title in %s", note.Source))
			report.FailedTitles = append(report.FailedTitles, note.Source)
			processed += 1
			if processed%10 == 0 {
				_ = s.jobRepo.UpdateProgress(ctx, job.UserID, job.ID, processed, job.Total, report, "running", time.Now().Unix())
			}
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
				processed += 1
				if processed%10 == 0 {
					_ = s.jobRepo.UpdateProgress(ctx, job.UserID, job.ID, processed, job.Total, report, "running", time.Now().Unix())
				}
				continue
			}
		}
		if existingID != "" && mode == "skip" {
			report.Skipped += 1
			processed += 1
			if processed%10 == 0 {
				_ = s.jobRepo.UpdateProgress(ctx, job.UserID, job.ID, processed, job.Total, report, "running", time.Now().Unix())
			}
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
				processed += 1
				if processed%10 == 0 {
					_ = s.jobRepo.UpdateProgress(ctx, job.UserID, job.ID, processed, job.Total, report, "running", time.Now().Unix())
				}
				continue
			}
		}
		tagIDs, err := s.ensureTags(ctx, job.UserID, note.Tags)
		if err != nil {
			report.Failed += 1
			report.Errors = append(report.Errors, fmt.Sprintf("create tags failed: %s", note.Title))
			report.FailedTitles = append(report.FailedTitles, note.Title)
			processed += 1
			if processed%10 == 0 {
				_ = s.jobRepo.UpdateProgress(ctx, job.UserID, job.ID, processed, job.Total, report, "running", time.Now().Unix())
			}
			continue
		}
		if existingID != "" && mode == "overwrite" {
			var summary *string
			if note.Summary != "" {
				summary = &note.Summary
			}
			err = s.documents.Update(ctx, job.UserID, existingID, DocumentUpdateInput{
				Title:   note.Title,
				Content: note.Content,
				TagIDs:  tagIDs,
				Summary: summary,
			})
			if err != nil {
				report.Failed += 1
				report.Errors = append(report.Errors, fmt.Sprintf("overwrite failed: %s", note.Title))
				report.FailedTitles = append(report.FailedTitles, note.Title)
				processed += 1
				if processed%10 == 0 {
					_ = s.jobRepo.UpdateProgress(ctx, job.UserID, job.ID, processed, job.Total, report, "running", time.Now().Unix())
				}
				continue
			}
			report.Updated += 1
			processed += 1
			if processed%10 == 0 {
				_ = s.jobRepo.UpdateProgress(ctx, job.UserID, job.ID, processed, job.Total, report, "running", time.Now().Unix())
			}
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
			Summary: note.Summary,
		})
		if err != nil {
			report.Failed += 1
			report.Errors = append(report.Errors, fmt.Sprintf("create failed: %s", finalTitle))
			report.FailedTitles = append(report.FailedTitles, finalTitle)
			processed += 1
			if processed%10 == 0 {
				_ = s.jobRepo.UpdateProgress(ctx, job.UserID, job.ID, processed, job.Total, report, "running", time.Now().Unix())
			}
			continue
		}
		report.Created += 1
		processed += 1
		if processed%10 == 0 {
			_ = s.jobRepo.UpdateProgress(ctx, job.UserID, job.ID, processed, job.Total, report, "running", time.Now().Unix())
		}
	}
	_ = s.jobRepo.UpdateProgress(ctx, job.UserID, job.ID, processed, job.Total, report, "done", time.Now().Unix())
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
