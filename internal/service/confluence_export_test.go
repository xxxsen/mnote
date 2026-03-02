package service

import (
	"strings"
	"testing"
)

func TestConfluenceRenderer_Render(t *testing.T) {
	r := newConfluenceRenderer()
	input := "# Title\n\n[toc]\n\n```mermaid\ngraph TD\nA-->B\n```\n\n```go\nfmt.Println(1)\n```"
	out, err := r.Render(input)
	if err != nil {
		t.Fatalf("render failed: %v", err)
	}
	checks := []string{
		`<ac:structured-macro ac:name="toc" />`,
		`<ac:structured-macro ac:name="mermaid">`,
		`graph TD`,
		`<ac:structured-macro ac:name="code">`,
		`<ac:parameter ac:name="language">go</ac:parameter>`,
	}
	for _, c := range checks {
		if !strings.Contains(out, c) {
			t.Fatalf("expected output contains %q, got %s", c, out)
		}
	}
}
