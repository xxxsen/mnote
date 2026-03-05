package service

import (
	"reflect"
	"testing"
)

func TestParseTodoMarker(t *testing.T) {
	id, date, ok := parseTodoMarker(`mnote=todo t=Ab3k9P2x d=2026-02-02`)
	if !ok {
		t.Fatalf("expected marker parse success")
	}
	if id != "Ab3k9P2x" || date != "2026-02-02" {
		t.Fatalf("unexpected parse result: id=%s date=%s", id, date)
	}

	if _, _, ok := parseTodoMarker(`mnote=todo t=abc d=2026-02-02`); ok {
		t.Fatalf("expected short marker id to be rejected")
	}
}

func TestParseTodosFromContent(t *testing.T) {
	content := "" +
		"- [ ] first task <!-- mnote=todo t=Ab3k9P2x d=2026-02-02 -->\n" +
		"- [x] second task <!-- mnote=todo t=Qw7LmN4z d=2026-03-03 -->\n" +
		"- [ ] invalid marker <!-- mnote=todo t=bad d=2026-04-04 -->"

	got, invalidLines := parseTodosFromContent(content)
	want := []parsedTodo{
		{MarkerID: "Ab3k9P2x", Content: "first task", DueDate: "2026-02-02", Done: false},
		{MarkerID: "Qw7LmN4z", Content: "second task", DueDate: "2026-03-03", Done: true},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("parseTodosFromContent mismatch: got=%#v want=%#v", got, want)
	}
	if len(invalidLines) != 1 || invalidLines[0] != 3 {
		t.Fatalf("expected invalid lines [3], got=%v", invalidLines)
	}
}
