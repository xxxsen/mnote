package service

import (
	"testing"
	"time"
)

func TestApplyTemplateVariables_WithSystemVariables(t *testing.T) {
	content := "Date={{sys:date}} Today={{sys:today}} Time={{sys:time}} DateTime={{sys:datetime}}"
	result := applyTemplateVariables(content, map[string]string{})
	if result == content {
		t.Fatalf("system variables were not replaced: %s", result)
	}
	if result == "" {
		t.Fatal("unexpected empty result")
	}
}

func TestResolveSystemVariable_CaseInsensitive(t *testing.T) {
	now := time.Date(2026, 3, 1, 14, 5, 0, 0, time.UTC)
	if got := resolveSystemVariable("SYS:DATE", now); got != "2026-03-01" {
		t.Fatalf("unexpected date value: %s", got)
	}
	if got := resolveSystemVariable("sys:time", now); got != "14:05" {
		t.Fatalf("unexpected time value: %s", got)
	}
}
