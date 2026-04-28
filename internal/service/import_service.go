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

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/timeutil"
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
	jobRepo   importJobRepo
	noteRepo  importJobNoteRepo
}

const (
	maxImportNotes = 2000
	maxNoteBytes   = 128 * 1024
)

func NewImportService(
	documents *DocumentService,
	tags *TagService,
	jobRepo importJobRepo,
	noteRepo importJobNoteRepo,
) *ImportService {
	return &ImportService{
		documents: documents,
		tags:      tags,
		jobRepo:   jobRepo,
		noteRepo:  noteRepo,
	}
}

type notesImportPayload struct {
	Title   string   `json:"title"`
	Content string   `json:"content"`
	Summary string   `json:"summary,omitempty"`
	TagList []string `json:"tag_list,omitempty"`
}

type parsedNote struct {
	note model.ImportNote
	row  model.ImportJobNote
}

type (
	fileFilter func(file *zip.File) bool
	fileParser func(file *zip.File, jobID, userID string, position int, now int64) (*parsedNote, error)
)

func (s *ImportService) CreateHedgeDocJob(ctx context.Context, userID, filePath string) (*model.ImportJob, error) {
	nameCounts := make(map[string]int)
	filter := func(file *zip.File) bool {
		return strings.ToLower(filepath.Ext(file.Name)) == ".md"
	}
	parser := func(file *zip.File, jobID, userID string, position int, now int64) (*parsedNote, error) {
		contentBytes, err := readZipFile(file)
		if err != nil {
			return nil, err
		}
		content := string(contentBytes)
		cleaned, tags := extractHedgeDocTags(content)
		title := strings.TrimSuffix(filepath.Base(file.Name), filepath.Ext(file.Name))
		title = strings.TrimSpace(title)
		if title == "" {
			title = "Untitled"
		}
		title = uniqueTitle(title, nameCounts)
		return &parsedNote{
			note: model.ImportNote{Title: title, Content: cleaned, Tags: tags, Source: file.Name},
			row: model.ImportJobNote{
				ID: newID(), JobID: jobID, UserID: userID, Position: position,
				Title: title, Content: cleaned, Tags: tags, Source: file.Name, Ctime: now,
			},
		}, nil
	}
	return s.createImportJob(ctx, userID, "hedgedoc", false, filePath, filter, parser)
}

func (s *ImportService) CreateNotesJob(ctx context.Context, userID, filePath string) (*model.ImportJob, error) {
	filter := func(file *zip.File) bool {
		return strings.ToLower(filepath.Ext(file.Name)) == ".json"
	}
	parser := func(file *zip.File, jobID, userID string, position int, now int64) (*parsedNote, error) {
		contentBytes, err := readZipFile(file)
		if err != nil {
			return nil, err
		}
		var payload notesImportPayload
		if err := json.Unmarshal(contentBytes, &payload); err != nil {
			return nil, appErr.ErrImportInvalidJSON
		}
		title := strings.TrimSpace(payload.Title)
		content := payload.Content
		if len([]byte(content)) > maxNoteBytes {
			return nil, appErr.ErrImportNoteTooLarge
		}
		if content != "" {
			content = strings.TrimRight(content, "\n")
		}
		cleanTags := normalizeTags(payload.TagList)
		summary := strings.TrimSpace(payload.Summary)
		return &parsedNote{
			note: model.ImportNote{Title: title, Content: content, Summary: summary, Tags: cleanTags, Source: file.Name},
			row: model.ImportJobNote{
				ID: newID(), JobID: jobID, UserID: userID, Position: position,
				Title: title, Content: content, Summary: summary, Tags: cleanTags, Source: file.Name, Ctime: now,
			},
		}, nil
	}
	return s.createImportJob(ctx, userID, "notes", true, filePath, filter, parser)
}

func readZipFile(file *zip.File) ([]byte, error) {
	opened, err := file.Open()
	if err != nil {
		return nil, fmt.Errorf("open: %w", err)
	}
	data, err := io.ReadAll(io.LimitReader(opened, maxNoteBytes+1))
	_ = opened.Close()
	if err != nil {
		return nil, fmt.Errorf("read: %w", err)
	}
	if len(data) > maxNoteBytes {
		return nil, appErr.ErrImportNoteTooLarge
	}
	return data, nil
}

func (s *ImportService) createImportJob(
	ctx context.Context, userID, source string, requireContent bool,
	filePath string, filter fileFilter, parse fileParser,
) (*model.ImportJob, error) {
	reader, err := zip.OpenReader(filePath)
	if err != nil {
		return nil, fmt.Errorf("open zip: %w", err)
	}
	defer func() { _ = reader.Close() }()
	if s.jobRepo == nil || s.noteRepo == nil {
		return nil, appErr.ErrInvalid
	}
	now := timeutil.NowUnix()
	job := &model.ImportJob{
		ID: newID(), UserID: userID, Source: source, Status: "parsing",
		RequireContent: requireContent, Tags: []string{}, Ctime: now, Mtime: now,
	}
	if err := s.jobRepo.Create(ctx, job); err != nil {
		return nil, fmt.Errorf("create job: %w", err)
	}
	noteRows, uniqueTags, err := s.parseZipFiles(reader, job, userID, now, filter, parse)
	if err != nil {
		_ = s.jobRepo.Delete(ctx, userID, job.ID)
		return nil, err
	}
	if err := s.noteRepo.InsertBatch(ctx, noteRows); err != nil {
		_ = s.jobRepo.Delete(ctx, userID, job.ID)
		return nil, fmt.Errorf("insert notes: %w", err)
	}
	allTags := make([]string, 0, len(uniqueTags))
	for tag := range uniqueTags {
		allTags = append(allTags, tag)
	}
	job.Tags = allTags
	job.Total = len(noteRows)
	job.Status = "ready"
	job.Mtime = timeutil.NowUnix()
	if err := s.jobRepo.UpdateSummary(ctx, job); err != nil {
		return nil, fmt.Errorf("update summary: %w", err)
	}
	return job, nil
}

func (s *ImportService) parseZipFiles(
	reader *zip.ReadCloser, job *model.ImportJob,
	userID string, now int64, filter fileFilter, parse fileParser,
) ([]model.ImportJobNote, map[string]bool, error) {
	var noteRows []model.ImportJobNote
	uniqueTags := make(map[string]bool)
	position := 0
	for _, file := range reader.File {
		if file.FileInfo().IsDir() {
			continue
		}
		if !filter(file) {
			continue
		}
		if position >= maxImportNotes {
			return nil, nil, appErr.ErrImportTooManyNotes
		}
		parsed, err := parse(file, job.ID, userID, position, now)
		if err != nil {
			return nil, nil, err
		}
		for _, tag := range parsed.note.Tags {
			uniqueTags[tag] = true
		}
		noteRows = append(noteRows, parsed.row)
		position++
	}
	if len(noteRows) == 0 {
		return nil, nil, appErr.ErrInvalid
	}
	return noteRows, uniqueTags, nil
}

func (s *ImportService) Preview(ctx context.Context, userID, jobID string) (*ImportPreview, error) {
	job, err := s.jobRepo.Get(ctx, userID, jobID)
	if err != nil {
		return nil, fmt.Errorf("get: %w", err)
	}
	if s.noteRepo == nil {
		return nil, appErr.ErrInvalid
	}
	titles, err := s.noteRepo.ListTitles(ctx, userID, jobID)
	if err != nil {
		return nil, fmt.Errorf("list titles: %w", err)
	}
	conflicts := 0
	for _, title := range titles {
		if title == "" {
			continue
		}
		if _, err := s.documents.GetByTitle(ctx, userID, title); err == nil {
			conflicts++
		}
	}
	samples := make([]model.ImportNote, 0)
	limit := 3
	notes, err := s.noteRepo.ListByJobLimit(ctx, userID, jobID, limit)
	if err != nil {
		return nil, fmt.Errorf("list by job limit: %w", err)
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

func (s *ImportService) Confirm(ctx context.Context, userID, jobID, mode string) error {
	job, err := s.jobRepo.Get(ctx, userID, jobID)
	if err != nil {
		return fmt.Errorf("get: %w", err)
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
	updated, err := s.jobRepo.UpdateStatusIf(ctx, userID, jobID, job.Status, "running", timeutil.NowUnix())
	if err != nil {
		return fmt.Errorf("update status if: %w", err)
	}
	if !updated {
		return appErr.ErrInvalid
	}
	bgCtx := context.WithoutCancel(ctx)
	go s.runImport(bgCtx, job, mode)
	return nil
}

func (s *ImportService) Status(ctx context.Context, userID, jobID string) (*model.ImportJob, error) {
	job, err := s.jobRepo.Get(ctx, userID, jobID)
	if err != nil {
		return nil, fmt.Errorf("get: %w", err)
	}
	return job, nil
}

type importProgress struct {
	ctx       context.Context
	service   *ImportService
	job       *model.ImportJob
	report    *model.ImportReport
	processed int
}

func (p *importProgress) tick() {
	p.processed++
	if p.processed%10 == 0 {
		_ = p.service.jobRepo.UpdateProgress(
			p.ctx, p.job.UserID, p.job.ID, p.processed, p.job.Total, p.report,
			"running", timeutil.NowUnix(),
		)
	}
}

func (p *importProgress) recordFail(msg, title string) {
	p.report.Failed++
	p.report.Errors = append(p.report.Errors, msg)
	p.report.FailedTitles = append(p.report.FailedTitles, title)
	p.tick()
}

func (s *ImportService) lookupByTitle(
	ctx context.Context, userID, title string,
) (string, bool, error) {
	doc, err := s.documents.GetByTitle(ctx, userID, title)
	if err == nil {
		return doc.ID, true, nil
	}
	if errors.Is(err, appErr.ErrNotFound) {
		return "", false, nil
	}
	return "", false, err
}

func (s *ImportService) runImport(ctx context.Context, job *model.ImportJob, mode string) {
	defer func() {
		if r := recover(); r != nil {
			_ = s.jobRepo.UpdateProgress(
				ctx, job.UserID, job.ID, 0, job.Total,
				&model.ImportReport{Errors: []string{fmt.Sprintf("internal panic: %v", r)}},
				"done", timeutil.NowUnix(),
			)
		}
	}()
	prog := &importProgress{ctx: ctx, service: s, job: job, report: &model.ImportReport{}}
	if s.noteRepo == nil || s.jobRepo == nil {
		return
	}
	notes, err := s.noteRepo.ListByJob(ctx, job.UserID, job.ID)
	if err != nil {
		_ = s.jobRepo.UpdateProgress(ctx, job.UserID, job.ID, 0, job.Total, prog.report, "done", timeutil.NowUnix())
		return
	}
	for _, note := range notes {
		s.importNote(ctx, job, mode, note, prog)
	}
	_ = s.jobRepo.UpdateProgress(
		ctx, job.UserID, job.ID, prog.processed, job.Total, prog.report, "done", timeutil.NowUnix(),
	)
}

func (s *ImportService) importNote(
	ctx context.Context, job *model.ImportJob, mode string, note model.ImportJobNote, prog *importProgress,
) {
	if note.Title == "" || (job.RequireContent && strings.TrimSpace(note.Content) == "") {
		prog.recordFail(fmt.Sprintf("empty title in %s", note.Source), note.Source)
		return
	}
	existingID, exists, err := s.resolveExisting(ctx, job.UserID, note.Title, mode)
	if err != nil {
		prog.recordFail(fmt.Sprintf("lookup title failed: %s", note.Title), note.Title)
		return
	}
	if existingID != "" && mode == "skip" {
		prog.report.Skipped++
		prog.tick()
		return
	}
	tagIDs, err := s.ensureTags(ctx, job.UserID, note.Tags)
	if err != nil {
		prog.recordFail(fmt.Sprintf("create tags failed: %s", note.Title), note.Title)
		return
	}
	if existingID != "" && mode == "overwrite" {
		s.overwriteNote(ctx, job, existingID, note, tagIDs, prog)
		return
	}
	finalTitle := note.Title
	if mode == "append" && exists {
		finalTitle = s.appendSuffix(ctx, job.UserID, note.Title)
	}
	_, err = s.documents.Create(ctx, job.UserID, DocumentCreateInput{
		Title: finalTitle, Content: note.Content, TagIDs: tagIDs, Summary: note.Summary,
	})
	if err != nil {
		prog.recordFail(fmt.Sprintf("create failed: %s", finalTitle), finalTitle)
		return
	}
	prog.report.Created++
	prog.tick()
}

func (s *ImportService) resolveExisting(ctx context.Context, userID, title, mode string) (string, bool, error) {
	existingID, exists, err := s.lookupByTitle(ctx, userID, title)
	if err != nil {
		return "", false, err
	}
	if mode == "append" && !exists {
		return "", false, nil
	}
	return existingID, exists, nil
}

func (s *ImportService) overwriteNote(
	ctx context.Context, job *model.ImportJob, existingID string,
	note model.ImportJobNote, tagIDs []string, prog *importProgress,
) {
	var summary *string
	if note.Summary != "" {
		summary = &note.Summary
	}
	err := s.documents.Update(ctx, job.UserID, existingID, DocumentUpdateInput{
		Title: note.Title, Content: note.Content, TagIDs: tagIDs, Summary: summary,
	})
	if err != nil {
		prog.recordFail(fmt.Sprintf("overwrite failed: %s", note.Title), note.Title)
		return
	}
	prog.report.Updated++
	prog.tick()
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
		return nil, fmt.Errorf("list by names: %w", err)
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
			return nil, fmt.Errorf("create batch: %w", err)
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
	for i := 2; i < 10000; i++ {
		candidate := fmt.Sprintf("%s (%d)", base, i)
		if _, err := s.documents.GetByTitle(ctx, userID, candidate); errors.Is(err, appErr.ErrNotFound) {
			return candidate
		}
	}
	return fmt.Sprintf("%s (%d)", base, timeutil.NowUnix())
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
	counts[title]++
	if counts[title] == 1 {
		return title
	}
	return fmt.Sprintf("%s (%d)", title, counts[title])
}

func SaveTempFile(_ string, reader io.Reader) (string, error) {
	tmp, err := os.CreateTemp("", "mnote-import-*.zip")
	if err != nil {
		return "", fmt.Errorf("create temp file: %w", err)
	}
	defer func() { _ = tmp.Close() }()
	if _, err := io.Copy(tmp, reader); err != nil {
		_ = os.Remove(tmp.Name())
		return "", fmt.Errorf("copy to temp file: %w", err)
	}
	return tmp.Name(), nil
}
