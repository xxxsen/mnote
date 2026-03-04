package main

import (
	"reflect"
	"sort"
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

func TestResolveImportsSlashMapping(t *testing.T) {
	source := `package main

func main() {
	_ = json.Marshal(map[string]string{"a": "b"})
}`

	res, err := resolveImports(source, []string{"json"})
	if err != nil {
		t.Fatalf("resolveImports error: %v", err)
	}
	if len(res.ImportsToAdd) != 1 || res.ImportsToAdd[0] != "encoding/json" {
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

func TestResolveImportsInvalidDefaultIdent(t *testing.T) {
	source := `package main

func main() {
	_ = Foo.Bar()
}`

	res, err := resolveImports(source, []string{"Foo"})
	if err != nil {
		t.Fatalf("resolveImports error: %v", err)
	}
	if len(res.Unresolved) != 1 || res.Unresolved[0] != "Foo" {
		t.Fatalf("expected unresolved Foo, got %v", res.Unresolved)
	}
}

func TestCandidateImportPathsStdlibOverrides(t *testing.T) {
	cases := []struct {
		ident string
		want  []string
	}{
		{ident: "json", want: []string{"encoding/json"}},
		{ident: "base64", want: []string{"encoding/base64"}},
		{ident: "httptest", want: []string{"net/http/httptest"}},
		{ident: "x509", want: []string{"crypto/x509"}},
		{ident: "fmt", want: []string{"fmt"}},
		{ident: "template", want: []string{"html/template", "text/template"}},
		{ident: "Foo", want: nil},
	}

	for _, tc := range cases {
		got := candidateImportPaths(tc.ident)
		if !reflect.DeepEqual(got, tc.want) {
			t.Fatalf("candidateImportPaths(%q) = %v, want %v", tc.ident, got, tc.want)
		}
	}
}

func TestAutoImportIndexCoverage(t *testing.T) {
	for ident, want := range autoImportIndex {
		wantSorted := append([]string(nil), want...)
		sort.Strings(wantSorted)

		got := candidateImportPaths(ident)
		if !reflect.DeepEqual(got, wantSorted) {
			t.Fatalf("candidateImportPaths(%q) = %v, want %v", ident, got, wantSorted)
		}

		source := "package main\n\nfunc main() {}\n"
		res, err := resolveImports(source, []string{ident})
		if err != nil {
			t.Fatalf("resolveImports(%q) error: %v", ident, err)
		}

		if len(wantSorted) == 1 {
			if len(res.ImportsToAdd) != 1 || res.ImportsToAdd[0] != wantSorted[0] {
				t.Fatalf("resolveImports(%q) imports = %v, want [%s]", ident, res.ImportsToAdd, wantSorted[0])
			}
			if len(res.Ambiguous) != 0 {
				t.Fatalf("resolveImports(%q) unexpected ambiguous = %v", ident, res.Ambiguous)
			}
			continue
		}

		ambiguous, ok := res.Ambiguous[ident]
		if !ok {
			t.Fatalf("resolveImports(%q) expected ambiguous entry, got %v", ident, res.Ambiguous)
		}
		if !reflect.DeepEqual(ambiguous, wantSorted) {
			t.Fatalf("resolveImports(%q) ambiguous = %v, want %v", ident, ambiguous, wantSorted)
		}
	}
}

func TestCollectSelectorCandidates(t *testing.T) {
	source := `package main

type helper struct{}

func (helper) Upper(s string) string { return s }

func main() {
	fmt.Println(rand.Intn(2))
	strings := helper{}
	_ = strings.Upper("x")
}`

	idents, err := collectSelectorCandidates(source)
	if err != nil {
		t.Fatalf("collectSelectorCandidates error: %v", err)
	}
	if len(idents) != 2 || idents[0] != "fmt" || idents[1] != "rand" {
		t.Fatalf("unexpected selector idents: %v", idents)
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
