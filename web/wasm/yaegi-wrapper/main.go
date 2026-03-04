package main

import (
	"bytes"
	"fmt"
	"go/ast"
	"go/format"
	"go/parser"
	"go/token"
	"sort"
	"strconv"
	"strings"

	"github.com/traefik/yaegi/interp"
	"github.com/traefik/yaegi/stdlib"
)

var undefinedIdentPattern = "undefined: "

var autoImportIndex = map[string][]string{
	"ascii85":   {"encoding/ascii85"},
	"base64":    {"encoding/base64"},
	"big":       {"math/big"},
	"binary":    {"encoding/binary"},
	"cmplx":     {"math/cmplx"},
	"csv":       {"encoding/csv"},
	"filepath":  {"path/filepath"},
	"gzip":      {"compress/gzip"},
	"heap":      {"container/heap"},
	"hex":       {"encoding/hex"},
	"hmac":      {"crypto/hmac"},
	"http":      {"net/http"},
	"httptest":  {"net/http/httptest"},
	"httptrace": {"net/http/httptrace"},
	"json":      {"encoding/json"},
	"list":      {"container/list"},
	"mail":      {"net/mail"},
	"md5":       {"crypto/md5"},
	"multipart": {"mime/multipart"},
	"pem":       {"encoding/pem"},
	"pkix":      {"crypto/x509/pkix"},
	"rand":      {"math/rand", "crypto/rand"},
	"ring":      {"container/ring"},
	"scanner":   {"text/scanner"},
	"sha1":      {"crypto/sha1"},
	"sha256":    {"crypto/sha256"},
	"smtp":      {"net/smtp"},
	"tabwriter": {"text/tabwriter"},
	"template":  {"text/template", "html/template"},
	"tls":       {"crypto/tls"},
	"url":       {"net/url"},
	"utf16":     {"unicode/utf16"},
	"utf8":      {"unicode/utf8"},
	"x509":      {"crypto/x509"},
	"xml":       {"encoding/xml"},
	"zip":       {"archive/zip"},
}

type autoImportResolution struct {
	ImportsToAdd []string
	Unresolved   []string
	Ambiguous    map[string][]string
}

type autoImportFailure struct {
	ExecErr    error
	Unresolved []string
	Ambiguous  map[string][]string
}

func (f *autoImportFailure) Error() string {
	var b strings.Builder
	b.WriteString("Auto-import failed.")
	if len(f.Unresolved) > 0 {
		b.WriteString("\nUnresolved packages: ")
		b.WriteString(strings.Join(f.Unresolved, ", "))
	}
	if len(f.Ambiguous) > 0 {
		idents := make([]string, 0, len(f.Ambiguous))
		for ident := range f.Ambiguous {
			idents = append(idents, ident)
		}
		sort.Strings(idents)
		for _, ident := range idents {
			b.WriteString("\nAmbiguous package ")
			b.WriteString(ident)
			b.WriteString(": ")
			b.WriteString(strings.Join(f.Ambiguous[ident], ", "))
		}
	}
	if f.ExecErr != nil {
		b.WriteString("\nInterpreter error: ")
		b.WriteString(f.ExecErr.Error())
	}
	return b.String()
}

func runWithAutoImport(source string, maxAttempts int) ([]string, error) {
	current := source
	applied := map[string]struct{}{}

	preIdents, preErr := collectSelectorCandidates(current)
	if preErr != nil {
		return sortedKeys(applied), fmt.Errorf("analyze selector imports: %w", preErr)
	}
	preResolution, resolveErr := resolveImports(current, preIdents)
	if resolveErr != nil {
		return sortedKeys(applied), fmt.Errorf("resolve selector imports: %w", resolveErr)
	}
	if len(preResolution.ImportsToAdd) > 0 {
		next, addedNow, addErr := addImports(current, preResolution.ImportsToAdd)
		if addErr != nil {
			return sortedKeys(applied), fmt.Errorf("patch pre-imports: %w", addErr)
		}
		for _, pkg := range addedNow {
			applied[pkg] = struct{}{}
		}
		current = next
	}

	for attempt := 0; attempt < maxAttempts; attempt++ {
		err := evalSource(current)
		if err == nil {
			return sortedKeys(applied), nil
		}

		missing := extractUndefinedIdents(err.Error())
		if len(missing) == 0 {
			return sortedKeys(applied), fmt.Errorf("execution error: %w", err)
		}

		resolution, resolveErr := resolveImports(current, missing)
		if resolveErr != nil {
			return sortedKeys(applied), fmt.Errorf("resolve imports: %w", resolveErr)
		}
		if len(resolution.Unresolved) > 0 || len(resolution.Ambiguous) > 0 {
			return sortedKeys(applied), &autoImportFailure{
				ExecErr:    err,
				Unresolved: resolution.Unresolved,
				Ambiguous:  resolution.Ambiguous,
			}
		}
		if len(resolution.ImportsToAdd) == 0 {
			return sortedKeys(applied), fmt.Errorf("execution error after auto-import analysis: %w", err)
		}

		next, addedNow, addErr := addImports(current, resolution.ImportsToAdd)
		if addErr != nil {
			return sortedKeys(applied), fmt.Errorf("patch imports: %w", addErr)
		}
		if len(addedNow) == 0 {
			return sortedKeys(applied), fmt.Errorf("execution error: %w", err)
		}
		for _, pkg := range addedNow {
			applied[pkg] = struct{}{}
		}
		current = next
	}

	return sortedKeys(applied), fmt.Errorf("auto-import exceeded max attempts")
}

func evalSource(source string) error {
	i := interp.New(interp.Options{})
	if err := i.Use(stdlib.Symbols); err != nil {
		return fmt.Errorf("load stdlib: %w", err)
	}
	_, err := i.Eval(source)
	return err
}

func extractUndefinedIdents(errText string) []string {
	if errText == "" {
		return nil
	}

	parts := strings.Split(errText, "\n")
	seen := make(map[string]struct{})
	out := make([]string, 0)
	for _, line := range parts {
		idx := strings.Index(line, undefinedIdentPattern)
		if idx < 0 {
			continue
		}
		identPart := strings.TrimSpace(line[idx+len(undefinedIdentPattern):])
		ident := identPart
		if dotIdx := strings.Index(identPart, "."); dotIdx > 0 {
			ident = identPart[:dotIdx]
		}
		ident = strings.TrimSpace(ident)
		if ident == "" {
			continue
		}
		if _, ok := seen[ident]; ok {
			continue
		}
		seen[ident] = struct{}{}
		out = append(out, ident)
	}
	sort.Strings(out)
	return out
}

func collectSelectorCandidates(source string) ([]string, error) {
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, "snippet.go", source, parser.AllErrors)
	if err != nil {
		return nil, err
	}

	seen := make(map[string]struct{})
	idents := make([]string, 0)
	ast.Inspect(file, func(node ast.Node) bool {
		selector, ok := node.(*ast.SelectorExpr)
		if !ok || selector.Sel == nil {
			return true
		}
		x, ok := selector.X.(*ast.Ident)
		if !ok {
			return true
		}
		if x.Obj != nil {
			return true
		}
		if !isLikelyPackageIdent(x.Name) {
			return true
		}
		if _, exists := seen[x.Name]; !exists {
			seen[x.Name] = struct{}{}
			idents = append(idents, x.Name)
		}
		return true
	})
	sort.Strings(idents)
	return idents, nil
}

func resolveImports(source string, missingIdents []string) (*autoImportResolution, error) {
	existingAliases, existingPaths, err := parseExistingImports(source)
	if err != nil {
		return nil, err
	}
	selectorIdents, selectorErr := collectSelectorCandidates(source)
	selectorSet := make(map[string]struct{}, len(selectorIdents))
	if selectorErr == nil {
		for _, ident := range selectorIdents {
			selectorSet[ident] = struct{}{}
		}
	}

	res := &autoImportResolution{
		Ambiguous: make(map[string][]string),
	}

	for _, ident := range missingIdents {
		if _, exists := existingAliases[ident]; exists {
			continue
		}

		_, usedAsSelector := selectorSet[ident]
		candidates := candidateImportPaths(ident, usedAsSelector)
		if len(candidates) == 0 {
			res.Unresolved = append(res.Unresolved, ident)
			continue
		}
		if len(candidates) > 1 {
			cloned := append([]string(nil), candidates...)
			sort.Strings(cloned)
			res.Ambiguous[ident] = cloned
			continue
		}
		path := candidates[0]
		if _, exists := existingPaths[path]; exists {
			continue
		}
		res.ImportsToAdd = append(res.ImportsToAdd, path)
	}

	sort.Strings(res.ImportsToAdd)
	sort.Strings(res.Unresolved)
	return res, nil
}

func candidateImportPaths(ident string, usedAsSelector bool) []string {
	if candidates, ok := autoImportIndex[ident]; ok && len(candidates) > 0 {
		cloned := append([]string(nil), candidates...)
		sort.Strings(cloned)
		return cloned
	}
	if usedAsSelector && isLikelyPackageIdent(ident) {
		return []string{ident}
	}
	return nil
}

func isLikelyPackageIdent(ident string) bool {
	if ident == "" {
		return false
	}
	for i := 0; i < len(ident); i++ {
		ch := ident[i]
		if i == 0 {
			if !((ch >= 'a' && ch <= 'z') || ch == '_') {
				return false
			}
			continue
		}
		if (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '_' {
			continue
		}
		return false
	}
	return true
}

func parseExistingImports(source string) (map[string]string, map[string]struct{}, error) {
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, "snippet.go", source, parser.ImportsOnly)
	if err != nil {
		return nil, nil, err
	}

	aliases := make(map[string]string)
	paths := make(map[string]struct{})
	for _, imp := range file.Imports {
		path, err := strconv.Unquote(imp.Path.Value)
		if err != nil {
			continue
		}
		paths[path] = struct{}{}
		alias := ""
		if imp.Name != nil {
			alias = imp.Name.Name
		} else {
			alias = defaultImportAlias(path)
		}
		if alias != "" && alias != "_" && alias != "." {
			aliases[alias] = path
		}
	}
	return aliases, paths, nil
}

func defaultImportAlias(path string) string {
	if path == "" {
		return ""
	}
	lastSlash := strings.LastIndex(path, "/")
	if lastSlash < 0 {
		return path
	}
	return path[lastSlash+1:]
}

func addImports(source string, importsToAdd []string) (string, []string, error) {
	if len(importsToAdd) == 0 {
		return source, nil, nil
	}

	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, "snippet.go", source, parser.ParseComments)
	if err != nil {
		return "", nil, err
	}

	existingPaths := map[string]struct{}{}
	for _, imp := range file.Imports {
		path, unquoteErr := strconv.Unquote(imp.Path.Value)
		if unquoteErr == nil {
			existingPaths[path] = struct{}{}
		}
	}

	added := make([]string, 0, len(importsToAdd))
	specs := make([]ast.Spec, 0, len(importsToAdd))
	for _, path := range importsToAdd {
		if _, exists := existingPaths[path]; exists {
			continue
		}
		spec := &ast.ImportSpec{
			Path: &ast.BasicLit{
				Kind:  token.STRING,
				Value: strconv.Quote(path),
			},
		}
		specs = append(specs, spec)
		added = append(added, path)
		existingPaths[path] = struct{}{}
	}
	if len(specs) == 0 {
		return source, nil, nil
	}

	importDecl := &ast.GenDecl{
		Tok:    token.IMPORT,
		Lparen: token.Pos(1),
		Specs:  specs,
	}
	file.Decls = append([]ast.Decl{importDecl}, file.Decls...)

	var buf bytes.Buffer
	if err := format.Node(&buf, fset, file); err != nil {
		return "", nil, err
	}
	formatted, err := format.Source(buf.Bytes())
	if err != nil {
		return "", nil, err
	}
	sort.Strings(added)
	return string(formatted), added, nil
}

func sortedKeys(set map[string]struct{}) []string {
	out := make([]string, 0, len(set))
	for k := range set {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
