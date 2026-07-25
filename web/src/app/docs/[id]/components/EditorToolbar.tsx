"use client";

import { memo, useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { THEMES, type ThemeId } from "@/lib/editor-themes";
import type { MarkdownCommand } from "../commands/markdown-commands";
import { Button } from "@/components/ui/button";
import {
  Bold,
  Code,
  Eye,
  FileCode,
  Heading1,
  Heading2,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  ListTodo,
  Palette,
  Quote,
  Redo,
  Smile,
  Strikethrough,
  Table as TableIcon,
  Type,
  Underline as UnderlineIcon,
  Undo,
} from "lucide-react";

type EditorToolbarProps = {
  handleUndo: () => void;
  handleRedo: () => void;
  executeCommand: (command: MarkdownCommand) => void;
  handlePreviewOpen: () => void;
  activePopover: "emoji" | "color" | "size" | null;
  setActivePopover: (v: "emoji" | "color" | "size" | null) => void;
  colorButtonRef: RefObject<HTMLButtonElement | null>;
  sizeButtonRef: RefObject<HTMLButtonElement | null>;
  emojiButtonRef: RefObject<HTMLButtonElement | null>;
  currentTheme: ThemeId;
  onThemeChange: (id: ThemeId) => void;
};

export const EditorToolbar = memo(function EditorToolbar({
  handleUndo,
  handleRedo,
  executeCommand,
  handlePreviewOpen,
  activePopover,
  setActivePopover,
  colorButtonRef,
  sizeButtonRef,
  emojiButtonRef,
  currentTheme,
  onThemeChange,
}: EditorToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const threshold = 2;
    setCanScrollLeft(el.scrollLeft > threshold);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - threshold);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = toolbarRef.current;
    if (!el) return;
    if (el.scrollWidth <= el.clientWidth) return;
    e.preventDefault();
    el.scrollLeft += e.deltaY;
  }, []);

  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    updateScrollState();
    const ro = new ResizeObserver(() => updateScrollState());
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateScrollState]);

  return (
    <div className="relative hidden flex-none sticky top-0 z-10 lg:block">
      {/* Left fade indicator */}
      <div
        className="absolute left-0 top-0 bottom-0 w-6 z-10 pointer-events-none transition-opacity duration-200"
        style={{
          opacity: canScrollLeft ? 1 : 0,
          background: "linear-gradient(to right, var(--background), transparent)",
        }}
      />
      {/* Right fade indicator */}
      <div
        className="absolute right-0 top-0 bottom-0 w-6 z-10 pointer-events-none transition-opacity duration-200"
        style={{
          opacity: canScrollRight ? 1 : 0,
          background: "linear-gradient(to left, var(--background), transparent)",
        }}
      />
      <div
        role="toolbar"
        aria-label="Markdown formatting"
        ref={toolbarRef}
        onWheel={handleWheel}
        onScroll={updateScrollState}
        className="flex items-center gap-1 px-2 py-1 border-b border-border bg-background/50 backdrop-blur-sm overflow-x-auto overflow-y-visible no-scrollbar min-h-[36px]"
      >
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={handleUndo} aria-label="Undo" title="Undo"><Undo className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={handleRedo} aria-label="Redo" title="Redo"><Redo className="h-3.5 w-3.5" /></Button>
        </div>
        <div className="w-px h-3 bg-border mx-1 shrink-0" />

        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => executeCommand({ kind: "heading", level: 1 })} aria-label="Heading 1" title="Heading 1"><Heading1 className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => executeCommand({ kind: "heading", level: 2 })} aria-label="Heading 2" title="Heading 2"><Heading2 className="h-3.5 w-3.5" /></Button>
        </div>
        <div className="w-px h-3 bg-border mx-1 shrink-0" />

        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => executeCommand({ kind: "inline", mark: "bold" })} aria-label="Bold" title="Bold"><Bold className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => executeCommand({ kind: "inline", mark: "italic" })} aria-label="Italic" title="Italic"><Italic className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => executeCommand({ kind: "inline", mark: "strike" })} aria-label="Strikethrough" title="Strikethrough"><Strikethrough className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => executeCommand({ kind: "inline", mark: "underline" })} aria-label="Underline" title="Underline"><UnderlineIcon className="h-3.5 w-3.5" /></Button>
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 shrink-0 hover:text-foreground ${activePopover === "color" ? "text-primary bg-accent" : "text-muted-foreground"}`}
              onClick={() => setActivePopover(activePopover === "color" ? null : "color")}
              aria-label="Text Color" title="Text Color"
              data-popover-trigger
              ref={colorButtonRef}
            >
              <Palette className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 shrink-0 hover:text-foreground ${activePopover === "size" ? "text-primary bg-accent" : "text-muted-foreground"}`}
              onClick={() => setActivePopover(activePopover === "size" ? null : "size")}
              aria-label="Font Size" title="Font Size"
              data-popover-trigger
              ref={sizeButtonRef}
            >
              <Type className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="w-px h-3 bg-border mx-1 shrink-0" />

        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => executeCommand({ kind: "block", block: "bullet" })} aria-label="Bullet List" title="Bullet List"><List className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => executeCommand({ kind: "block", block: "ordered" })} aria-label="Ordered List" title="Ordered List"><ListOrdered className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => executeCommand({ kind: "block", block: "task" })} aria-label="Todo List" title="Todo List"><ListTodo className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => executeCommand({ kind: "block", block: "quote" })} aria-label="Quote" title="Quote"><Quote className="h-3.5 w-3.5" /></Button>
        </div>
        <div className="w-px h-3 bg-border mx-1 shrink-0" />

        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => executeCommand({ kind: "inline", mark: "code" })} aria-label="Inline Code" title="Inline Code"><Code className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => executeCommand({ kind: "insert", item: "codeBlock" })} aria-label="Code Block" title="Code Block"><FileCode className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => executeCommand({ kind: "insert", item: "link" })} aria-label="Link" title="Link"><LinkIcon className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => executeCommand({ kind: "insert", item: "table" })} aria-label="Table" title="Table"><TableIcon className="h-3.5 w-3.5" /></Button>
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 shrink-0 hover:text-foreground ${activePopover === "emoji" ? "text-primary bg-accent" : "text-muted-foreground"}`}
              onClick={() => setActivePopover(activePopover === "emoji" ? null : "emoji")}
              aria-label="Emoji" title="Emoji"
              data-popover-trigger
              ref={emojiButtonRef}
            >
              <Smile className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="w-px h-3 bg-border mx-1 shrink-0" />

        <div className="flex items-center gap-0.5">
          <select
            value={currentTheme}
            onChange={(e) => onThemeChange(e.target.value as ThemeId)}
            className="h-7 rounded px-1.5 text-xs bg-transparent border border-border text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer"
            aria-label="Editor Theme" title="Editor Theme"
            data-testid="theme-selector"
          >
            {THEMES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="w-px h-3 bg-border mx-1 shrink-0" />
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={handlePreviewOpen} aria-label="Preview" title="Preview">
            <Eye className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
});
