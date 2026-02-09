import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { Extension } from "@codemirror/state";

// ---------------------------------------------------------------------------
// Theme type definitions
// ---------------------------------------------------------------------------

export type ThemeId = "dark-plus" | "light-plus" | "monokai" | "github-dark" | "solarized-dark";

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  dark: boolean;
  extension: Extension;
}

// ---------------------------------------------------------------------------
// Shared editor base styles (font, spacing – theme-independent)
// ---------------------------------------------------------------------------

const editorLayout = EditorView.theme({
  "&": { fontSize: "16px" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    lineHeight: "1.6",
  },
  ".cm-line": { padding: "0 4px", lineHeight: "1.6" },
  ".cm-line *": { lineHeight: "inherit", fontFamily: "inherit", verticalAlign: "baseline" },
  ".cm-content": { padding: "20px 0" },
  ".cm-gutters": { border: "none", minWidth: "40px" },
});

// ---------------------------------------------------------------------------
// Helper: build a complete theme extension from colors
// ---------------------------------------------------------------------------

interface ThemeColors {
  bg: string;
  fg: string;
  selection: string;
  activeLine: string;
  gutterBg: string;
  gutterFg: string;
  cursor: string;
  // syntax
  heading: string;
  bold: string;
  italic: string;
  strikethrough: string;
  link: string;
  url: string;
  keyword: string;
  string: string;
  number: string;
  comment: string;
  operator: string;
  variableName: string;
  typeName: string;
  propertyName: string;
  functionName: string;
  className: string;
  meta: string;
  punctuation: string;
  content: string;
  quote: string;
  monospace: string;
  listMarker: string;
  bool: string;
  processingInstruction: string;
}

function buildTheme(colors: ThemeColors, dark: boolean): Extension {
  const base = EditorView.theme(
    {
      "&": { backgroundColor: colors.bg, color: colors.fg },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
        backgroundColor: `${colors.selection} !important`,
      },
      ".cm-activeLine": { backgroundColor: colors.activeLine },
      ".cm-gutters": { backgroundColor: colors.gutterBg, color: colors.gutterFg },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: colors.cursor },
      ".cm-activeLineGutter": { backgroundColor: colors.activeLine },
    },
    { dark }
  );

  const highlight = HighlightStyle.define([
    // Headings – distinct per level for size, same hue
    { tag: tags.heading1, color: colors.heading, fontWeight: "700", fontSize: "1.5em" },
    { tag: tags.heading2, color: colors.heading, fontWeight: "700", fontSize: "1.3em" },
    { tag: tags.heading3, color: colors.heading, fontWeight: "700", fontSize: "1.15em" },
    { tag: [tags.heading4, tags.heading5, tags.heading6].filter(Boolean), color: colors.heading, fontWeight: "700" },
    { tag: tags.heading, color: colors.heading, fontWeight: "700" },

    // Inline formatting
    { tag: tags.strong, color: colors.bold, fontWeight: "700" },
    { tag: tags.emphasis, color: colors.italic, fontStyle: "italic" },
    { tag: tags.strikethrough, color: colors.strikethrough, textDecoration: "line-through" },

    // Links
    { tag: tags.link, color: colors.link, textDecoration: "underline" },
    { tag: tags.url, color: colors.url },

    // Code
    { tag: tags.monospace, color: colors.monospace },
    { tag: tags.processingInstruction, color: colors.processingInstruction },

    // Language tokens (for fenced code blocks)
    { tag: tags.keyword, color: colors.keyword },
    { tag: tags.string, color: colors.string },
    { tag: tags.number, color: colors.number },
    { tag: tags.comment, color: colors.comment, fontStyle: "italic" },
    { tag: tags.operator, color: colors.operator },
    { tag: tags.variableName, color: colors.variableName },
    { tag: tags.typeName, color: colors.typeName },
    { tag: tags.propertyName, color: colors.propertyName },
    { tag: tags.function(tags.variableName), color: colors.functionName },
    { tag: tags.className, color: colors.className },
    { tag: [tags.bool, tags.atom].filter(Boolean), color: colors.bool },

    // Markdown structural
    { tag: tags.meta, color: colors.meta },
    { tag: tags.content, color: colors.content },
    { tag: tags.quote, color: colors.quote, fontStyle: "italic" },
    { tag: [tags.list].filter(Boolean), color: colors.listMarker },

    // Punctuation & brackets
    {
      tag: [
        tags.punctuation, tags.separator, tags.bracket,
        tags.angleBracket, tags.squareBracket, tags.paren, tags.brace,
      ].filter(Boolean),
      color: colors.punctuation,
    },

    // Other
    { tag: tags.literal, color: colors.string },
    { tag: tags.character, color: colors.string },
    { tag: tags.labelName, color: colors.variableName },
    { tag: tags.inserted, color: colors.string },
    { tag: tags.deleted, color: colors.keyword },
  ]);

  return [base, syntaxHighlighting(highlight), editorLayout];
}

// ---------------------------------------------------------------------------
// Theme: Dark+ (VSCode default dark)
// ---------------------------------------------------------------------------

const darkPlus = buildTheme(
  {
    bg: "#1e1e1e",
    fg: "#d4d4d4",
    selection: "#264f78",
    activeLine: "#2a2d2e",
    gutterBg: "#1e1e1e",
    gutterFg: "#858585",
    cursor: "#aeafad",
    heading: "#569cd6",
    bold: "#569cd6",
    italic: "#ce9178",
    strikethrough: "#d4d4d4",
    link: "#4fc1ff",
    url: "#3794ff",
    keyword: "#569cd6",
    string: "#ce9178",
    number: "#b5cea8",
    comment: "#6a9955",
    operator: "#d4d4d4",
    variableName: "#9cdcfe",
    typeName: "#4ec9b0",
    propertyName: "#9cdcfe",
    functionName: "#dcdcaa",
    className: "#4ec9b0",
    meta: "#569cd6",
    punctuation: "#808080",
    content: "#d4d4d4",
    quote: "#608b4e",
    monospace: "#ce9178",
    listMarker: "#6796e6",
    bool: "#569cd6",
    processingInstruction: "#808080",
  },
  true
);

// ---------------------------------------------------------------------------
// Theme: Light+ (VSCode default light)
// ---------------------------------------------------------------------------

const lightPlus = buildTheme(
  {
    bg: "#ffffff",
    fg: "#000000",
    selection: "#add6ff",
    activeLine: "#f3f3f3",
    gutterBg: "#ffffff",
    gutterFg: "#237893",
    cursor: "#000000",
    heading: "#0000ff",
    bold: "#0000ff",
    italic: "#a31515",
    strikethrough: "#000000",
    link: "#006ab1",
    url: "#006ab1",
    keyword: "#0000ff",
    string: "#a31515",
    number: "#098658",
    comment: "#008000",
    operator: "#000000",
    variableName: "#001080",
    typeName: "#267f99",
    propertyName: "#001080",
    functionName: "#795e26",
    className: "#267f99",
    meta: "#0000ff",
    punctuation: "#000000",
    content: "#000000",
    quote: "#008000",
    monospace: "#a31515",
    listMarker: "#0451a5",
    bool: "#0000ff",
    processingInstruction: "#000000",
  },
  false
);

// ---------------------------------------------------------------------------
// Theme: Monokai
// ---------------------------------------------------------------------------

const monokai = buildTheme(
  {
    bg: "#272822",
    fg: "#f8f8f2",
    selection: "#49483e",
    activeLine: "#3e3d32",
    gutterBg: "#272822",
    gutterFg: "#75715e",
    cursor: "#f8f8f0",
    heading: "#a6e22e",
    bold: "#f8f8f2",
    italic: "#fd971f",
    strikethrough: "#f8f8f2",
    link: "#66d9ef",
    url: "#66d9ef",
    keyword: "#f92672",
    string: "#e6db74",
    number: "#ae81ff",
    comment: "#75715e",
    operator: "#f92672",
    variableName: "#f8f8f2",
    typeName: "#66d9ef",
    propertyName: "#a6e22e",
    functionName: "#a6e22e",
    className: "#66d9ef",
    meta: "#f92672",
    punctuation: "#f8f8f2",
    content: "#f8f8f2",
    quote: "#75715e",
    monospace: "#e6db74",
    listMarker: "#f92672",
    bool: "#ae81ff",
    processingInstruction: "#75715e",
  },
  true
);

// ---------------------------------------------------------------------------
// Theme: GitHub Dark
// ---------------------------------------------------------------------------

const githubDark = buildTheme(
  {
    bg: "#0d1117",
    fg: "#c9d1d9",
    selection: "#1f3a5f",
    activeLine: "#161b22",
    gutterBg: "#0d1117",
    gutterFg: "#484f58",
    cursor: "#c9d1d9",
    heading: "#79c0ff",
    bold: "#c9d1d9",
    italic: "#a5d6ff",
    strikethrough: "#c9d1d9",
    link: "#58a6ff",
    url: "#58a6ff",
    keyword: "#ff7b72",
    string: "#a5d6ff",
    number: "#79c0ff",
    comment: "#8b949e",
    operator: "#ff7b72",
    variableName: "#c9d1d9",
    typeName: "#ffa657",
    propertyName: "#79c0ff",
    functionName: "#d2a8ff",
    className: "#ffa657",
    meta: "#ff7b72",
    punctuation: "#c9d1d9",
    content: "#c9d1d9",
    quote: "#8b949e",
    monospace: "#a5d6ff",
    listMarker: "#ff7b72",
    bool: "#79c0ff",
    processingInstruction: "#8b949e",
  },
  true
);

// ---------------------------------------------------------------------------
// Theme: Solarized Dark
// ---------------------------------------------------------------------------

const solarizedDark = buildTheme(
  {
    bg: "#002b36",
    fg: "#839496",
    selection: "#073642",
    activeLine: "#073642",
    gutterBg: "#002b36",
    gutterFg: "#586e75",
    cursor: "#839496",
    heading: "#268bd2",
    bold: "#839496",
    italic: "#2aa198",
    strikethrough: "#839496",
    link: "#268bd2",
    url: "#268bd2",
    keyword: "#859900",
    string: "#2aa198",
    number: "#d33682",
    comment: "#586e75",
    operator: "#859900",
    variableName: "#b58900",
    typeName: "#cb4b16",
    propertyName: "#268bd2",
    functionName: "#268bd2",
    className: "#cb4b16",
    meta: "#859900",
    punctuation: "#839496",
    content: "#839496",
    quote: "#586e75",
    monospace: "#2aa198",
    listMarker: "#859900",
    bool: "#d33682",
    processingInstruction: "#586e75",
  },
  true
);

// ---------------------------------------------------------------------------
// Theme registry
// ---------------------------------------------------------------------------

export const THEMES: ThemeDefinition[] = [
  { id: "dark-plus", label: "Dark+", dark: true, extension: darkPlus },
  { id: "light-plus", label: "Light+", dark: false, extension: lightPlus },
  { id: "monokai", label: "Monokai", dark: true, extension: monokai },
  { id: "github-dark", label: "GitHub Dark", dark: true, extension: githubDark },
  { id: "solarized-dark", label: "Solarized Dark", dark: true, extension: solarizedDark },
];

export const DEFAULT_THEME_ID: ThemeId = "dark-plus";

export function getThemeById(id: ThemeId): ThemeDefinition {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

// ---------------------------------------------------------------------------
// localStorage persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = "mnote-editor-theme";

export function loadThemePreference(): ThemeId {
  if (typeof window === "undefined") return DEFAULT_THEME_ID;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && THEMES.some((t) => t.id === stored)) return stored as ThemeId;
  return DEFAULT_THEME_ID;
}

export function saveThemePreference(id: ThemeId): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, id);
}
