package db

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

var ddlStatementPattern = regexp.MustCompile(
	`(?i)\b(create|alter|drop|truncate|comment\s+on|grant|revoke)\s+` +
		`(table|index|extension|type|constraint|schema|view|materialized|function|trigger|sequence|role)\b`,
)

func constantString(expr ast.Expr) (string, bool) {
	switch value := expr.(type) {
	case *ast.BasicLit:
		if value.Kind != token.STRING {
			return "", false
		}
		decoded, err := strconv.Unquote(value.Value)
		return decoded, err == nil
	case *ast.BinaryExpr:
		if value.Op != token.ADD {
			return "", false
		}
		left, leftOK := constantString(value.X)
		right, rightOK := constantString(value.Y)
		return left + right, leftOK && rightOK
	case *ast.ParenExpr:
		return constantString(value.X)
	default:
		return "", false
	}
}

func TestProductionGoContainsNoDDL(t *testing.T) {
	_, currentFile, _, ok := runtime.Caller(0)
	require.True(t, ok)
	root := filepath.Clean(filepath.Join(filepath.Dir(currentFile), "..", ".."))

	for _, directory := range []string{"cmd", "internal"} {
		err := filepath.WalkDir(
			filepath.Join(root, directory),
			func(path string, entry fs.DirEntry, walkErr error) error {
				if walkErr != nil {
					return walkErr
				}
				relative, err := filepath.Rel(root, path)
				if err != nil {
					return err
				}
				if entry.IsDir() {
					if filepath.ToSlash(relative) == "internal/testutil" {
						return filepath.SkipDir
					}
					return nil
				}
				if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
					return nil
				}
				file, err := parser.ParseFile(token.NewFileSet(), path, nil, 0)
				if err != nil {
					return err
				}
				ast.Inspect(file, func(node ast.Node) bool {
					expr, isExpr := node.(ast.Expr)
					if !isExpr {
						return true
					}
					value, isConstant := constantString(expr)
					if !isConstant {
						return true
					}
					if ddlStatementPattern.MatchString(value) {
						t.Errorf("production DDL found in %s: %q", relative, value)
					}
					return true
				})
				return nil
			},
		)
		require.NoError(t, err)
	}
}
