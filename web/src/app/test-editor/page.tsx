"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { LanguageDescription } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { styleTags } from "@lezer/highlight";
import { Compartment } from "@codemirror/state";
import {
  THEMES,
  getThemeById,
  loadThemePreference,
  saveThemePreference,
  type ThemeId,
} from "@/lib/editor-themes";

const themeCompartment = new Compartment();

const SAMPLE_MARKDOWN = `# Heading 1

## Heading 2

### Heading 3

This is **bold text** and *italic text* and ~~strikethrough~~.

Here is a [link to example](https://example.com) and \`inline code\`.

> This is a blockquote
> with multiple lines

- Bullet item 1
- Bullet item 2
  - Nested item

1. Ordered item 1
2. Ordered item 2

- [ ] Todo unchecked
- [x] Todo checked

---

\`\`\`javascript
function hello(name) {
  const greeting = "Hello, " + name;
  console.log(greeting);
  return true;
}
\`\`\`

\`\`\`python
def fibonacci(n):
    """Calculate fibonacci number"""
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)
\`\`\`

| Column A | Column B | Column C |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |
`;

export default function TestEditorPage() {
  const [currentThemeId, setCurrentThemeId] = useState<ThemeId>(loadThemePreference);
  const [content, setContent] = useState(SAMPLE_MARKDOWN);
  const editorViewRef = useRef<EditorView | null>(null);

  const handleThemeChange = useCallback((id: ThemeId) => {
    setCurrentThemeId(id);
    saveThemePreference(id);
    const view = editorViewRef.current;
    if (view) {
      view.dispatch({
        effects: themeCompartment.reconfigure(getThemeById(id).extension),
      });
    }
  }, []);

  const editorExtensions = useMemo(
    () => [
      markdown({
        codeLanguages: (info) => {
          const languageName = info.includes(":") ? info.split(":")[0] : info;
          return LanguageDescription.matchLanguageName(languages, languageName);
        },
        extensions: [
          {
            props: [styleTags({ HeaderMark: tags.heading })],
          },
        ],
      }),
      themeCompartment.of(getThemeById(currentThemeId).extension),
      EditorView.lineWrapping,
    ],
    [currentThemeId]
  );

  return (
    <div className="flex flex-col h-screen" data-testid="test-editor-root">
      <div className="flex items-center gap-3 p-3 border-b bg-neutral-900 text-white">
        <label htmlFor="test-editor-theme" className="text-sm font-medium">
          Theme:
        </label>
        <select
          id="test-editor-theme"
          value={currentThemeId}
          onChange={(e) => handleThemeChange(e.target.value as ThemeId)}
          className="h-8 rounded px-2 text-sm bg-neutral-800 border border-neutral-600 text-white"
          data-testid="theme-selector"
        >
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-neutral-400" data-testid="current-theme-label">
          Current: {currentThemeId}
        </span>
      </div>
      <div className="flex-1 overflow-hidden" data-testid="editor-container">
        <CodeMirror
          value={content}
          height="100%"
          theme="none"
          extensions={editorExtensions}
          onChange={setContent}
          className="h-full w-full"
          onCreateEditor={(view) => {
            editorViewRef.current = view;
          }}
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: false,
          }}
        />
      </div>
    </div>
  );
}
