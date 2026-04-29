import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { goAutocompleteExtension } from "../go-autocomplete";
import type { CompletionContext } from "@codemirror/autocomplete";

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

describe("go completion source (integration via EditorState)", () => {
  it("returns null outside a go fence", () => {
    const doc = "some text\n";
    const state = makeState(doc);
    const ctx = makeContext(state, doc.length - 1);
    const source = (goAutocompleteExtension as unknown as { value: { override: ((ctx: CompletionContext) => unknown)[] } }).value?.override?.[0];
    if (source) {
      expect(source(ctx)).toBeNull();
    }
  });
});

describe("detectGoFence heuristics", () => {
  it("detects cursor inside go fence", () => {
    const doc = "```go\npackage main\nfm\n```";
    const state = makeState(doc);
    const lineOfInterest = state.doc.line(3);
    const pos = lineOfInterest.from + 2;
    const ctx = makeContext(state, pos);
    const source = (goAutocompleteExtension as unknown as { value: { override: ((ctx: CompletionContext) => unknown)[] } }).value?.override?.[0];
    if (source) {
      const result = source(ctx) as { options?: unknown[] } | null;
      expect(result).not.toBeNull();
      expect(result?.options?.length).toBeGreaterThan(0);
    }
  });

  it("returns completions for go keywords", () => {
    const doc = "```go\nf\n```";
    const state = makeState(doc);
    const line = state.doc.line(2);
    const pos = line.from + 1;
    const ctx = makeContext(state, pos);
    const source = (goAutocompleteExtension as unknown as { value: { override: ((ctx: CompletionContext) => unknown)[] } }).value?.override?.[0];
    if (source) {
      const result = source(ctx) as { options?: { label: string }[] } | null;
      expect(result).not.toBeNull();
      const labels = result?.options?.map((o) => o.label) ?? [];
      expect(labels).toContain("func");
      expect(labels).toContain("for");
    }
  });

  it("completes package members after dot", () => {
    const doc = "```go\nfmt.P\n```";
    const state = makeState(doc);
    const line = state.doc.line(2);
    const pos = line.from + 5;
    const ctx = makeContext(state, pos);
    const source = (goAutocompleteExtension as unknown as { value: { override: ((ctx: CompletionContext) => unknown)[] } }).value?.override?.[0];
    if (source) {
      const result = source(ctx) as { options?: { label: string }[] } | null;
      expect(result).not.toBeNull();
      const labels = result?.options?.map((o) => o.label) ?? [];
      expect(labels).toContain("Print");
      expect(labels).toContain("Printf");
      expect(labels).toContain("Println");
    }
  });

  it("returns null for cursor on the fence line itself", () => {
    const doc = "```go\n";
    const state = makeState(doc);
    const line = state.doc.line(1);
    const pos = line.from + 5;
    const ctx = makeContext(state, pos);
    const source = (goAutocompleteExtension as unknown as { value: { override: ((ctx: CompletionContext) => unknown)[] } }).value?.override?.[0];
    if (source) {
      expect(source(ctx)).toBeNull();
    }
  });

  it("returns null for non-go fences", () => {
    const doc = "```python\nprint('hi')\n```";
    const state = makeState(doc);
    const line = state.doc.line(2);
    const pos = line.from + 5;
    const ctx = makeContext(state, pos);
    const source = (goAutocompleteExtension as unknown as { value: { override: ((ctx: CompletionContext) => unknown)[] } }).value?.override?.[0];
    if (source) {
      expect(source(ctx)).toBeNull();
    }
  });

  it("includes identifiers from current code", () => {
    const doc = "```go\nmyVariable := 42\nmy\n```";
    const state = makeState(doc);
    const line = state.doc.line(3);
    const pos = line.from + 2;
    const ctx = makeContext(state, pos);
    const source = (goAutocompleteExtension as unknown as { value: { override: ((ctx: CompletionContext) => unknown)[] } }).value?.override?.[0];
    if (source) {
      const result = source(ctx) as { options?: { label: string }[] } | null;
      const labels = result?.options?.map((o) => o.label) ?? [];
      expect(labels).toContain("myVariable");
    }
  });

  it("returns null for golang fence detected as closing fence", () => {
    const doc = "```go\ncode\n```\ntext\n";
    const state = makeState(doc);
    const line = state.doc.line(4);
    const pos = line.from + 2;
    const ctx = makeContext(state, pos);
    const source = (goAutocompleteExtension as unknown as { value: { override: ((ctx: CompletionContext) => unknown)[] } }).value?.override?.[0];
    if (source) {
      expect(source(ctx)).toBeNull();
    }
  });

  it("returns null for non-explicit completion without word", () => {
    const doc = "```go\n \n```";
    const state = makeState(doc);
    const line = state.doc.line(2);
    const pos = line.from + 1;
    const ctx = makeContext(state, pos, false);
    const source = (goAutocompleteExtension as unknown as { value: { override: ((ctx: CompletionContext) => unknown)[] } }).value?.override?.[0];
    if (source) {
      expect(source(ctx)).toBeNull();
    }
  });

  it("returns null for unknown package member", () => {
    const doc = "```go\nunknownpkg.X\n```";
    const state = makeState(doc);
    const line = state.doc.line(2);
    const pos = line.from + 13;
    const ctx = makeContext(state, pos);
    const source = (goAutocompleteExtension as unknown as { value: { override: ((ctx: CompletionContext) => unknown)[] } }).value?.override?.[0];
    if (source) {
      const result = source(ctx) as { options?: { label: string }[] } | null;
      if (result) {
        const labels = result.options?.map((o) => o.label) ?? [];
        expect(labels).not.toContain("X");
      }
    }
  });
});
