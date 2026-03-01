package service

import (
	"context"
	"regexp"
	"strings"
	"time"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/timeutil"
	"github.com/xxxsen/mnote/internal/repo"
)

type TemplateService struct {
	templates *repo.TemplateRepo
	documents *DocumentService
	tags      *repo.TagRepo
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

func NewTemplateService(templates *repo.TemplateRepo, documents *DocumentService, tags *repo.TagRepo) *TemplateService {
	return &TemplateService{templates: templates, documents: documents, tags: tags}
}

func (s *TemplateService) List(ctx context.Context, userID string) ([]model.Template, error) {
	return s.templates.ListByUser(ctx, userID)
}

func (s *TemplateService) ListMeta(ctx context.Context, userID string) ([]model.TemplateMeta, error) {
	return s.templates.ListMetaByUser(ctx, userID)
}

func (s *TemplateService) Get(ctx context.Context, userID, templateID string) (*model.Template, error) {
	return s.templates.GetByID(ctx, userID, templateID)
}

func (s *TemplateService) Create(ctx context.Context, userID string, input CreateTemplateInput) (*model.Template, error) {
	if strings.TrimSpace(input.Name) == "" || strings.TrimSpace(input.Content) == "" {
		return nil, appErr.ErrInvalid
	}
	normalizedContent := normalizeTemplateContentPlaceholders(input.Content)
	now := timeutil.NowUnix()
	tpl := &model.Template{
		ID:            newID(),
		UserID:        userID,
		Name:          strings.TrimSpace(input.Name),
		Description:   strings.TrimSpace(input.Description),
		Content:       normalizedContent,
		DefaultTagIDs: uniqueStringSlice(input.DefaultTagIDs),
		BuiltIn:       0,
		Ctime:         now,
		Mtime:         now,
	}
	if err := s.templates.Create(ctx, tpl); err != nil {
		return nil, err
	}
	return tpl, nil
}

func (s *TemplateService) Update(ctx context.Context, userID, templateID string, input UpdateTemplateInput) error {
	if strings.TrimSpace(input.Name) == "" || strings.TrimSpace(input.Content) == "" {
		return appErr.ErrInvalid
	}
	normalizedContent := normalizeTemplateContentPlaceholders(input.Content)
	tpl := &model.Template{
		ID:            templateID,
		UserID:        userID,
		Name:          strings.TrimSpace(input.Name),
		Description:   strings.TrimSpace(input.Description),
		Content:       normalizedContent,
		DefaultTagIDs: uniqueStringSlice(input.DefaultTagIDs),
		Mtime:         timeutil.NowUnix(),
	}
	return s.templates.Update(ctx, tpl)
}

func (s *TemplateService) Delete(ctx context.Context, userID, templateID string) error {
	return s.templates.Delete(ctx, userID, templateID)
}

func (s *TemplateService) CreateDocumentFromTemplate(ctx context.Context, userID string, input CreateDocumentFromTemplateInput) (*model.Document, error) {
	tpl, err := s.templates.GetByID(ctx, userID, input.TemplateID)
	if err != nil {
		return nil, err
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
	tagIDs := uniqueStringSlice(tpl.DefaultTagIDs)
	if s.tags != nil && len(tagIDs) > 0 {
		existingTags, listErr := s.tags.ListByIDs(ctx, userID, tagIDs)
		if listErr == nil {
			existingMap := make(map[string]struct{}, len(existingTags))
			for _, tag := range existingTags {
				existingMap[tag.ID] = struct{}{}
			}
			filtered := make([]string, 0, len(tagIDs))
			for _, id := range tagIDs {
				if _, ok := existingMap[id]; ok {
					filtered = append(filtered, id)
				}
			}
			tagIDs = filtered
		}
	}
	return s.documents.Create(ctx, userID, DocumentCreateInput{
		Title:   title,
		Content: content,
		TagIDs:  tagIDs,
	})
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
