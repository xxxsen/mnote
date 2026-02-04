package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

type ManagerConfig struct {
	Timeout       int
	MaxInputChars int
}

type Manager struct {
	polisher   IGenerator
	generator  IGenerator
	tagger     IGenerator
	summarizer IGenerator
	embedder   IEmbedder
	cfg        ManagerConfig
}

func NewManager(
	polisher IGenerator,
	generator IGenerator,
	tagger IGenerator,
	summarizer IGenerator,
	embedder IEmbedder,
	cfg ManagerConfig,
) *Manager {
	return &Manager{
		polisher:   polisher,
		generator:  generator,
		tagger:     tagger,
		summarizer: summarizer,
		embedder:   embedder,
		cfg:        cfg,
	}
}

func (m *Manager) Embed(ctx context.Context, text string, taskType string) ([]float32, error) {
	if m.embedder == nil {
		return nil, fmt.Errorf("embedder not configured")
	}
	return m.embedder.Embed(ctx, text, taskType)
}

func (m *Manager) Polish(ctx context.Context, text string) (string, error) {
	if m.polisher == nil {
		return "", fmt.Errorf("polisher not configured")
	}
	prompt := fmt.Sprintf(`You are a professional editor.
Polish the following markdown to be more professional and clear without changing the meaning.
- Use the same language as the content.
- Keep all markdown structure and formatting.
- Do not add explanations.
- Output ONLY the polished markdown.

CONTENT:
%s`, text)
	return m.generateText(ctx, m.polisher, prompt)
}

func (m *Manager) Generate(ctx context.Context, description string) (string, error) {
	if m.generator == nil {
		return "", fmt.Errorf("generator not configured")
	}
	fullPrompt := fmt.Sprintf(`You are a helpful writer.
Generate a complete markdown article based on the description below.
- Use clear sections and headings when appropriate.
- Output ONLY the generated markdown.

DESCRIPTION:
%s`, description)
	return m.generateText(ctx, m.generator, fullPrompt)
}

func (m *Manager) ExtractTags(ctx context.Context, text string, maxTags int) ([]string, error) {
	if m.tagger == nil {
		return nil, fmt.Errorf("tagger not configured")
	}
	if maxTags <= 0 {
		maxTags = 7
	}
	if maxTags > 20 {
		maxTags = 20
	}
	prompt := fmt.Sprintf(`You are a tag extraction assistant.
From the markdown below, extract up to %d concise tags.
- Tags should be short phrases (1-3 words).
- Return a JSON array of strings only. No extra text.
- Use the same language as the content.

CONTENT:
%s`, maxTags, text)
	result, err := m.generateText(ctx, m.tagger, prompt)
	if err != nil {
		return nil, err
	}
	return parseTags(result, maxTags)
}

func (m *Manager) Summarize(ctx context.Context, text string) (string, error) {
	if m.summarizer == nil {
		return "", fmt.Errorf("summarizer not configured")
	}
	prompt := fmt.Sprintf(`You are a helpful assistant.
Summarize the following markdown into a concise paragraph (2-4 sentences).
- Use the same language as the content.
- Keep factual accuracy and key points.
- Output ONLY the summary text.

CONTENT:
%s`, text)
	return m.generateText(ctx, m.summarizer, prompt)
}

func (m *Manager) generateText(ctx context.Context, gen IGenerator, prompt string) (string, error) {
	if m.cfg.Timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, time.Duration(m.cfg.Timeout)*time.Second)
		defer cancel()
	}
	resp, err := gen.Generate(ctx, prompt)
	if err != nil {
		return "", err
	}
	text := strings.TrimSpace(resp)
	if text == "" {
		return "", fmt.Errorf("empty ai response")
	}
	return text, nil
}

func (m *Manager) MaxInputChars() int {
	return m.cfg.MaxInputChars
}

func (m *Manager) EmbeddingModelName() string {
	if m.embedder == nil {
		return ""
	}
	return m.embedder.ModelName()
}

func parseTags(output string, maxTags int) ([]string, error) {
	clean := strings.TrimSpace(output)
	clean = strings.TrimPrefix(clean, "```json")
	clean = strings.TrimPrefix(clean, "```")
	clean = strings.TrimSuffix(clean, "```")
	clean = strings.TrimSpace(clean)
	start := strings.Index(clean, "[")
	end := strings.LastIndex(clean, "]")
	if start >= 0 && end > start {
		clean = clean[start : end+1]
	}

	var tags []string
	if err := json.Unmarshal([]byte(clean), &tags); err != nil {
		return nil, fmt.Errorf("parse tags: %w", err)
	}
	uniq := make([]string, 0, len(tags))
	seen := make(map[string]bool)
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
		uniq = append(uniq, normalized)
		if len(uniq) >= maxTags {
			break
		}
	}
	if len(uniq) == 0 {
		return nil, fmt.Errorf("no tags found")
	}
	return uniq, nil
}
