import { autocompletion, type Completion, type CompletionContext, type CompletionResult, snippetCompletion } from "@codemirror/autocomplete";
import type { Extension, Text } from "@codemirror/state";

const GO_FENCE_LANGS = new Set(["go", "golang"]);

const GO_KEYWORDS = [
  "break", "case", "chan", "const", "continue", "default", "defer", "else", "fallthrough", "for",
  "func", "go", "goto", "if", "import", "interface", "map", "package", "range", "return",
  "select", "struct", "switch", "type", "var",
];

const GO_BUILTINS = [
  "append", "cap", "close", "complex", "copy", "delete", "imag", "len", "make", "new",
  "panic", "print", "println", "real", "recover", "clear", "max", "min",
];

const GO_PACKAGE_MEMBERS: Partial<Record<string, { importPath: string; members: string[] }>> = {
  fmt: { importPath: "fmt", members: ["Print", "Printf", "Println", "Sprint", "Sprintf", "Sprintln", "Errorf"] },
  strings: {
    importPath: "strings",
    members: [
      "Contains", "HasPrefix", "HasSuffix", "Split", "Join", "TrimSpace", "ReplaceAll", "ToLower", "ToUpper", "Repeat",
    ],
  },
  json: { importPath: "encoding/json", members: ["Marshal", "Unmarshal", "NewDecoder", "NewEncoder", "Valid"] },
  time: { importPath: "time", members: ["Now", "Parse", "Sleep", "Since", "Unix", "Date", "Duration"] },
  http: { importPath: "net/http", members: ["Get", "Post", "HandleFunc", "ListenAndServe", "NewRequest"] },
  bytes: { importPath: "bytes", members: ["NewBuffer", "NewReader", "Contains", "Equal"] },
  io: { importPath: "io", members: ["ReadAll", "Copy", "CopyBuffer", "EOF"] },
  os: { importPath: "os", members: ["Open", "Create", "ReadFile", "WriteFile", "Stat", "MkdirAll", "Exit"] },
  strconv: { importPath: "strconv", members: ["Atoi", "Itoa", "ParseInt", "ParseFloat", "FormatInt"] },
  filepath: { importPath: "path/filepath", members: ["Join", "Base", "Dir", "Ext", "Clean"] },
};

const GO_SNIPPETS: Completion[] = [
  snippetCompletion("if err != nil {\n\t${}\n}", {
    label: "iferr",
    detail: "snippet",
    type: "snippet",
  }),
  snippetCompletion("for ${i} := 0; ${i} < ${n}; ${i}++ {\n\t${}\n}", {
    label: "fori",
    detail: "snippet",
    type: "snippet",
  }),
  snippetCompletion("for ${k}, ${v} := range ${iterable} {\n\t${}\n}", {
    label: "forr",
    detail: "snippet",
    type: "snippet",
  }),
  snippetCompletion("func ${name}(${params}) ${ret} {\n\t${}\n}", {
    label: "func",
    detail: "snippet",
    type: "snippet",
  }),
  snippetCompletion("type ${Name} struct {\n\t${}\n}", {
    label: "struct",
    detail: "snippet",
    type: "snippet",
  }),
];

type GoFenceContext = {
  inGoFence: boolean;
  fenceStartLine: number;
};

function detectGoFence(doc: Text, pos: number): GoFenceContext {
  const cursorLine = doc.lineAt(pos).number;
  for (let lineNo = cursorLine; lineNo >= 1; lineNo -= 1) {
    const raw = doc.line(lineNo).text;
    const line = raw.trim();
    if (!line.startsWith("```")) continue;

    // Opening fences in this editor are language-tagged (e.g. ```go [runnable]).
    const lang = line.slice(3).trim().split(/\s+/)[0]?.toLowerCase() || "";

    // If nearest fence has no language marker, treat it as a closing fence.
    if (!lang) {
      return { inGoFence: false, fenceStartLine: 0 };
    }

    // Cursor on the opening fence line itself is outside code content.
    if (lineNo === cursorLine) {
      return { inGoFence: false, fenceStartLine: 0 };
    }

    return {
      inGoFence: GO_FENCE_LANGS.has(lang),
      fenceStartLine: lineNo,
    };
  }

  return { inGoFence: false, fenceStartLine: 0 };
}

function collectGoIdentifiers(doc: Text, fenceStartLine: number, pos: number): string[] {
  const currentLine = doc.lineAt(pos).number;
  const seen = new Set<string>();
  for (let lineNo = Math.max(1, fenceStartLine + 1); lineNo <= currentLine; lineNo += 1) {
    const text = doc.line(lineNo).text;
    if (text.trim().startsWith("```")) break;
    const matches = text.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g);
    for (const match of matches) {
      const ident = match[0];
      if (!ident || GO_KEYWORDS.includes(ident)) continue;
      seen.add(ident);
    }
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

function completeGoMember(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const prefix = line.text.slice(0, context.pos - line.from);
  const match = prefix.match(/([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)?$/);
  if (!match) return null;
  const pkg = match[1];
  const memberPrefix = match[2] || "";
  const packageInfo = GO_PACKAGE_MEMBERS[pkg];
  if (!packageInfo) return null;

  const options: Completion[] = packageInfo.members
    .filter((name) => name.startsWith(memberPrefix))
    .map((name) => ({
      label: name,
      type: "function",
      apply: name,
      detail: `auto-import: ${packageInfo.importPath}`,
      boost: 90,
    }));

  if (options.length === 0) return null;
  return {
    from: context.pos - memberPrefix.length,
    options,
    validFor: /^[A-Za-z_][A-Za-z0-9_]*$/,
  };
}

function buildGoCompletions(prefix: string, fenceStartLine: number, doc: Text, pos: number): Completion[] {
  const options: Completion[] = [];

  const addOption = (option: Completion) => {
    if (prefix && !option.label.startsWith(prefix)) return;
    options.push(option);
  };

  for (const key of GO_KEYWORDS) addOption({ label: key, type: "keyword", boost: 40 });
  for (const builtin of GO_BUILTINS) addOption({ label: builtin, type: "function", boost: 35 });
  for (const [pkg, config] of Object.entries(GO_PACKAGE_MEMBERS)) {
    if (config) addOption({ label: pkg, type: "module", detail: `import: ${config.importPath}`, boost: 30 });
  }

  const identifiers = collectGoIdentifiers(doc, fenceStartLine, pos);
  for (const ident of identifiers) addOption({ label: ident, type: "variable", boost: 25 });

  for (const snippet of GO_SNIPPETS) addOption(snippet);
  return options;
}

function goCompletionSource(context: CompletionContext): CompletionResult | null {
  const fenceCtx = detectGoFence(context.state.doc, context.pos);
  if (!fenceCtx.inGoFence) return null;

  const memberCompletion = completeGoMember(context);
  if (memberCompletion) return memberCompletion;

  const word = context.matchBefore(/[A-Za-z_][A-Za-z0-9_]*/);
  if (!context.explicit && !word) return null;
  const prefix = word?.text || "";
  const from = word?.from ?? context.pos;

  const options = buildGoCompletions(prefix, fenceCtx.fenceStartLine, context.state.doc, context.pos);
  if (options.length === 0) return null;
  return {
    from,
    options,
    validFor: /^[A-Za-z_][A-Za-z0-9_]*$/,
  };
}

export const goAutocompleteExtension: Extension = autocompletion({
  override: [goCompletionSource],
  activateOnTyping: true,
});
