package service

import (
	"bytes"
	"fmt"
	stdhtml "html"
	"regexp"
	"strings"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/parser"
	rendererhtml "github.com/yuin/goldmark/renderer/html"
)

type confluenceRenderer struct {
	md goldmark.Markdown
}

func newConfluenceRenderer() *confluenceRenderer {
	return &confluenceRenderer{md: goldmark.New(
		goldmark.WithExtensions(extension.GFM),
		goldmark.WithParserOptions(parser.WithAutoHeadingID()),
		goldmark.WithRendererOptions(rendererhtml.WithUnsafe()),
	)}
}

func (r *confluenceRenderer) Render(markdown string) (string, error) {
	processed, macros := injectConfluenceMacros(markdown)
	var out bytes.Buffer
	if err := r.md.Convert([]byte(processed), &out); err != nil {
		return "", err
	}
	rendered := out.String()
	for token, macro := range macros {
		rendered = strings.ReplaceAll(rendered, "<p>"+token+"</p>\n", macro+"\n")
		rendered = strings.ReplaceAll(rendered, "<p>"+token+"</p>", macro)
		rendered = strings.ReplaceAll(rendered, token, macro)
	}
	return rendered, nil
}

func injectConfluenceMacros(markdown string) (string, map[string]string) {
	lines := strings.Split(markdown, "\n")
	out := make([]string, 0, len(lines))
	macros := make(map[string]string)
	index := 0
	for i := 0; i < len(lines); i += 1 {
		line := lines[i]
		trimmed := strings.TrimSpace(line)
		if tocTokenRegex.MatchString(trimmed) {
			token := fmt.Sprintf("@@CONFLUENCE_MACRO_%d@@", index)
			index += 1
			out = append(out, token)
			macros[token] = `<ac:structured-macro ac:name="toc" />`
			continue
		}
		if strings.HasPrefix(trimmed, "```") {
			lang := strings.TrimSpace(strings.TrimPrefix(trimmed, "```"))
			body := make([]string, 0)
			for j := i + 1; j < len(lines); j += 1 {
				if strings.HasPrefix(strings.TrimSpace(lines[j]), "```") {
					i = j
					break
				}
				body = append(body, lines[j])
				if j == len(lines)-1 {
					i = j
				}
			}
			token := fmt.Sprintf("@@CONFLUENCE_MACRO_%d@@", index)
			index += 1
			out = append(out, token)
			macros[token] = buildCodeMacro(lang, strings.Join(body, "\n"))
			continue
		}
		out = append(out, line)
	}
	return strings.Join(out, "\n"), macros
}

var tocTokenRegex = regexp.MustCompile(`^\[(toc|TOC)]$`)

func buildCodeMacro(lang, code string) string {
	if strings.EqualFold(strings.TrimSpace(lang), "mermaid") {
		return fmt.Sprintf(`<ac:structured-macro ac:name="mermaid"><ac:plain-text-body><![CDATA[%s]]></ac:plain-text-body></ac:structured-macro>`, escapeCDATA(code))
	}
	language := strings.TrimSpace(lang)
	if language == "" {
		language = "plain"
	}
	return fmt.Sprintf(`<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">%s</ac:parameter><ac:plain-text-body><![CDATA[%s]]></ac:plain-text-body></ac:structured-macro>`, stdhtml.EscapeString(language), escapeCDATA(code))
}

func escapeCDATA(input string) string {
	return strings.ReplaceAll(input, "]]>", "]]]]><![CDATA[>")
}
