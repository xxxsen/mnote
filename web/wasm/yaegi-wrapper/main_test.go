package main

import (
	"strings"
	"testing"
)

func TestExtractUndefinedIdents(t *testing.T) {
	errText := strings.Join([]string{
		"_.go:4:2: undefined: fmt",
		"_.go:5:2: undefined: strings.ToUpper",
		"_.go:6:2: undefined: fmt",
	}, "\n")

	got := extractUndefinedIdents(errText)
	if len(got) != 2 {
		t.Fatalf("expected 2 idents, got %d (%v)", len(got), got)
	}
	if got[0] != "fmt" || got[1] != "strings" {
		t.Fatalf("unexpected idents: %v", got)
	}
}

func TestResolveImports(t *testing.T) {
	source := `package main

import "fmt"

func main() {
	fmt.Println(strings.ToUpper("x"))
}`

	res, err := resolveImports(source, []string{"fmt", "strings"})
	if err != nil {
		t.Fatalf("resolveImports error: %v", err)
	}
	if len(res.Unresolved) != 0 {
		t.Fatalf("expected no unresolved, got %v", res.Unresolved)
	}
	if len(res.Ambiguous) != 0 {
		t.Fatalf("expected no ambiguous, got %v", res.Ambiguous)
	}
	if len(res.ImportsToAdd) != 1 || res.ImportsToAdd[0] != "strings" {
		t.Fatalf("unexpected imports to add: %v", res.ImportsToAdd)
	}
}

func TestResolveImportsAmbiguous(t *testing.T) {
	source := `package main

func main() {
	_ = rand.Int()
}`

	res, err := resolveImports(source, []string{"rand"})
	if err != nil {
		t.Fatalf("resolveImports error: %v", err)
	}
	if len(res.Ambiguous) != 1 {
		t.Fatalf("expected ambiguous rand, got %v", res.Ambiguous)
	}
}

func TestAddImports(t *testing.T) {
	source := `package main

func main() {
	fmt.Println(strings.ToUpper("x"))
}`

	next, added, err := addImports(source, []string{"fmt", "strings"})
	if err != nil {
		t.Fatalf("addImports error: %v", err)
	}
	if len(added) != 2 {
		t.Fatalf("expected 2 added imports, got %d (%v)", len(added), added)
	}
	if !strings.Contains(next, "\"fmt\"") || !strings.Contains(next, "\"strings\"") {
		t.Fatalf("formatted source missing imports:\n%s", next)
	}
}
