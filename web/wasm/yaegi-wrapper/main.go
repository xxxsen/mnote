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
	"bufio":    {"bufio"},
	"bytes":    {"bytes"},
	"context":  {"context"},
	"csv":      {"encoding/csv"},
	"errors":   {"errors"},
	"flag":     {"flag"},
	"fmt":      {"fmt"},
	"gzip":     {"compress/gzip"},
	"hex":      {"encoding/hex"},
	"hmac":     {"crypto/hmac"},
	"http":     {"net/http"},
	"io":       {"io"},
	"json":     {"encoding/json"},
	"log":      {"log"},
	"math":     {"math"},
	"md5":      {"crypto/md5"},
	"os":       {"os"},
	"path":     {"path"},
	"filepath": {"path/filepath"},
	"rand":     {"math/rand", "crypto/rand"},
	"reflect":  {"reflect"},
	"regexp":   {"regexp"},
	"sha1":     {"crypto/sha1"},
	"sha256":   {"crypto/sha256"},
	"sort":     {"sort"},
	"strconv":  {"strconv"},
	"strings":  {"strings"},
	"sync":     {"sync"},
	"template": {"text/template"},
	"time":     {"time"},
	"url":      {"net/url"},
	"utf8":     {"unicode/utf8"},
	"xml":      {"encoding/xml"},
	"zip":      {"archive/zip"},
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

func resolveImports(source string, missingIdents []string) (*autoImportResolution, error) {
	existingAliases, existingPaths, err := parseExistingImports(source)
	if err != nil {
		return nil, err
	}

	res := &autoImportResolution{
		Ambiguous: make(map[string][]string),
	}

	for _, ident := range missingIdents {
		if _, exists := existingAliases[ident]; exists {
			continue
		}

		candidates, ok := autoImportIndex[ident]
		if !ok || len(candidates) == 0 {
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
