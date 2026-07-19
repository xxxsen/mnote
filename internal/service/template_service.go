package service

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/timeutil"
)

type TemplateService struct {
	templates templateRepo
	documents templateDocumentService
	tags      tagRepo
	runtime   Runtime
}

type templateDocumentService interface {
	Create(ctx context.Context, userID string, input DocumentCreateInput) (*model.Document, error)
	ValidateOwnedTagIDs(ctx context.Context, userID string, tagIDs []string) ([]string, error)
}

type CreateTemplateInput struct {
	Name          string
	Description   string
	Content       string
	DefaultTagIDs []string
}

type UpdateTemplateInput struct {
	Name          string
	Description   string
	Content       string
	DefaultTagIDs []string
}

type CreateDocumentFromTemplateInput struct {
	TemplateID string
	Title      string
	Variables  map[string]string
}

type TemplateMetaListResult struct {
	Items []model.TemplateMeta `json:"items"`
	Total int                  `json:"total"`
}

func NewTemplateService(
	templates templateRepo, documents templateDocumentService, tags tagRepo, runtime Runtime,
) *TemplateService {
	return &TemplateService{
		templates: templates, documents: documents, tags: tags,
		runtime: prepareRuntime(runtime),
	}
}

func (s *TemplateService) List(ctx context.Context, userID string) ([]model.Template, error) {
	v0, err := s.templates.ListByUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list by user: %w", err)
	}
	return v0, nil
}

func (
	s *TemplateService) ListMeta(ctx context.Context,
	userID string,
	query string,
	limit,
	offset int) (*TemplateMetaListResult,
	error,
) {
	query = strings.TrimSpace(query)
	if utf8.RuneCountInString(query) > 200 {
		return nil, appErr.ErrInvalid
	}
	if limit <= 0 {
		limit = 20
	}
	if limit > 200 {
		limit = 200
	}
	if offset < 0 {
		offset = 0
	}
	total, err := s.templates.CountByUser(ctx, userID, query)
	if err != nil {
		return nil, fmt.Errorf("count by user: %w", err)
	}
	items, err := s.templates.ListMetaByUser(ctx, userID, query, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("list meta by user: %w", err)
	}
	return &TemplateMetaListResult{
		Items: items,
		Total: total,
	}, nil
}

func (s *TemplateService) Get(ctx context.Context, userID, templateID string) (*model.Template, error) {
	v0, err := s.templates.GetByID(ctx, userID, templateID)
	if err != nil {
		return nil, fmt.Errorf("get by id: %w", err)
	}
	return v0, nil
}

func (
	s *TemplateService) Create(ctx context.Context,
	userID string,
	input CreateTemplateInput) (*model.Template,
	error,
) {
	if err := s.validateTemplate(
		input.Name, input.Description, input.Content, input.DefaultTagIDs,
	); err != nil {
		return nil, appErr.ErrInvalid
	}
	normalizedContent := normalizeTemplateContentPlaceholders(input.Content)
	tagIDs, err := s.validateOwnedTagIDs(ctx, userID, input.DefaultTagIDs)
	if err != nil {
		return nil, err
	}
	id, err := s.runtime.IDs.ID()
	if err != nil {
		return nil, fmt.Errorf("generate template id: %w", err)
	}
	now := timeutil.NowUnix()
	tpl := &model.Template{
		ID:            id,
		UserID:        userID,
		Name:          strings.TrimSpace(input.Name),
		Description:   strings.TrimSpace(input.Description),
		Content:       normalizedContent,
		DefaultTagIDs: tagIDs,
		BuiltIn:       0,
		Ctime:         now,
		Mtime:         now,
	}
	if err := s.templates.Create(ctx, tpl); err != nil {
		return nil, fmt.Errorf("create: %w", err)
	}
	return tpl, nil
}

func (s *TemplateService) Update(ctx context.Context, userID, templateID string, input UpdateTemplateInput) error {
	if err := s.validateTemplate(
		input.Name, input.Description, input.Content, input.DefaultTagIDs,
	); err != nil {
		return appErr.ErrInvalid
	}
	normalizedContent := normalizeTemplateContentPlaceholders(input.Content)
	tagIDs, err := s.validateOwnedTagIDs(ctx, userID, input.DefaultTagIDs)
	if err != nil {
		return err
	}
	tpl := &model.Template{
		ID:            templateID,
		UserID:        userID,
		Name:          strings.TrimSpace(input.Name),
		Description:   strings.TrimSpace(input.Description),
		Content:       normalizedContent,
		DefaultTagIDs: tagIDs,
		Mtime:         timeutil.NowUnix(),
	}
	if err := s.templates.Update(ctx, tpl); err != nil {
		return fmt.Errorf("update: %w", err)
	}
	return nil
}

func (s *TemplateService) validateTemplate(
	name, description, content string, tagIDs []string,
) error {
	if strings.TrimSpace(name) == "" ||
		strings.TrimSpace(content) == "" ||
		utf8.RuneCountInString(name) > 120 ||
		utf8.RuneCountInString(description) > 1000 ||
		len([]byte(content)) > s.runtime.Limits.MaxTemplateBytes ||
		len(uniqueStringSlice(tagIDs)) > 100 {
		return appErr.ErrInvalid
	}
	return nil
}

func (s *TemplateService) Delete(ctx context.Context, userID, templateID string) error {
	if err := s.templates.Delete(ctx, userID, templateID); err != nil {
		return fmt.Errorf("delete: %w", err)
	}
	return nil
}

func (
	s *TemplateService) CreateDocumentFromTemplate(ctx context.Context,
	userID string,
	input CreateDocumentFromTemplateInput) (*model.Document,
	error,
) {
	tpl, err := s.templates.GetByID(ctx, userID, input.TemplateID)
	if err != nil {
		return nil, fmt.Errorf("get by id: %w", err)
	}
	variables := map[string]string{}
	for k, v := range input.Variables {
		key := strings.ToUpper(strings.TrimSpace(k))
		if key == "" {
			continue
		}
		variables[key] = strings.TrimSpace(v)
	}
	content := applyTemplateVariables(tpl.Content, variables)
	title := strings.TrimSpace(input.Title)
	if title == "" {
		title = inferTemplateTitle(content, tpl.Name)
	}
	tagIDs, err := s.validateOwnedTagIDs(ctx, userID, tpl.DefaultTagIDs)
	if err != nil {
		return nil, err
	}
	doc, err := s.documents.Create(ctx, userID, DocumentCreateInput{
		Title:   title,
		Content: content,
		TagIDs:  tagIDs,
	})
	if err != nil {
		return nil, fmt.Errorf("create document: %w", err)
	}
	return doc, nil
}

func (s *TemplateService) validateOwnedTagIDs(
	ctx context.Context, userID string, ids []string,
) ([]string, error) {
	unique := uniqueStringSlice(ids)
	if len(unique) == 0 {
		return []string{}, nil
	}
	if s.tags == nil && s.documents != nil {
		owned, err := s.documents.ValidateOwnedTagIDs(ctx, userID, unique)
		if err != nil {
			return nil, fmt.Errorf("validate document tags: %w", err)
		}
		return owned, nil
	}
	if s.tags == nil {
		return nil, appErr.ErrInvalid
	}
	items, err := s.tags.ListByIDs(ctx, userID, unique)
	if err != nil {
		return nil, fmt.Errorf("validate default tags: %w", err)
	}
	owned := make(map[string]struct{}, len(items))
	for _, item := range items {
		owned[item.ID] = struct{}{}
	}
	if len(owned) != len(unique) {
		return nil, appErr.ErrInvalid
	}
	for _, id := range unique {
		if _, ok := owned[id]; !ok {
			return nil, appErr.ErrInvalid
		}
	}
	return unique, nil
}

var builtInTemplateVarsRegex = regexp.MustCompile(`\{\{\s*([a-zA-Z0-9_:\-]+)\s*\}\}`)

func applyTemplateVariables(content string, values map[string]string) string {
	now := time.Unix(timeutil.NowUnix(), 0).In(time.Local)
	return builtInTemplateVarsRegex.ReplaceAllStringFunc(content, func(token string) string {
		match := builtInTemplateVarsRegex.FindStringSubmatch(token)
		if len(match) < 2 {
			return token
		}
		key := strings.ToUpper(strings.TrimSpace(match[1]))
		keyLower := strings.ToLower(key)
		if strings.HasPrefix(keyLower, "sys:") {
			return resolveSystemVariable(keyLower, now)
		}
		if value, ok := values[key]; ok {
			return value
		}
		return ""
	})
}

func normalizeTemplateContentPlaceholders(content string) string {
	return builtInTemplateVarsRegex.ReplaceAllStringFunc(content, func(token string) string {
		match := builtInTemplateVarsRegex.FindStringSubmatch(token)
		if len(match) < 2 {
			return token
		}
		key := strings.ToUpper(strings.TrimSpace(match[1]))
		if key == "" {
			return token
		}
		return "{{" + key + "}}"
	})
}

func resolveSystemVariable(key string, now time.Time) string {
	switch strings.ToLower(strings.TrimSpace(key)) {
	case "sys:today", "sys:date":
		return now.Format("2006-01-02")
	case "sys:time":
		return now.Format("15:04")
	case "sys:datetime", "sys:now":
		return now.Format("2006-01-02 15:04")
	default:
		return ""
	}
}

func inferTemplateTitle(content, fallback string) string {
	for _, line := range strings.Split(content, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		if strings.HasPrefix(trimmed, "#") {
			trimmed = strings.TrimSpace(strings.TrimLeft(trimmed, "#"))
		}
		if trimmed != "" {
			if len([]rune(trimmed)) > 80 {
				return string([]rune(trimmed)[:80])
			}
			return trimmed
		}
	}
	if fallback != "" {
		return fallback
	}
	return "Untitled"
}

func uniqueStringSlice(values []string) []string {
	out := make([]string, 0, len(values))
	seen := make(map[string]struct{})
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		out = append(out, trimmed)
	}
	return out
}
