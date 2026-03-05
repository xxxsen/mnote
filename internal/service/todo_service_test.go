package service

import (
	"reflect"
	"testing"
)

func TestParseTodoMarker(t *testing.T) {
	id, date, ok := parseTodoMarker(`mnote=todo id=5def96e45cd745f6cd4b042a7d78f5c1 date=2026-02-02`)
	if !ok {
		t.Fatalf("expected marker parse success")
	}
	if id != "5def96e45cd745f6cd4b042a7d78f5c1" || date != "2026-02-02" {
		t.Fatalf("unexpected parse result: id=%s date=%s", id, date)
	}

	if _, _, ok := parseTodoMarker(`todo:5def96e45cd745f6cd4b042a7d78f5c1 @2026-02-02`); ok {
		t.Fatalf("expected old marker format to be rejected")
	}
}

func TestParseTodosFromContent(t *testing.T) {
	content := "" +
		"- [ ] first task <!-- mnote=todo id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa date=2026-02-02 -->\n" +
		"- [x] second task <!-- mnote=todo id=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb date=2026-03-03 -->\n" +
		"- [ ] old style <!-- todo:cccccccccccccccccccccccccccccccc @2026-04-04 -->"

	got := parseTodosFromContent(content)
	want := []parsedTodo{
		{ID: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", Content: "first task", DueDate: "2026-02-02", Done: false},
		{ID: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", Content: "second task", DueDate: "2026-03-03", Done: true},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("parseTodosFromContent mismatch: got=%#v want=%#v", got, want)
	}
}
