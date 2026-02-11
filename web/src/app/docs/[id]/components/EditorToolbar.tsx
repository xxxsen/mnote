"use client";

import { memo, type RefObject } from "react";
import { THEMES, type ThemeId } from "@/lib/editor-themes";
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
  Sparkles,
  Strikethrough,
  Table as TableIcon,
  Tags,
  Type,
  Underline as UnderlineIcon,
  Undo,
  Wand2,
} from "lucide-react";

type EditorToolbarProps = {
  handleUndo: () => void;
  handleRedo: () => void;
  handleFormat: (type: "wrap" | "line", prefix: string, suffix?: string) => void;
  handleInsertTable: () => void;
  handleAiPolish: () => void;
  handleAiGenerateOpen: () => void;
  handleAiTags: () => void;
  handlePreviewOpen: () => void;
  aiBusy: boolean;
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
  handleFormat,
  handleInsertTable,
  handleAiPolish,
  handleAiGenerateOpen,
  handleAiTags,
  handlePreviewOpen,
  aiBusy,
  activePopover,
  setActivePopover,
  colorButtonRef,
  sizeButtonRef,
  emojiButtonRef,
  currentTheme,
  onThemeChange,
}: EditorToolbarProps) {
  return (
    <div className="flex items-center gap-1 px-2 py-1 border-b border-border bg-background/50 backdrop-blur-sm sticky top-0 z-10 flex-none overflow-x-auto overflow-y-visible no-scrollbar min-h-[36px]">
      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={handleUndo} title="Undo"><Undo className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={handleRedo} title="Redo"><Redo className="h-3.5 w-3.5" /></Button>
      </div>
      <div className="w-px h-3 bg-border mx-1 shrink-0" />

      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => handleFormat("line", "# ")} title="Heading 1"><Heading1 className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => handleFormat("line", "## ")} title="Heading 2"><Heading2 className="h-3.5 w-3.5" /></Button>
      </div>
      <div className="w-px h-3 bg-border mx-1 shrink-0" />

      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => handleFormat("wrap", "**", "**")} title="Bold"><Bold className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => handleFormat("wrap", "*", "*")} title="Italic"><Italic className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => handleFormat("wrap", "~~", "~~")} title="Strikethrough"><Strikethrough className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => handleFormat("wrap", "<u>", "</u>")} title="Underline"><UnderlineIcon className="h-3.5 w-3.5" /></Button>
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 shrink-0 hover:text-foreground ${activePopover === "color" ? "text-primary bg-accent" : "text-muted-foreground"}`}
            onClick={() => setActivePopover(activePopover === "color" ? null : "color")}
            title="Text Color"
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
            title="Font Size"
            data-popover-trigger
            ref={sizeButtonRef}
          >
            <Type className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="w-px h-3 bg-border mx-1 shrink-0" />

      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => handleFormat("line", "- ")} title="Bullet List"><List className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => handleFormat("line", "1. ")} title="Ordered List"><ListOrdered className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => handleFormat("line", "- [ ] ")} title="Todo List"><ListTodo className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => handleFormat("line", "> ")} title="Quote"><Quote className="h-3.5 w-3.5" /></Button>
      </div>
      <div className="w-px h-3 bg-border mx-1 shrink-0" />

      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => handleFormat("wrap", "`", "`")} title="Inline Code"><Code className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => handleFormat("wrap", "```\n", "\n```")} title="Code Block"><FileCode className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => handleFormat("wrap", "[", "](url)")} title="Link"><LinkIcon className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={handleInsertTable} title="Table"><TableIcon className="h-3.5 w-3.5" /></Button>
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 shrink-0 hover:text-foreground ${activePopover === "emoji" ? "text-primary bg-accent" : "text-muted-foreground"}`}
            onClick={() => setActivePopover(activePopover === "emoji" ? null : "emoji")}
            title="Emoji"
            data-popover-trigger
            ref={emojiButtonRef}
          >
            <Smile className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="w-px h-3 bg-border mx-1 shrink-0" />

      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={handleAiPolish} title="AI Polish" disabled={aiBusy}>
          <Sparkles className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={handleAiGenerateOpen} title="AI Generate" disabled={aiBusy}>
          <Wand2 className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={handleAiTags} title="AI Tags" disabled={aiBusy}>
          <Tags className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="w-px h-3 bg-border mx-1 shrink-0" />

      <div className="flex items-center gap-0.5">
        <select
          value={currentTheme}
          onChange={(e) => onThemeChange(e.target.value as ThemeId)}
          className="h-7 rounded px-1.5 text-xs bg-transparent border border-border text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer"
          title="Editor Theme"
          data-testid="theme-selector"
        >
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>

      <div className="w-px h-3 bg-border mx-1 shrink-0" />
      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={handlePreviewOpen} title="Preview">
          <Eye className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
});
