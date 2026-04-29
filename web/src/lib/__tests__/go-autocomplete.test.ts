import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { goAutocompleteExtension, goCompletionSource, buildGoCompletions } from "../go-autocomplete";
import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";

function makeState(content: string) {
  return EditorState.create({ doc: content });
}

function makeContext(state: EditorState, pos: number, explicit = true): CompletionContext {
  return {
    state,
    pos,
    explicit,
    matchBefore(re: RegExp) {
      const line = state.doc.lineAt(pos);
      const prefix = line.text.slice(0, pos - line.from);
      const m = prefix.match(re);
      if (!m) return null;
      return { from: line.from + (m.index ?? 0), to: pos, text: m[0] };
    },
    tokenBefore() { return null; },
  } as unknown as CompletionContext;
}

describe("goAutocompleteExtension", () => {
  it("is a valid CodeMirror extension", () => {
    expect(goAutocompleteExtension).toBeTruthy();
  });

  it("can be attached to an EditorState without error", () => {
    const state = EditorState.create({ extensions: [goAutocompleteExtension] });
    expect(state).toBeTruthy();
  });
});

describe("goCompletionSource", () => {
  it("returns null outside a go fence", () => {
    const doc = "some text\n";
    const state = makeState(doc);
    const ctx = makeContext(state, doc.length - 1);
    expect(goCompletionSource(ctx)).toBeNull();
  });

  it("returns null for cursor on the fence line itself", () => {
    const doc = "```go\n";
    const state = makeState(doc);
    const line = state.doc.line(1);
    const ctx = makeContext(state, line.from + 5);
    expect(goCompletionSource(ctx)).toBeNull();
  });

  it("returns null for non-go fences", () => {
    const doc = "```python\nprint('hi')\n```";
    const state = makeState(doc);
    const line = state.doc.line(2);
    const ctx = makeContext(state, line.from + 5);
    expect(goCompletionSource(ctx)).toBeNull();
  });

  it("returns null for closing fence (no lang marker)", () => {
    const doc = "```go\ncode\n```\ntext\n";
    const state = makeState(doc);
    const line = state.doc.line(4);
    const ctx = makeContext(state, line.from + 2);
    expect(goCompletionSource(ctx)).toBeNull();
  });

  it("returns null for non-explicit completion without word", () => {
    const doc = "```go\n \n```";
    const state = makeState(doc);
    const line = state.doc.line(2);
    const ctx = makeContext(state, line.from + 1, false);
    expect(goCompletionSource(ctx)).toBeNull();
  });

  it("returns keyword completions inside go fence", () => {
    const doc = "```go\nf\n```";
    const state = makeState(doc);
    const line = state.doc.line(2);
    const ctx = makeContext(state, line.from + 1);
    const result = goCompletionSource(ctx) as CompletionResult;
    expect(result).not.toBeNull();
    const labels = result.options.map((o) => o.label);
    expect(labels).toContain("func");
    expect(labels).toContain("for");
    expect(labels).toContain("fmt");
  });

  it("returns builtin completions", () => {
    const doc = "```go\nle\n```";
    const state = makeState(doc);
    const line = state.doc.line(2);
    const ctx = makeContext(state, line.from + 2);
    const result = goCompletionSource(ctx) as CompletionResult;
    expect(result).not.toBeNull();
    const labels = result.options.map((o) => o.label);
    expect(labels).toContain("len");
  });

  it("returns snippet completions", () => {
    const doc = "```go\nifer\n```";
    const state = makeState(doc);
    const line = state.doc.line(2);
    const ctx = makeContext(state, line.from + 4);
    const result = goCompletionSource(ctx) as CompletionResult;
    expect(result).not.toBeNull();
    const labels = result.options.map((o) => o.label);
    expect(labels).toContain("iferr");
  });

  it("includes identifiers from current code", () => {
    const doc = "```go\nmyVariable := 42\nmy\n```";
    const state = makeState(doc);
    const line = state.doc.line(3);
    const ctx = makeContext(state, line.from + 2);
    const result = goCompletionSource(ctx) as CompletionResult;
    expect(result).not.toBeNull();
    const labels = result.options.map((o) => o.label);
    expect(labels).toContain("myVariable");
  });

  it("completes package members after dot (fmt.P)", () => {
    const doc = "```go\nfmt.P\n```";
    const state = makeState(doc);
    const line = state.doc.line(2);
    const ctx = makeContext(state, line.from + 5);
    const result = goCompletionSource(ctx) as CompletionResult;
    expect(result).not.toBeNull();
    const labels = result.options.map((o) => o.label);
    expect(labels).toContain("Print");
    expect(labels).toContain("Printf");
    expect(labels).toContain("Println");
  });

  it("completes package members after dot with empty prefix (fmt.)", () => {
    const doc = "```go\nfmt.\n```";
    const state = makeState(doc);
    const line = state.doc.line(2);
    const ctx = makeContext(state, line.from + 4);
    const result = goCompletionSource(ctx) as CompletionResult;
    expect(result).not.toBeNull();
    expect(result.options.length).toBeGreaterThan(0);
  });

  it("returns null for unknown package member", () => {
    const doc = "```go\nunknownpkg.X\n```";
    const state = makeState(doc);
    const line = state.doc.line(2);
    const ctx = makeContext(state, line.from + 13);
    const result = goCompletionSource(ctx);
    expect(result).toBeNull();
  });

  it("returns all keywords and builtins for explicit trigger with no prefix", () => {
    const doc = "```go\n\n```";
    const state = makeState(doc);
    const line = state.doc.line(2);
    const ctx = makeContext(state, line.from, true);
    const result = goCompletionSource(ctx) as CompletionResult;
    expect(result).not.toBeNull();
    const labels = result.options.map((o) => o.label);
    expect(labels).toContain("func");
    expect(labels).toContain("append");
    expect(labels).toContain("fmt");
    expect(labels).toContain("iferr");
  });

  it("filters options by prefix", () => {
    const doc = "```go\nstr\n```";
    const state = makeState(doc);
    const line = state.doc.line(2);
    const ctx = makeContext(state, line.from + 3);
    const result = goCompletionSource(ctx) as CompletionResult;
    expect(result).not.toBeNull();
    const labels = result.options.map((o) => o.label);
    expect(labels).toContain("struct");
    expect(labels).toContain("strings");
    expect(labels).toContain("strconv");
    expect(labels).not.toContain("func");
  });

  it("works with golang fence tag", () => {
    const doc = "```golang\nf\n```";
    const state = makeState(doc);
    const line = state.doc.line(2);
    const ctx = makeContext(state, line.from + 1);
    const result = goCompletionSource(ctx) as CompletionResult;
    expect(result).not.toBeNull();
    const labels = result.options.map((o) => o.label);
    expect(labels).toContain("func");
  });

  it("returns package completions for various packages", () => {
    const doc = "```go\nstrings.\n```";
    const state = makeState(doc);
    const line = state.doc.line(2);
    const ctx = makeContext(state, line.from + 8);
    const result = goCompletionSource(ctx) as CompletionResult;
    expect(result).not.toBeNull();
    const labels = result.options.map((o) => o.label);
    expect(labels).toContain("Contains");
    expect(labels).toContain("Split");
  });

  it("includes auto-import detail in package member completions", () => {
    const doc = "```go\njson.\n```";
    const state = makeState(doc);
    const line = state.doc.line(2);
    const ctx = makeContext(state, line.from + 5);
    const result = goCompletionSource(ctx) as CompletionResult;
    expect(result).not.toBeNull();
    expect(result.options[0].detail).toContain("encoding/json");
  });

  it("handles go fence with runnable attribute", () => {
    const doc = "```go [runnable]\npackage main\nfm\n```";
    const state = makeState(doc);
    const line = state.doc.line(3);
    const ctx = makeContext(state, line.from + 2);
    const result = goCompletionSource(ctx) as CompletionResult;
    expect(result).not.toBeNull();
    const labels = result.options.map((o) => o.label);
    expect(labels).toContain("fmt");
  });

  it("skips keywords from identifiers", () => {
    const doc = "```go\nif true { }\ni\n```";
    const state = makeState(doc);
    const line = state.doc.line(3);
    const ctx = makeContext(state, line.from + 1);
    const result = goCompletionSource(ctx) as CompletionResult;
    expect(result).not.toBeNull();
    const identVars = result.options.filter((o) => o.type === "variable").map((o) => o.label);
    expect(identVars).not.toContain("if");
  });

  it("stops collecting identifiers at closing fence", () => {
    const doc = "```go\nfoo := 1\n```\nbar := 2\n```go\nb\n```";
    const state = makeState(doc);
    const line = state.doc.line(6);
    const ctx = makeContext(state, line.from + 1);
    const result = goCompletionSource(ctx) as CompletionResult;
    expect(result).not.toBeNull();
    const labels = result.options.map((o) => o.label);
    expect(labels).toContain("break");
    expect(labels).toContain("bytes");
  });

  it("returns only the user identifier when no builtins match", () => {
    const doc = "```go\nzzzzz\n```";
    const state = makeState(doc);
    const line = state.doc.line(2);
    const ctx = makeContext(state, line.from + 5);
    const result = goCompletionSource(ctx) as CompletionResult;
    expect(result).not.toBeNull();
    const labels = result.options.map((o) => o.label);
    expect(labels).toEqual(["zzzzz"]);
  });
});

describe("buildGoCompletions", () => {
  it("returns keywords, builtins, packages and snippets for empty prefix", () => {
    const doc = makeState("```go\n\n```").doc;
    const result = buildGoCompletions("", 1, doc, 6);
    const types = new Set(result.map((o) => o.type));
    expect(types).toContain("keyword");
    expect(types).toContain("function");
    expect(types).toContain("module");
  });

  it("filters completions by prefix", () => {
    const doc = makeState("```go\nstr\n```").doc;
    const result = buildGoCompletions("str", 1, doc, 9);
    const labels = result.map((o) => o.label);
    expect(labels).toContain("struct");
    expect(labels).toContain("strings");
    expect(labels).not.toContain("func");
  });

  it("includes user-defined identifiers", () => {
    const doc = makeState("```go\nmyVar := 1\nmy\n```").doc;
    const result = buildGoCompletions("my", 1, doc, 18);
    const labels = result.map((o) => o.label);
    expect(labels).toContain("myVar");
  });

  it("returns empty array when prefix matches nothing", () => {
    const doc = makeState("```go\nzzz_unique\n```").doc;
    const result = buildGoCompletions("xyz_nomatch", 1, doc, 17);
    expect(result).toEqual([]);
  });
});
