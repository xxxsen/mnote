"use client";

import React, { useEffect, useState, useCallback, useRef, useTransition, useMemo, memo } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView, placeholder } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { undo, redo } from "@codemirror/commands";
import ReactMarkdown from "react-markdown";
import { apiFetch, uploadFile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import MarkdownPreview from "@/components/markdown-preview";
import { Document, Tag, DocumentVersionSummary, Share } from "@/types";
import {
  Save,
  Share2,
  Download,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Home,
  Folder,
  Columns,
  Search,
  RefreshCw,
  Bold,
  Italic,
  Strikethrough,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Code,
  FileCode,
  Link as LinkIcon,
  Table as TableIcon,
  Palette,
  Type,
  Smile,
  Sparkles,
  Star,
  Wand2,
  Tags,
  Undo,
  Redo,
  X,
  Menu,
  Command,
  AlertTriangle,
  Copy,
  Check
} from "lucide-react";
import { formatDate } from "@/lib/utils";

const EMOJIS = ["😀", "😂", "🥰", "😎", "🤔", "😅", "😭", "👍", "👎", "🙏", "🔥", "✨", "🎉", "🚀", "❤️", "✅", "❌", "⚠️", "💡", "📝"];

const COLORS = [
  { label: "Default", value: "" },
  { label: "Red", value: "#ef4444" },
  { label: "Green", value: "#22c55e" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Yellow", value: "#eab308" },
  { label: "Purple", value: "#a855f7" },
  { label: "Orange", value: "#f97316" },
  { label: "Gray", value: "#6b7280" },
];

const SIZES = [
  { label: "Small", value: "12px" },
  { label: "Normal", value: "16px" },
  { label: "Medium", value: "18px" },
  { label: "Large", value: "20px" },
  { label: "Huge", value: "24px" },
];

const MAX_TAGS = 7;

type AIAction = "polish" | "generate" | "tags" | "summary";

type DiffLine = {
  type: "equal" | "add" | "remove";
  left?: string;
  right?: string;
};

const buildLineDiff = (before: string, after: string): DiffLine[] => {
  const leftLines = before.split("\n");
  const rightLines = after.split("\n");
  const m = leftLines.length;
  const n = rightLines.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (leftLines[i] === rightLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (leftLines[i] === rightLines[j]) {
      result.push({ type: "equal", left: leftLines[i], right: rightLines[j] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: "remove", left: leftLines[i] });
      i += 1;
    } else {
      result.push({ type: "add", right: rightLines[j] });
      j += 1;
    }
  }
  while (i < m) {
    result.push({ type: "remove", left: leftLines[i] });
    i += 1;
  }
  while (j < n) {
    result.push({ type: "add", right: rightLines[j] });
    j += 1;
  }
  return result;
};

type SlashActionContext = {
  handleFormat: (type: "wrap" | "line", prefix: string, suffix?: string) => void;
  handleInsertTable: () => void;
  insertTextAtCursor: (text: string) => void;
};

type SlashCommand = {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: (ctx: SlashActionContext) => void;
};

const SLASH_COMMANDS: SlashCommand[] = [
  { id: "h1", label: "Heading 1", icon: <Heading1 className="h-4 w-4" />, action: (s) => s.handleFormat("line", "# ") },
  { id: "h2", label: "Heading 2", icon: <Heading2 className="h-4 w-4" />, action: (s) => s.handleFormat("line", "## ") },
  { id: "bold", label: "Bold", icon: <Bold className="h-4 w-4" />, action: (s) => s.handleFormat("wrap", "**", "**") },
  { id: "italic", label: "Italic", icon: <Italic className="h-4 w-4" />, action: (s) => s.handleFormat("wrap", "*", "*") },
  { id: "list", label: "Bullet List", icon: <List className="h-4 w-4" />, action: (s) => s.handleFormat("line", "- ") },
  { id: "numlist", label: "Numbered List", icon: <ListOrdered className="h-4 w-4" />, action: (s) => s.handleFormat("line", "1. ") },
  { id: "todo", label: "Todo List", icon: <ListTodo className="h-4 w-4" />, action: (s) => s.handleFormat("line", "- [ ] ") },
  { id: "code", label: "Code Block", icon: <FileCode className="h-4 w-4" />, action: (s) => s.handleFormat("wrap", "```\n", "\n```") },
  { id: "table", label: "Table", icon: <TableIcon className="h-4 w-4" />, action: (s) => s.handleInsertTable() },
  { id: "quote", label: "Quote", icon: <Quote className="h-4 w-4" />, action: (s) => s.handleFormat("line", "> ") },
  { id: "divider", label: "Divider", icon: <div className="h-0.5 w-4 bg-muted-foreground opacity-50" />, action: (s) => s.insertTextAtCursor("\n---\n") },
];

type HeaderProps = {
  router: ReturnType<typeof useRouter>;
  title: string;
  handleSave: () => void;
  saving: boolean;
  hasUnsavedChanges: boolean;
  lastSavedAt: number | null;
  showDetails: boolean;
  setShowDetails: (v: boolean) => void;
  loadVersions: () => void;
  starred: number;
  handleStarToggle: () => void;
};

const Header = memo(({ router, title, handleSave, saving, hasUnsavedChanges, lastSavedAt, showDetails, setShowDetails, loadVersions, starred, handleStarToggle }: HeaderProps) => (
  <header className={`h-14 border-b border-border flex items-center px-4 gap-4 justify-between bg-background/80 backdrop-blur-md z-40 sticky top-0 transition-all duration-300`}>
    <div className="flex items-center gap-3 flex-1 min-w-0">
      <Button variant="ghost" size="icon" onClick={() => router.push("/docs")} className="h-8 w-8">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground overflow-hidden">
        <div className="flex items-center gap-1 hover:text-foreground cursor-pointer transition-colors shrink-0" onClick={() => router.push("/docs")}>
          <Home className="h-3 w-3" />
          <span className="hidden sm:inline">My Notes</span>
        </div>
        <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />
        <div className="flex items-center gap-1 shrink-0">
          <Folder className="h-3 w-3 opacity-70" />
          <span className="hidden sm:inline">General</span>
        </div>
        <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />
        <div className="font-bold font-mono truncate text-foreground select-none max-w-[120px] sm:max-w-[200px] md:max-w-md">
          {title || "Untitled"}
        </div>
      </div>
    </div>

    <div className="flex items-center gap-2">
        {lastSavedAt && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 text-[10px] text-muted-foreground font-mono hidden md:flex">
            <div className={`w-1.5 h-1.5 rounded-full ${hasUnsavedChanges ? "bg-amber-400 animate-pulse" : "bg-green-500"}`} />
            {hasUnsavedChanges ? "Unsaved Changes" : `Saved: ${formatDate(lastSavedAt)}`}
          </div>
        )}
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={handleStarToggle} 
          className={`h-8 w-8 transition-colors ${starred ? "text-yellow-500" : "text-muted-foreground"}`}
          title={starred ? "Unstar" : "Star"}
        >
          <Star className={`h-4 w-4 ${starred ? "fill-current" : ""}`} />
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving || !hasUnsavedChanges} className="rounded-xl h-8 text-xs font-bold px-3">
          {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => { setShowDetails(!showDetails); if (!showDetails) loadVersions(); }} className={`h-8 w-8 ${showDetails ? "bg-accent text-foreground" : "text-muted-foreground"}`}>
          <Columns className="h-4 w-4 rotate-90" />
        </Button>
    </div>
  </header>
));

Header.displayName = "Header";

type FooterProps = {
  cursorPos: { line: number; col: number };
  wordCount: number;
  charCount: number;
  hasUnsavedChanges: boolean;
};

const Footer = memo(({ cursorPos, wordCount, charCount, hasUnsavedChanges }: FooterProps) => (
  <footer className={`h-8 border-t border-border bg-background/80 backdrop-blur-sm flex items-center px-4 justify-between text-[10px] font-mono text-muted-foreground z-50 fixed bottom-0 left-0 right-0 transition-all duration-300`}>
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-1.5">
        <span className="opacity-50">LN</span> {cursorPos.line}
        <span className="opacity-50">COL</span> {cursorPos.col}
      </div>
      <div className="w-px h-3 bg-border opacity-50" />
      <div className="flex items-center gap-1.5">
        <span>{wordCount} words</span>
        <span>{charCount} chars</span>
      </div>
    </div>
    
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-1.5">
         <div className={`w-1.5 h-1.5 rounded-full ${hasUnsavedChanges ? "bg-amber-400" : "bg-green-500"}`} />
         <span>{hasUnsavedChanges ? "UNSAVED" : "SYNCED"}</span>
      </div>
      <div className="w-px h-3 bg-border opacity-50" />
    </div>
  </footer>
));

Footer.displayName = "Footer";

type ToolbarProps = {
  handleUndo: () => void;
  handleRedo: () => void;
  handleFormat: (type: "wrap" | "line", prefix: string, suffix?: string) => void;
  handleInsertTable: () => void;
  handleAiPolish: () => void;
  handleAiGenerateOpen: () => void;
  handleAiTags: () => void;
  aiBusy: boolean;
  activePopover: "emoji" | "color" | "size" | null;
  setActivePopover: (v: "emoji" | "color" | "size" | null) => void;
  colorButtonRef: React.RefObject<HTMLButtonElement | null>;
  sizeButtonRef: React.RefObject<HTMLButtonElement | null>;
  emojiButtonRef: React.RefObject<HTMLButtonElement | null>;
};

const Toolbar = memo(({ 
  handleUndo, 
  handleRedo, 
  handleFormat, 
  handleInsertTable, 
  handleAiPolish,
  handleAiGenerateOpen,
  handleAiTags,
  aiBusy,
  activePopover, 
  setActivePopover, 
  colorButtonRef, 
  sizeButtonRef, 
  emojiButtonRef 
}: ToolbarProps) => (
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
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={handleAiPolish}
        title="AI Polish"
        disabled={aiBusy}
      >
        <Sparkles className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={handleAiGenerateOpen}
        title="AI Generate"
        disabled={aiBusy}
      >
        <Wand2 className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={handleAiTags}
        title="AI Tags"
        disabled={aiBusy}
      >
        <Tags className="h-3.5 w-3.5" />
      </Button>
    </div>
  </div>
));
Toolbar.displayName = "Toolbar";

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const [id] = useState(params.id as string);
  const { toast } = useToast();
  const [tabs, setTabs] = useState<{ id: string; title: string }[]>([]);

  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [starred, setStarred] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [activeTab, setActiveTab] = useState<"tags" | "summary" | "history" | "share">("tags");
  
  const [versions, setVersions] = useState<DocumentVersionSummary[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTagIDs, setSelectedTagIDs] = useState<string[]>([]);
  const [tagQuery, setTagQuery] = useState("");
  const [tagResults, setTagResults] = useState<Tag[]>([]);
  const [tagSearchLoading, setTagSearchLoading] = useState(false);
  const [tagDropdownIndex, setTagDropdownIndex] = useState(0);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiAction, setAiAction] = useState<AIAction | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiOriginalText, setAiOriginalText] = useState("");
  const [aiResultText, setAiResultText] = useState("");
  const [aiExistingTags, setAiExistingTags] = useState<Tag[]>([]);
  const [aiSuggestedTags, setAiSuggestedTags] = useState<string[]>([]);
  const [aiSelectedTags, setAiSelectedTags] = useState<string[]>([]);
  const [aiRemovedTagIDs, setAiRemovedTagIDs] = useState<string[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);
  const [slashMenu, setSlashMenu] = useState<{ open: boolean; x: number; y: number; filter: string }>({ open: false, x: 0, y: 0, filter: "" });
  const [showQuickOpen, setShowQuickOpen] = useState(false);
  const [quickOpenQuery, setQuickOpenQuery] = useState("");
  const [quickOpenResults, setQuickOpenResults] = useState<Document[]>([]);
  const [quickOpenRecent, setQuickOpenRecent] = useState<Document[]>([]);
  const [quickOpenIndex, setQuickOpenIndex] = useState(0);
  const [quickOpenLoading, setQuickOpenLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activeShare, setActiveShare] = useState<Share | null>(null);
  const [copied, setCopied] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [popoverAnchor, setPopoverAnchor] = useState<{ top: number; left: number } | null>(null);
  const isComposingRef = useRef(false);
  const tagSearchTimerRef = useRef<number | null>(null);
  const lastTagQueryRef = useRef("");

  const [previewContent, setPreviewContent] = useState(content);
  const previewTimerRef = useRef<number | null>(null);
  const draftTimerRef = useRef<number | null>(null);
  const [, startTransition] = useTransition();
  const contentRef = useRef<string>("");
  const lastSavedContentRef = useRef<string>("");

  const previewRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const pasteHandlerRef = useRef<((event: ClipboardEvent) => void) | null>(null);
  const colorButtonRef = useRef<HTMLButtonElement | null>(null);
  const sizeButtonRef = useRef<HTMLButtonElement | null>(null);
  const emojiButtonRef = useRef<HTMLButtonElement | null>(null);
  const scrollingSource = useRef<"editor" | "preview" | null>(null);
  const forcePreviewSyncRef = useRef(false);

  // TOC State
  const [tocContent, setTocContent] = useState("");
  const [showFloatingToc, setShowFloatingToc] = useState(false);
  const [tocCollapsed, setTocCollapsed] = useState(false);
  const [activePopover, setActivePopover] = useState<"emoji" | "color" | "size" | null>(null);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

  const aiDiffLines = useMemo(
    () => (aiOriginalText && aiResultText ? buildLineDiff(aiOriginalText, aiResultText) : []),
    [aiOriginalText, aiResultText]
  );

  const aiExistingTagNames = useMemo(() => {
    const names = new Set<string>();
    aiExistingTags.forEach((tag) => {
      if (tag?.name) names.add(tag.name);
    });
    return names;
  }, [aiExistingTags]);
  
  const handleTocLoaded = useCallback((toc: string) => {
    setTocContent(toc);
  }, []);

  // TOC Helpers
  const slugify = useCallback((value: string) => {
    const base = value
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
    return base || "section";
  }, []);


  const getText = useCallback((value: React.ReactNode): string => {
    if (value === null || value === undefined) return "";
    if (typeof value === "string" || typeof value === "number") return String(value);
    if (Array.isArray(value)) return value.map((item) => getText(item)).join("");
    if (React.isValidElement<{ children?: React.ReactNode }>(value)) {
      return getText(value.props.children);
    }
    return "";
  }, []);

  const normalizeTagName = useCallback((name: string) => name.trim(), []);

  const isValidTagName = useCallback((name: string) => {
    if (!name) return false;
    if (Array.from(name).length > 16) return false;
    return /^[\p{Script=Han}A-Za-z0-9]{1,16}$/u.test(name);
  }, []);

  const mergeTags = useCallback((items: Tag[]) => {
    if (!items.length) return;
    setAllTags((prev) => {
      const seen = new Set(prev.map((tag) => tag.id));
      const next = [...prev];
      items.forEach((tag) => {
        if (!seen.has(tag.id)) {
          seen.add(tag.id);
          next.push(tag);
        }
      });
      return next;
    });
  }, []);

  const tagIndex = useMemo(() => {
    const map: Record<string, Tag> = {};
    allTags.forEach((tag) => {
      map[tag.id] = tag;
    });
    return map;
  }, [allTags]);

  const selectedTags = useMemo(
    () => selectedTagIDs.map((id) => tagIndex[id]).filter(Boolean) as Tag[],
    [selectedTagIDs, tagIndex]
  );

  const tagSuggestions = useMemo(
    () => tagResults.filter((tag) => !selectedTagIDs.includes(tag.id)),
    [tagResults, selectedTagIDs]
  );

  const trimmedTagQuery = useMemo(() => normalizeTagName(tagQuery), [normalizeTagName, tagQuery]);
  const exactTagMatch = useMemo(
    () => tagSuggestions.find((tag) => tag.name === trimmedTagQuery) || allTags.find((tag) => tag.name === trimmedTagQuery) || null,
    [allTags, tagSuggestions, trimmedTagQuery]
  );
  const tagDropdownItems = useMemo(() => {
    if (!trimmedTagQuery || tagSearchLoading) return [] as Array<{ key: string; type: "use" | "create" | "suggestion"; tag?: Tag }>;
    const items: Array<{ key: string; type: "use" | "create" | "suggestion"; tag?: Tag }> = [];
    if (exactTagMatch) {
      items.push({ key: `use-${exactTagMatch.id}`, type: "use", tag: exactTagMatch });
    } else if (isValidTagName(trimmedTagQuery)) {
      items.push({ key: `create-${trimmedTagQuery}`, type: "create" });
    }
    tagSuggestions.forEach((tag) => {
      if (exactTagMatch && tag.id === exactTagMatch.id) return;
      items.push({ key: `tag-${tag.id}`, type: "suggestion", tag });
    });
    return items;
  }, [exactTagMatch, isValidTagName, tagSearchLoading, tagSuggestions, trimmedTagQuery]);

  const getElementById = useCallback((id: string) => {
    const container = previewRef.current;
    if (!container) return null;
    const safe = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
    return container.querySelector(`#${safe}`) as HTMLElement | null;
  }, []);

  const scrollToElement = useCallback((el: HTMLElement) => {
    const container = previewRef.current;
    if (!container) return;
    
    const isScrollable = container.scrollHeight > container.clientHeight + 1;
    if (!isScrollable) {
       // If preview not scrollable (rare in split mode but possible), maybe just scroll container
       return;
    }
    
    const containerTop = container.getBoundingClientRect().top;
    const targetTop = el.getBoundingClientRect().top;
    const offset = targetTop - containerTop + container.scrollTop;
    container.scrollTo({ top: offset, behavior: "smooth" });
  }, []);

  const extractTitleFromContent = useCallback((value: string) => {
    const lines = value.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Check for # Heading
      const h1Match = line.match(/^#\s+(.+)$/);
      if (h1Match) return h1Match[1].trim();
      
      // Check for Title \n ===
      if (i + 1 < lines.length && /^=+$/.test(lines[i + 1].trim())) {
        return line;
      }
      
      // Use first non-empty line as title fallback
      return line.length > 50 ? line.slice(0, 50) + "..." : line;
    }
    return "";
  }, []);

  const randomString = useCallback((length: number) => {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    if (length <= 0) return "";
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const values = new Uint32Array(length);
      crypto.getRandomValues(values);
      return Array.from(values)
        .map((v) => chars[v % chars.length])
        .join("");
    }
    let out = "";
    for (let i = 0; i < length; i += 1) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  }, []);

  const handleEditorScroll = useCallback(() => {
    if (scrollingSource.current === "preview" || loading) return;
    const view = editorViewRef.current;
    const preview = previewRef.current;
    if (!view || !preview) return;

    const scrollInfo = view.scrollDOM;
    const maxScroll = scrollInfo.scrollHeight - scrollInfo.clientHeight;
    if (maxScroll <= 0) return;

    const percentage = scrollInfo.scrollTop / maxScroll;
    const targetTop = percentage * (preview.scrollHeight - preview.clientHeight);
    
    if (Math.abs(preview.scrollTop - targetTop) > 5) {
      scrollingSource.current = "editor";
      preview.scrollTop = targetTop;
      
      if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = window.setTimeout(() => {
        scrollingSource.current = null;
      }, 100);
    }
  }, [loading]);

  const handlePreviewScroll = useCallback(() => {
    if (scrollingSource.current === "editor" || loading) return;
    const view = editorViewRef.current;
    const preview = previewRef.current;
    if (!view || !preview) return;

    const maxScroll = preview.scrollHeight - preview.clientHeight;
    if (maxScroll <= 0) return;

    const percentage = preview.scrollTop / maxScroll;
    const scrollInfo = view.scrollDOM;
    const targetTop = percentage * (scrollInfo.scrollHeight - scrollInfo.clientHeight);

    if (Math.abs(scrollInfo.scrollTop - targetTop) > 5) {
      scrollingSource.current = "preview";
      scrollInfo.scrollTop = targetTop;

      if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = window.setTimeout(() => {
        scrollingSource.current = null;
        forcePreviewSyncRef.current = false;
      }, 100);
    }
  }, [loading]);

  const fetchDoc = useCallback(async () => {
    try {
      const detail = await apiFetch<{ document: Document; tag_ids: string[]; tags?: Tag[] }>(`/documents/${id}?include=tags`);
      let initialContent = detail.document.content;

      if (typeof window !== "undefined") {
        const draft = window.localStorage.getItem(`mnote:draft:${id}`);
        if (draft) {
          try {
            const parsed = JSON.parse(draft) as { content?: string };
            if (parsed.content && parsed.content !== detail.document.content) {
              initialContent = parsed.content;
              setHasUnsavedChanges(true);
            }
          } catch {
            window.localStorage.removeItem(`mnote:draft:${id}`);
          }
        }
      }

      contentRef.current = initialContent;
      lastSavedContentRef.current = detail.document.content;
      setContent(initialContent);
      setPreviewContent(initialContent);
      
      const derivedTitle = extractTitleFromContent(initialContent);
      setTitle(derivedTitle);
      setSummary(detail.document.summary || "");
      setStarred(detail.document.starred || 0);
      const initialTagIDs = detail.tag_ids || [];
      setSelectedTagIDs(initialTagIDs);
      setAllTags(detail.tags || []);
      setLastSavedAt(detail.document.mtime);

      const text = initialContent || "";
      setCharCount(text.length);
      const words = text.trim().split(/\s+/).filter(w => w.length > 0);
      setWordCount(words.length);
      
    } catch (err) {
      console.error(err);
      toast({ description: err instanceof Error ? err : "Document not found", variant: "error" });
      router.push("/docs");
    } finally {
      setLoading(false);
    }
  }, [id, router, extractTitleFromContent, toast]);

  const fetchRecentDocs = useCallback(async () => {
    try {
      const docs = await apiFetch<Document[]>("/documents?limit=5&order=mtime");
      setQuickOpenRecent(docs || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchQuickOpenSearch = useCallback(async (query: string) => {
    setQuickOpenLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("q", query);
      params.set("limit", "5");
      const docs = await apiFetch<Document[]>(`/documents?${params.toString()}`);
      setQuickOpenResults(docs || []);
    } catch (e) {
      console.error(e);
      setQuickOpenResults([]);
    } finally {
      setQuickOpenLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!id) return;
    setTabs(prev => {
       const exists = prev.find(t => t.id === id);
       if (exists) {
          return prev.map(t => t.id === id ? { ...t, title: title || t.title } : t);
       }
       return [...prev, { id, title: title || "Untitled" }];
    });
  }, [id, title]);

  useEffect(() => {
    fetchDoc();
  }, [fetchDoc]);

  const searchTags = useCallback(
    async (query: string) => {
      const trimmed = normalizeTagName(query);
      if (!trimmed) {
        setTagResults([]);
        setTagSearchLoading(false);
        return;
      }
      setTagSearchLoading(true);
      lastTagQueryRef.current = trimmed;
      try {
        const params = new URLSearchParams();
        params.set("q", trimmed);
        params.set("limit", "5");
        params.set("offset", "0");
        const res = await apiFetch<Tag[]>(`/tags?${params.toString()}`);
        if (lastTagQueryRef.current !== trimmed) return;
        const next = res || [];
        setTagResults(next);
        mergeTags(next);
      } catch (e) {
        console.error(e);
        if (lastTagQueryRef.current === trimmed) {
          setTagResults([]);
        }
      } finally {
        if (lastTagQueryRef.current === trimmed) {
          setTagSearchLoading(false);
        }
      }
    },
    [mergeTags, normalizeTagName]
  );

  useEffect(() => {
    if (tagSearchTimerRef.current) {
      window.clearTimeout(tagSearchTimerRef.current);
    }
    if (!tagQuery) {
      setTagResults([]);
      setTagSearchLoading(false);
      return;
    }
    tagSearchTimerRef.current = window.setTimeout(() => {
      void searchTags(tagQuery);
    }, 200);
    return () => {
      if (tagSearchTimerRef.current) {
        window.clearTimeout(tagSearchTimerRef.current);
      }
    };
  }, [searchTags, tagQuery]);

  const updateCursorInfo = useCallback((view: EditorView) => {
    const state = view.state;
    const pos = state.selection.main.head;
    const line = state.doc.lineAt(pos);
    const lineNum = line.number;
    const colNum = pos - line.from + 1;

    startTransition(() => {
      setCursorPos({
        line: lineNum,
        col: colNum
      });
    });
  }, [startTransition]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = title ? `${title} - Micro Note` : "micro note";
  }, [title]);


  useEffect(() => {
    if (!activePopover) return;
    const updateAnchor = () => {
      const ref =
        activePopover === "color"
          ? colorButtonRef.current
          : activePopover === "size"
          ? sizeButtonRef.current
          : emojiButtonRef.current;
      if (!ref) return;
      const rect = ref.getBoundingClientRect();
      setPopoverAnchor({ top: rect.bottom + 8, left: rect.left });
    };
    updateAnchor();
    window.addEventListener("resize", updateAnchor);
    window.addEventListener("scroll", updateAnchor, true);
    return () => {
      window.removeEventListener("resize", updateAnchor);
      window.removeEventListener("scroll", updateAnchor, true);
    };
  }, [activePopover]);

  useEffect(() => {
    if (!activePopover) return;
    const handlePointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-popover-panel]") || target.closest("[data-popover-trigger]")) return;
      setActivePopover(null);
    };
    window.addEventListener("pointerdown", handlePointer);
    return () => window.removeEventListener("pointerdown", handlePointer);
  }, [activePopover]);

  const renderPopover = (content: React.ReactNode) => {
    if (!popoverAnchor || typeof document === "undefined") return null;
    return createPortal(
      <div
        data-popover-panel
        className="fixed z-[200]"
        style={{ top: popoverAnchor.top, left: popoverAnchor.left }}
      >
        {content}
      </div>,
      document.body
    );
  };

  useEffect(() => {
    const handleQuickOpen = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setQuickOpenQuery("");
        setShowQuickOpen(true);
      }
    };
    window.addEventListener("keydown", handleQuickOpen);
    return () => window.removeEventListener("keydown", handleQuickOpen);
  }, []);


  const schedulePreviewUpdate = useCallback(() => {
    if (previewTimerRef.current) {
      window.clearTimeout(previewTimerRef.current);
    }
    previewTimerRef.current = window.setTimeout(() => {
      const text = contentRef.current || "";
      const charCnt = text.length;
      const words = text.trim().split(/\s+/).filter(w => w.length > 0);
      const wordCnt = words.length;
      const changed = contentRef.current !== lastSavedContentRef.current;

      startTransition(() => {
        setPreviewContent(contentRef.current);
        setCharCount(charCnt);
        setWordCount(wordCnt);
        setHasUnsavedChanges(changed);
      });
    }, 300);
  }, [startTransition]);


  const insertTextAtCursor = useCallback(
    (text: string) => {
      const view = editorViewRef.current;
      if (!view) return;
      const { from, to } = view.state.selection.main;
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length },
      });
      contentRef.current = view.state.doc.toString();
      setContent(contentRef.current);
      setPreviewContent(contentRef.current);
      setHasUnsavedChanges(contentRef.current !== lastSavedContentRef.current);
      schedulePreviewUpdate();
      view.focus();
    },
    [schedulePreviewUpdate]
  );

  const applyContent = useCallback(
    (nextContent: string) => {
      const view = editorViewRef.current;
      if (view) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: nextContent },
          selection: { anchor: nextContent.length },
        });
        view.focus();
      }
      contentRef.current = nextContent;
      setContent(nextContent);
      setPreviewContent(nextContent);
      setHasUnsavedChanges(nextContent !== lastSavedContentRef.current);
      schedulePreviewUpdate();
    },
    [schedulePreviewUpdate]
  );

  const handleFormat = useCallback(
    (type: "wrap" | "line", prefix: string, suffix = "") => {
      const view = editorViewRef.current;
      if (!view) return;
      const { from, to } = view.state.selection.main;
      const doc = view.state.doc;

      if (type === "line") {
        const startLine = doc.lineAt(from);
        const endLine = doc.lineAt(to);
        let allHavePrefix = true;

        for (let i = startLine.number; i <= endLine.number; i++) {
          if (!doc.line(i).text.startsWith(prefix)) {
            allHavePrefix = false;
            break;
          }
        }

        const changes = [];
        for (let i = startLine.number; i <= endLine.number; i++) {
          const line = doc.line(i);
          if (allHavePrefix) {
            changes.push({ from: line.from, to: line.from + prefix.length, insert: "" });
          } else if (!line.text.startsWith(prefix)) {
            changes.push({ from: line.from, to: line.from, insert: prefix });
          }
        }
        view.dispatch({ changes });
      } else {
        const extendedFrom = from - prefix.length;
        const extendedTo = to + suffix.length;
        const rangeText = doc.sliceString(Math.max(0, extendedFrom), Math.min(doc.length, extendedTo));
        const isWrapped =
          rangeText.startsWith(prefix) && rangeText.endsWith(suffix) && extendedFrom >= 0;

        if (isWrapped) {
          view.dispatch({
            changes: {
              from: extendedFrom,
              to: extendedTo,
              insert: doc.sliceString(from, to),
            },
            selection: { anchor: extendedFrom, head: extendedFrom + (to - from) },
          });
        } else {
          const text = doc.sliceString(from, to);
          view.dispatch({
            changes: { from, to, insert: prefix + text + suffix },
            selection: {
              anchor: from + prefix.length,
              head: from + prefix.length + text.length,
            },
          });
        }
      }
      contentRef.current = view.state.doc.toString();
      setContent(contentRef.current);
      setPreviewContent(contentRef.current);
      setHasUnsavedChanges(contentRef.current !== lastSavedContentRef.current);
      schedulePreviewUpdate();
      view.focus();
    },
    [schedulePreviewUpdate]
  );

  const replacePlaceholder = useCallback(
    (placeholder: string, replacement: string) => {
      const view = editorViewRef.current;
      if (!view) {
        if (!contentRef.current.includes(placeholder)) return;
        contentRef.current = contentRef.current.replace(placeholder, replacement);
        schedulePreviewUpdate();
        return;
      }
      const contentText = view.state.doc.toString();
      const index = contentText.indexOf(placeholder);
      if (index === -1) return;
      view.dispatch({
        changes: { from: index, to: index + placeholder.length, insert: replacement },
      });
      contentRef.current = view.state.doc.toString();
      setContent(contentRef.current);
      setPreviewContent(contentRef.current);
      setHasUnsavedChanges(contentRef.current !== lastSavedContentRef.current);
      schedulePreviewUpdate();
    },
    [schedulePreviewUpdate]
  );

  const handlePaste = useCallback(
    async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items || items.length === 0) return;
      const fileItem = Array.from(items).find((item) => item.kind === "file");
      if (!fileItem) return;
      const file = fileItem.getAsFile();
      if (!file) return;

      event.preventDefault();
      const placeholder = `file_uploading_${randomString(8)}`;
      insertTextAtCursor(placeholder);
      try {
        const result = await uploadFile(file);
        let contentType = result.content_type || file.type || "";
        const name = result.name || file.name || "file";
        const ext = name.split(".").pop()?.toLowerCase();

        if (contentType === "application/octet-stream" || !contentType) {
          const audioExts = ["aac", "mp3", "wav", "ogg", "flac", "m4a", "opus"];
          const videoExts = ["mp4", "webm", "ogv", "mov", "mkv"];
          if (ext && audioExts.includes(ext)) contentType = "audio/" + ext;
          if (ext && videoExts.includes(ext)) contentType = "video/" + ext;
        }

        let markdown = `[FILE:${name}](${result.url})`;
        
        if (contentType.startsWith("image/")) {
          markdown = `![PIC:${name}](${result.url})`;
        } else if (contentType.startsWith("video/")) {
          markdown = `![VIDEO:${name}](${result.url})`;
        } else if (contentType.startsWith("audio/")) {
          markdown = `![AUDIO:${name}](${result.url})`;
        }
        
        replacePlaceholder(placeholder, markdown);
      } catch (err) {
        console.error(err);
        replacePlaceholder(placeholder, "");
        toast({ description: err instanceof Error ? err : "Upload failed", variant: "error" });
      }
    },
    [insertTextAtCursor, randomString, replacePlaceholder, toast]
  );

  const handleUndo = useCallback(() => {
    setActivePopover(null);
    const view = editorViewRef.current;
    if (view) {
      undo(view);
      view.focus();
    }
  }, []);

  const handleRedo = useCallback(() => {
    setActivePopover(null);
    const view = editorViewRef.current;
    if (view) {
      redo(view);
      view.focus();
    }
  }, []);

  const handleInsertTable = useCallback(() => {
    setActivePopover(null);
    const tableTemplate = `
| Header 1 | Header 2 |
| -------- | -------- |
| Cell 1   | Cell 2   |
`;
    insertTextAtCursor(tableTemplate);
  }, [insertTextAtCursor]);

  const resetAiState = useCallback(() => {
    setAiError(null);
    setAiResultText("");
    setAiExistingTags([]);
    setAiSuggestedTags([]);
    setAiSelectedTags([]);
    setAiRemovedTagIDs([]);
  }, []);

  const closeAiModal = useCallback(() => {
    setAiModalOpen(false);
    setAiAction(null);
    setAiLoading(false);
    setAiPrompt("");
    setAiOriginalText("");
    resetAiState();
  }, [resetAiState]);

  const handleAiPolish = useCallback(async () => {
    const snapshot = contentRef.current;
    if (!snapshot.trim()) {
      toast({ description: "Please add some content before polishing." });
      return;
    }
    setAiAction("polish");
    setAiModalOpen(true);
    setAiLoading(true);
    setAiOriginalText(snapshot);
    resetAiState();
    try {
      const res = await apiFetch<{ text: string }>("/ai/polish", {
        method: "POST",
        body: JSON.stringify({ text: snapshot }),
      });
      setAiResultText(res?.text || "");
    } catch (err) {
      console.error(err);
      setAiError(err instanceof Error ? err.message : "AI request failed");
    } finally {
      setAiLoading(false);
    }
  }, [resetAiState, toast]);

  const handleAiGenerateOpen = useCallback(() => {
    setAiAction("generate");
    setAiModalOpen(true);
    setAiPrompt("");
    setAiOriginalText("");
    resetAiState();
  }, [resetAiState]);

  const handleAiGenerate = useCallback(async () => {
    const prompt = aiPrompt.trim();
    if (!prompt) {
      setAiError("Please enter a brief description.");
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await apiFetch<{ text: string }>("/ai/generate", {
        method: "POST",
        body: JSON.stringify({ prompt }),
      });
      setAiResultText(res?.text || "");
    } catch (err) {
      console.error(err);
      setAiError(err instanceof Error ? err.message : "AI request failed");
    } finally {
      setAiLoading(false);
    }
  }, [aiPrompt]);

  const handleAiSummary = useCallback(async () => {
    const snapshot = contentRef.current;
    if (!snapshot.trim()) {
      toast({ description: "Please add some content before summarizing." });
      return;
    }
    setAiAction("summary");
    setAiModalOpen(true);
    setAiLoading(true);
    setAiOriginalText(snapshot);
    resetAiState();
    try {
      const res = await apiFetch<{ summary: string }>("/ai/summary", {
        method: "POST",
        body: JSON.stringify({ text: snapshot }),
      });
      setAiResultText(res?.summary || "");
    } catch (err) {
      console.error(err);
      setAiError(err instanceof Error ? err.message : "AI request failed");
    } finally {
      setAiLoading(false);
    }
  }, [resetAiState, toast]);

  const handleAiTags = useCallback(async () => {
    const snapshot = contentRef.current;
    if (!snapshot.trim()) {
      toast({ description: "Please add some content before extracting tags." });
      return;
    }
    setAiAction("tags");
    setAiModalOpen(true);
    setAiLoading(true);
    setAiOriginalText(snapshot);
    resetAiState();
    try {
      const res = await apiFetch<{ tags: string[]; existing_tags: Tag[] }>("/ai/tags", {
        method: "POST",
        body: JSON.stringify({ document_id: id, text: snapshot, max_tags: MAX_TAGS }),
      });
      const existingTags = res?.existing_tags || [];
      setAiExistingTags(existingTags);
      setAiRemovedTagIDs([]);
      const selectedNames = new Set(
        existingTags
          .map((tag) => tag.name)
          .filter((name): name is string => Boolean(name))
      );
      const cleaned = (res?.tags || [])
        .map((tag) => normalizeTagName(tag))
        .filter((tag) => isValidTagName(tag))
        .filter((tag, index, arr) => arr.indexOf(tag) === index)
        .filter((tag) => !selectedNames.has(tag));

      setAiSuggestedTags(cleaned);
      const availableSlots = Math.max(0, MAX_TAGS - existingTags.length);
      setAiSelectedTags(cleaned.slice(0, availableSlots));
    } catch (err) {
      console.error(err);
      setAiError(err instanceof Error ? err.message : "AI request failed");
    } finally {
      setAiLoading(false);
    }
  }, [id, isValidTagName, normalizeTagName, resetAiState, toast]);

  const findExistingTagByName = useCallback(
    async (name: string) => {
      const trimmed = normalizeTagName(name);
      if (!trimmed) return null;
      const cached = allTags.find((tag) => tag.name === trimmed);
      if (cached) return cached;
      try {
        const params = new URLSearchParams();
        params.set("q", trimmed);
        params.set("limit", "5");
        params.set("offset", "0");
        const res = await apiFetch<Tag[]>(`/tags?${params.toString()}`);
        const exact = (res || []).find((tag) => tag.name === trimmed) || null;
        if (exact) {
          mergeTags([exact]);
        }
        return exact;
      } catch (e) {
        console.error(e);
        return null;
      }
    },
    [allTags, mergeTags, normalizeTagName]
  );

  useEffect(() => {
    if (trimmedTagQuery) {
      setTagDropdownIndex(0);
    }
  }, [trimmedTagQuery, tagResults]);

  const clearTagQuery = useCallback(() => {
    setTagQuery("");
    setTagResults([]);
    setTagDropdownIndex(0);
  }, []);

  const saveTagIDs = useCallback(
    async (nextTagIDs: string[]) => {
      const previous = selectedTagIDs;
      setSelectedTagIDs(nextTagIDs);
      try {
        await apiFetch(`/documents/${id}/tags`, {
          method: "PUT",
          body: JSON.stringify({ tag_ids: nextTagIDs }),
        });
        setLastSavedAt(Math.floor(Date.now() / 1000));
      } catch (err) {
        console.error(err);
        toast({ description: err instanceof Error ? err : "Failed to save tags", variant: "error" });
        setSelectedTagIDs(previous);
      }
  },
    [id, selectedTagIDs, toast]
  );

  const selectTagById = useCallback(
    (tagId: string) => {
      if (selectedTagIDs.includes(tagId)) {
        clearTagQuery();
        return;
      }
      if (selectedTagIDs.length >= MAX_TAGS) {
        toast({ description: `You can only select up to ${MAX_TAGS} tags.` });
        return;
      }
      void saveTagIDs([...selectedTagIDs, tagId]);
      clearTagQuery();
  },
    [clearTagQuery, saveTagIDs, selectedTagIDs, toast]
  );

  const handleAddTag = useCallback(async () => {
    const trimmed = normalizeTagName(tagQuery);
    if (!trimmed) return;

    if (!isValidTagName(trimmed)) {
      toast({ description: "Tags must be letters, numbers, or Chinese characters, and at most 16 characters." });
      return;
    }

    try {
      let existing = tagSuggestions.find((tag) => tag.name === trimmed) || allTags.find((tag) => tag.name === trimmed) || null;
      if (!existing) {
        existing = await findExistingTagByName(trimmed);
      }

      if (existing) {
          if (!selectedTagIDs.includes(existing.id)) {
            if (selectedTagIDs.length >= MAX_TAGS) {
            toast({ description: `You can only select up to ${MAX_TAGS} tags.` });
              return;
            }
            await saveTagIDs([...selectedTagIDs, existing.id]);
          }
          clearTagQuery();
          return;
        }

      if (selectedTagIDs.length >= MAX_TAGS) {
        toast({ description: `You can only select up to ${MAX_TAGS} tags.` });
        return;
      }

      const created = await apiFetch<Tag>("/tags", {
        method: "POST",
        body: JSON.stringify({ name: trimmed }),
      });
      mergeTags([created]);
      await saveTagIDs([...selectedTagIDs, created.id]);
      clearTagQuery();
    } catch (err) {
      console.error(err);
        toast({ description: err instanceof Error ? err : "Failed to add tag", variant: "error" });
    }
  }, [allTags, clearTagQuery, findExistingTagByName, isValidTagName, mergeTags, normalizeTagName, saveTagIDs, selectedTagIDs, tagQuery, tagSuggestions, toast]);

  const handleTagDropdownSelect = useCallback(
    (item: { type: "use" | "create" | "suggestion"; tag?: Tag }) => {
      if (item.type === "create") {
        void handleAddTag();
        return;
      }
      if (item.tag) {
        selectTagById(item.tag.id);
      }
    },
    [handleAddTag, selectTagById]
  );

  const handleTagInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!trimmedTagQuery || tagSearchLoading) {
        if (e.key === "Enter") {
          handleAddTag();
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (tagDropdownItems.length === 0) return;
        setTagDropdownIndex((prev) => (prev + 1) % tagDropdownItems.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (tagDropdownItems.length === 0) return;
        setTagDropdownIndex((prev) => (prev - 1 + tagDropdownItems.length) % tagDropdownItems.length);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        clearTagQuery();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (tagDropdownItems.length > 0) {
          handleTagDropdownSelect(tagDropdownItems[tagDropdownIndex]);
          return;
        }
        handleAddTag();
      }
    },
    [clearTagQuery, handleAddTag, handleTagDropdownSelect, tagDropdownIndex, tagDropdownItems, tagSearchLoading, trimmedTagQuery]
  );

  const toggleAiTag = useCallback(
    (name: string) => {
      if (aiExistingTagNames.has(name)) return;
      if (aiSelectedTags.includes(name)) {
        setAiSelectedTags(aiSelectedTags.filter((tag) => tag !== name));
        return;
      }
      const existingCount = aiExistingTags.length - aiRemovedTagIDs.length;
      if (existingCount + aiSelectedTags.length >= MAX_TAGS) {
        toast({ description: `You can only select up to ${MAX_TAGS} tags.` });
        return;
      }
      setAiSelectedTags([...aiSelectedTags, name]);
  },
    [aiExistingTagNames, aiExistingTags.length, aiRemovedTagIDs.length, aiSelectedTags, toast]
  );

  const toggleExistingTag = useCallback(
    (tagID: string) => {
      if (aiRemovedTagIDs.includes(tagID)) {
        setAiRemovedTagIDs(aiRemovedTagIDs.filter((id) => id !== tagID));
        return;
      }
      setAiRemovedTagIDs([...aiRemovedTagIDs, tagID]);
    },
    [aiRemovedTagIDs]
  );

  const handleApplyAiText = useCallback(() => {
    if (!aiResultText) {
      closeAiModal();
      return;
    }
    applyContent(aiResultText);
    closeAiModal();
  }, [aiResultText, applyContent, closeAiModal]);

  const handleApplyAiSummary = useCallback(async () => {
    if (!aiResultText) {
      closeAiModal();
      return;
    }
    setAiLoading(true);
    try {
      await apiFetch(`/documents/${id}/summary`, {
        method: "PUT",
        body: JSON.stringify({ summary: aiResultText }),
      });
      setSummary(aiResultText);
      setLastSavedAt(Math.floor(Date.now() / 1000));
      closeAiModal();
    } catch (err) {
      console.error(err);
      toast({ description: err instanceof Error ? err : "Failed to apply summary", variant: "error" });
    } finally {
      setAiLoading(false);
    }
  }, [aiResultText, closeAiModal, id, toast]);

  const handleApplyAiTags = useCallback(async () => {
    if (aiSelectedTags.length === 0 && aiRemovedTagIDs.length === 0) {
      closeAiModal();
      return;
    }
    const keptExisting = aiExistingTags
      .filter((tag) => !aiRemovedTagIDs.includes(tag.id))
      .map((tag) => tag.id);
    setAiLoading(true);
    try {
      const nextTagIDs = [...keptExisting];
      const matches = await Promise.all(aiSelectedTags.map((name) => findExistingTagByName(name)));
      const toCreate: string[] = [];
      matches.forEach((tag, index) => {
        if (tag) {
          if (!nextTagIDs.includes(tag.id)) {
            nextTagIDs.push(tag.id);
          }
          return;
        }
        toCreate.push(aiSelectedTags[index]);
      });
      let created: Tag[] = [];
      if (toCreate.length > 0) {
        created = await apiFetch<Tag[]>("/tags/batch", {
          method: "POST",
          body: JSON.stringify({ names: toCreate }),
        });
        created.forEach((tag) => {
          if (!nextTagIDs.includes(tag.id)) {
            nextTagIDs.push(tag.id);
          }
        });
      }
      mergeTags([...(matches.filter(Boolean) as Tag[]), ...created]);
      const finalTagIDs = [...nextTagIDs];
      if (finalTagIDs.length > MAX_TAGS) {
        toast({ description: `You can only select up to ${MAX_TAGS} tags.` });
        return;
      }
      await saveTagIDs(finalTagIDs);
      closeAiModal();
    } catch (err) {
      console.error(err);
      toast({ description: err instanceof Error ? err : "Failed to apply tags", variant: "error" });
    } finally {
      setAiLoading(false);
    }
  }, [aiExistingTags, aiRemovedTagIDs, aiSelectedTags, closeAiModal, findExistingTagByName, mergeTags, saveTagIDs, toast]);

  const handleSlashAction = useCallback((action: (ctx: SlashActionContext) => void) => {
    const view = editorViewRef.current;
    if (!view) return;
    
    const { from } = view.state.selection.main;
    const line = view.state.doc.lineAt(from);
    const lineText = line.text;
    const relativePos = from - line.from;
    const lastSlashIndex = lineText.lastIndexOf("/", relativePos - 1);
    
    if (lastSlashIndex !== -1) {
       view.dispatch({
          changes: { from: line.from + lastSlashIndex, to: from, insert: "" }
       });
    }
    
    action({ handleFormat, handleInsertTable, insertTextAtCursor });
    setSlashMenu(prev => ({ ...prev, open: false }));
  }, [handleFormat, handleInsertTable, insertTextAtCursor]);

  const handleColor = useCallback((color: string) => {
    setActivePopover(null);
    if (!color) return;
    handleFormat("wrap", `<span style="color: ${color}">`, "</span>");
  }, [handleFormat]);

  const handleSize = useCallback((size: string) => {
    setActivePopover(null);
    if (!size) return;
    handleFormat("wrap", `<span style="font-size: ${size}">`, "</span>");
  }, [handleFormat]);

  // preview scroll handled via MarkdownPreview onScroll

  const handleStarToggle = useCallback(async () => {
    const next = starred ? 0 : 1;
    setStarred(next);
    try {
      await apiFetch(`/documents/${id}/star`, {
        method: "PUT",
        body: JSON.stringify({ starred: next === 1 }),
      });
    } catch (e) {
      console.error(e);
      setStarred(starred);
    }
  }, [id, starred]);

  // TOC Visibility Effect
  useEffect(() => {
    const hasToken = /\[(toc|TOC)]/.test(previewContent);
    if (!tocContent || !hasToken) {
      setShowFloatingToc(false);
      return;
    }

    const container = previewRef.current;
    if (!container) return;

    let timer: number | null = null;
    let ticking = false;

    const updateVisibility = () => {
      ticking = false;
      const tocEl = container.querySelector(".toc-wrapper") as HTMLElement | null;
      if (!tocEl) {
        setShowFloatingToc(true);
        return;
      }
      const isScrollable = container.scrollHeight > container.clientHeight + 1;
      if (isScrollable) {
        const top = tocEl.offsetTop;
        const bottom = top + tocEl.offsetHeight;
        const viewTop = container.scrollTop;
        const viewBottom = viewTop + container.clientHeight;
        const inView = bottom > viewTop && top < viewBottom;
        setShowFloatingToc(!inView);
        return;
      }
      const rect = tocEl.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const inView = rect.bottom > 0 && rect.top < viewportHeight;
      setShowFloatingToc(!inView);
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(updateVisibility);
    };

    timer = window.setTimeout(updateVisibility, 120);
    container.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      container.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (timer) window.clearTimeout(timer);
    };
  }, [tocContent, previewContent]);

  const handleAutoSave = useCallback(async () => {
    const latestContent = contentRef.current;
    if (latestContent === lastSavedContentRef.current || saving) return;

    const derivedTitle = extractTitleFromContent(latestContent);
    if (!derivedTitle) return;

    try {
      await apiFetch(`/documents/${id}`, {
        method: "PUT",
        body: JSON.stringify({ title: derivedTitle, content: latestContent }),
      });
      lastSavedContentRef.current = latestContent;
      setTitle(derivedTitle);
      setLastSavedAt(Math.floor(Date.now() / 1000));
      setHasUnsavedChanges(false);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(`mnote:draft:${id}`);
      }
    } catch (err) {
      console.error("Autosave error", err);
    }
  }, [extractTitleFromContent, id, saving]);

  useEffect(() => {
    const interval = setInterval(() => {
      handleAutoSave();
    }, 10000);
    return () => clearInterval(interval);
  }, [handleAutoSave]);

  const handleSave = useCallback(async () => {
    const latestContent = contentRef.current;
    const derivedTitle = extractTitleFromContent(latestContent);
    if (!derivedTitle) {
      toast({ description: "Please add a title using markdown heading (Title + ===)." });
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/documents/${id}`, {
        method: "PUT",
        body: JSON.stringify({ title: derivedTitle, content: latestContent }),
      });
      lastSavedContentRef.current = latestContent;
      setTitle(derivedTitle);
      setLastSavedAt(Math.floor(Date.now() / 1000));
      setHasUnsavedChanges(false);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(`mnote:draft:${id}`);
      }
    } catch (err) {
      console.error(err);
      toast({ description: err instanceof Error ? err : "Failed to save", variant: "error" });
    } finally {
      setSaving(false);
    }
  }, [extractTitleFromContent, id, toast]);

  const handleDelete = async () => {
    try {
      await apiFetch(`/documents/${id}`, { method: "DELETE" });
      router.push("/docs");
    } catch (err) {
      console.error(err);
      toast({ description: err instanceof Error ? err : "Failed to delete", variant: "error" });
    }
  };

  const handleExport = () => {
    const blob = new Blob([contentRef.current], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "untitled"}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const loadVersions = async () => {
    try {
      const v = await apiFetch<DocumentVersionSummary[]>(`/documents/${id}/versions`);
      setVersions(v);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRevert = (v: DocumentVersionSummary) => {
    router.push(`/docs/${id}/revert?version=${v.version}`);
  };

  const toggleTag = (tagID: string) => {
    if (selectedTagIDs.includes(tagID)) {
      void saveTagIDs(selectedTagIDs.filter((id) => id !== tagID));
      return;
    }
    if (selectedTagIDs.length >= MAX_TAGS) {
      toast({ description: `You can only select up to ${MAX_TAGS} tags.` });
      return;
    }
    void saveTagIDs([...selectedTagIDs, tagID]);
  };


  const handleShare = async () => {
    try {
      const res = await apiFetch<Share>(`/documents/${id}/share`, { method: "POST" });
      setActiveShare(res);
      const url = `${window.location.origin}/share/${res.token}`;
      setShareUrl(url);
    } catch (err) {
      console.error(err);
      toast({ description: err instanceof Error ? err : "Failed to create share link", variant: "error" });
    }
  };

  const loadShare = useCallback(async () => {
    try {
      const res = await apiFetch<{ share: Share | null }>(`/documents/${id}/share`);
      if (res.share) {
        setActiveShare(res.share);
        setShareUrl(`${window.location.origin}/share/${res.share.token}`);
      } else {
        setActiveShare(null);
        setShareUrl("");
      }
    } catch (err) {
      console.error(err);
      setActiveShare(null);
      setShareUrl("");
    }
  }, [id]);

  const handleRevokeShare = async () => {
    try {
      await apiFetch(`/documents/${id}/share`, { method: "DELETE" });
      setActiveShare(null);
      setShareUrl("");
    } catch (err) {
      console.error(err);
      toast({ description: err instanceof Error ? err : "Failed to revoke share link", variant: "error" });
    }
  };

  const handleCopyLink = useCallback(() => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareUrl]);

  const handleOpenQuickOpen = useCallback(() => {
    setQuickOpenQuery("");
    setQuickOpenIndex(0);
    setShowQuickOpen(true);
  }, []);

  const handleCloseQuickOpen = useCallback(() => {
    setShowQuickOpen(false);
    setQuickOpenQuery("");
    setQuickOpenIndex(0);
  }, []);

  const showSearchResults = quickOpenQuery.trim().length > 0;
  const quickOpenDocs = showSearchResults ? quickOpenResults : quickOpenRecent;

  const handleQuickOpenSelect = useCallback((doc: Document) => {
    router.push(`/docs/${doc.id}`);
    handleCloseQuickOpen();
  }, [handleCloseQuickOpen, router]);

  useEffect(() => {
    if (!showQuickOpen) return;
    if (!quickOpenQuery.trim()) {
      setQuickOpenResults([]);
      setQuickOpenIndex(0);
      void fetchRecentDocs();
      return;
    }
    const timer = window.setTimeout(() => {
      setQuickOpenIndex(0);
      void fetchQuickOpenSearch(quickOpenQuery.trim());
    }, 200);
    return () => window.clearTimeout(timer);
  }, [fetchQuickOpenSearch, fetchRecentDocs, quickOpenQuery, showQuickOpen]);

  useEffect(() => {
    if (!showQuickOpen) return;
    if (quickOpenIndex >= quickOpenDocs.length) {
      setQuickOpenIndex(0);
    }
  }, [quickOpenDocs.length, quickOpenIndex, showQuickOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave]);

  useEffect(() => {
    return () => {
      // no-op cleanup
    };
  }, []);

  useEffect(() => {
    return () => {
      const view = editorViewRef.current;
      if (view && pasteHandlerRef.current) {
        view.dom.removeEventListener("paste", pasteHandlerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (draftTimerRef.current) {
      window.clearTimeout(draftTimerRef.current);
    }
    draftTimerRef.current = window.setTimeout(() => {
      if (!hasUnsavedChanges) {
        window.localStorage.removeItem(`mnote:draft:${id}`);
        return;
      }
      const payload = JSON.stringify({ content: contentRef.current, updatedAt: Date.now() });
      window.localStorage.setItem(`mnote:draft:${id}`, payload);
    }, 400);
    return () => {
      if (draftTimerRef.current) {
        window.clearTimeout(draftTimerRef.current);
      }
    };
  }, [hasUnsavedChanges, id]);

  useEffect(() => {
    return () => {
      if (previewTimerRef.current) {
        window.clearTimeout(previewTimerRef.current);
      }
      if (typeof window !== "undefined" && hasUnsavedChanges) {
        const payload = JSON.stringify({ content: contentRef.current, updatedAt: Date.now() });
        window.localStorage.setItem(`mnote:draft:${id}`, payload);
      }
    };
  }, [hasUnsavedChanges, id]);

  const aiTitle =
    aiAction === "polish"
      ? "AI Polish"
      : aiAction === "generate"
      ? "AI Generate"
      : aiAction === "summary"
      ? "AI Summary"
      : "AI Tags";
  const aiExistingCount = Math.max(0, aiExistingTags.length - aiRemovedTagIDs.length);
  const aiAvailableSlots = Math.max(0, MAX_TAGS - aiExistingCount);

  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;


  return (
    <div className="flex flex-col h-screen bg-background relative">
      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.2); }
        
        .cm-editor { font-family: 'JetBrains Mono', 'Fira Code', monospace !important; }
        
        .prose h1, .prose h2, .prose h3 { margin-top: 1.5em; margin-bottom: 0.5em; }
        .prose p { margin-bottom: 1em; line-height: 1.7; }
      `}</style>
      <Header 
        router={router}
        title={title}
        handleSave={handleSave}
        saving={saving}
        hasUnsavedChanges={hasUnsavedChanges}
        lastSavedAt={lastSavedAt}
        showDetails={showDetails}
        setShowDetails={setShowDetails}
        loadVersions={loadVersions}
        starred={starred}
        handleStarToggle={handleStarToggle}
      />

      <div className="flex-1 flex overflow-hidden min-w-0 relative pb-8">
        <div className={`flex-1 flex flex-col md:flex-row h-full transition-all duration-300 min-w-0 ${showDetails ? "mr-80" : ""}`}>
          
               <div className="h-full border-r border-border overflow-hidden min-w-0 md:flex-[0_0_50%] w-full flex flex-col relative">
                 <div className="flex items-center bg-muted/30 border-b border-border shrink-0 px-1 pt-1 h-9">
                    <div className="flex-1 flex items-end h-full gap-0.5 overflow-x-auto no-scrollbar">
                       {tabs.map(tab => (
                          <div 
                             key={tab.id}
                             onClick={() => { if (tab.id !== id) router.push(`/docs/${tab.id}`); }}
                             className={`group flex items-center gap-2 px-3 h-full text-xs font-bold uppercase tracking-wider rounded-t-md border-x border-t transition-all cursor-pointer select-none shrink-0 ${tab.id === id ? "bg-background border-border text-foreground translate-y-[1px] z-10" : "bg-transparent border-transparent text-muted-foreground hover:bg-muted/50"}`}
                          >
                             <span className="truncate max-w-none">{tab.title || "Untitled"}</span>
                             {tabs.length > 1 && (
                                <button 
                                   onClick={(e) => {
                                      e.stopPropagation();
                                      const nextTabs = tabs.filter(t => t.id !== tab.id);
                                      setTabs(nextTabs);
                                      if (tab.id === id && nextTabs.length > 0) router.push(`/docs/${nextTabs[0].id}`);
                                   }}
                                   className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity p-0.5"
                                >
                                   <X className="h-3 w-3" />
                                </button>
                             )}
                          </div>
                       ))}
                    </div>
                    <button 
                       onClick={handleOpenQuickOpen}
                       className="px-2 h-7 mb-1 text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 shrink-0 bg-background/50 rounded-md ml-1 border border-border shadow-sm"
                       title="Quick Open (Cmd+K)"
                    >
                       <Command className="h-3 w-3" />
                       <span className="text-[9px] font-bold">OPEN</span>
                    </button>
                 </div>
                 
                  <Toolbar 
                     handleUndo={handleUndo}
                     handleRedo={handleRedo}
                     handleFormat={handleFormat}
                     handleInsertTable={handleInsertTable}
                     handleAiPolish={handleAiPolish}
                     handleAiGenerateOpen={handleAiGenerateOpen}
                     handleAiTags={handleAiTags}
                     aiBusy={aiLoading}
                     activePopover={activePopover}
                     setActivePopover={setActivePopover}
                     colorButtonRef={colorButtonRef}
                     sizeButtonRef={sizeButtonRef}
                     emojiButtonRef={emojiButtonRef}
                  />

                 <div className="flex-1 overflow-hidden min-h-0">

                    <CodeMirror
                      value={content}
                      height="100%"
                   extensions={[
                      markdown(), 
                      EditorView.lineWrapping, 
                      EditorView.updateListener.of((update) => {

                        if (update.selectionSet || update.docChanged) {
                          updateCursorInfo(update.view);
                          
                          if (update.docChanged) {
                            const state = update.view.state;
                            const pos = state.selection.main.head;
                            const line = state.doc.lineAt(pos);
                            const lineText = line.text;
                            const relativePos = pos - line.from;
                            
                            const lastSlashIndex = lineText.lastIndexOf("/", relativePos - 1);
                             if (lastSlashIndex !== -1 && (lastSlashIndex === 0 || lineText[lastSlashIndex - 1] === " ")) {
                                const filter = lineText.slice(lastSlashIndex + 1, relativePos);
                                if (!filter.includes(" ")) {
                                   const coords = update.view.coordsAtPos(pos);
                                   if (coords) {
                                      startTransition(() => {
                                        setSlashMenu({
                                           open: true,
                                           x: coords.left,
                                           y: coords.bottom + 5,
                                           filter: filter
                                        });
                                      });
                                      return;
                                   }
                                }
                             }
                             startTransition(() => {
                                setSlashMenu(prev => prev.open ? { ...prev, open: false } : prev);
                             });
                         }
                       }
                     }),
                     placeholder("start by entering a title here\n===\n\nhere is the body of note.")
                   ]}
                    onChange={(val) => {
                      contentRef.current = val;
                      setContent(val);
                      schedulePreviewUpdate();
                    }}
                    className={`h-full w-full min-w-0 text-base`}
                    onCreateEditor={(view) => {
                      editorViewRef.current = view;
                      view.scrollDOM.addEventListener("scroll", handleEditorScroll);
                      if (pasteHandlerRef.current) {
                        view.dom.removeEventListener("paste", pasteHandlerRef.current);
                      }
                      const handler = (event: ClipboardEvent) => {
                        void handlePaste(event);
                      };
                      pasteHandlerRef.current = handler;
                      view.dom.addEventListener("paste", handler);
                    }}
                    basicSetup={{
                      lineNumbers: true,
                      foldGutter: true,
                      highlightActiveLine: false,
                    }}
                  />

                  
                 {slashMenu.open && (

                    <div 
                      className="fixed z-[60] bg-popover border border-border rounded-lg shadow-2xl p-1 w-48 animate-in fade-in zoom-in-95 duration-200"
                      style={{ left: slashMenu.x, top: slashMenu.y }}
                    >
                       <div className="text-[10px] font-bold text-muted-foreground px-2 py-1 uppercase tracking-widest border-b border-border mb-1">Commands</div>
                       <div className="max-h-64 overflow-y-auto no-scrollbar">
                          {SLASH_COMMANDS
                            .filter(cmd => cmd.label.toLowerCase().includes(slashMenu.filter.toLowerCase()))
                            .map(cmd => (
                             <button
                                key={cmd.id}
                                onClick={() => handleSlashAction(cmd.action)}
                                className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded-md hover:bg-accent hover:text-accent-foreground text-left transition-colors"
                             >
                                <span className="opacity-70">{cmd.icon}</span>
                                <span className="font-medium">{cmd.label}</span>
                             </button>
                          ))}
                          {SLASH_COMMANDS.filter(cmd => cmd.label.toLowerCase().includes(slashMenu.filter.toLowerCase())).length === 0 && (
                             <div className="px-2 py-2 text-xs text-muted-foreground italic">No commands found</div>
                          )}
                       </div>
                    </div>
                 )}

              </div>
             </div>

               <div className="h-full bg-background overflow-hidden min-w-0 md:flex-[0_0_50%] w-full hidden md:block">
                   <MarkdownPreview 
                      content={previewContent} 
                      className="h-full overflow-auto" 
                      ref={previewRef}
                      onScroll={handlePreviewScroll}
                       onTocLoaded={handleTocLoaded}
                   />
               </div>

        </div>

         {showDetails && (
            <div className="w-80 border-l border-border bg-background flex flex-col absolute right-0 top-0 bottom-0 z-[100] shadow-xl">
              <div className="flex items-center justify-between p-3 border-b border-border">
                 <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-1">Details</span>
                 <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowDetails(false)}>
                    <X className="h-4 w-4" />
                 </Button>
              </div>
              <div className="flex items-center border-b border-border bg-muted/20">

                <button 
                  className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeTab === "tags" ? "border-b-2 border-foreground" : "text-muted-foreground"}`}
                  onClick={() => setActiveTab("tags")}
                >
                  Tags
                </button>
                <button 
                  className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeTab === "summary" ? "border-b-2 border-foreground" : "text-muted-foreground"}`}
                  onClick={() => setActiveTab("summary")}
                >
                  Summary
                </button>
                <button 
                  className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeTab === "history" ? "border-b-2 border-foreground" : "text-muted-foreground"}`}
                  onClick={() => { setActiveTab("history"); loadVersions(); }}
                >
                  History
                </button>
                <button 
                  className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeTab === "share" ? "border-b-2 border-foreground" : "text-muted-foreground"}`}
                  onClick={() => { setActiveTab("share"); loadShare(); }}
                >
                  Share
                </button>
             </div>

             <div className="flex-1 overflow-y-auto p-4">
               {activeTab === "tags" && (
                  <div className="space-y-4">
                    <div className="flex gap-2">
                       <Input 
                         placeholder="Search tag..." 
                         value={tagQuery} 
                         maxLength={16}
                         onChange={(e) => {
                           const raw = e.target.value;
                           if (isComposingRef.current) {
                             setTagQuery(raw);
                             return;
                           }
                           const filtered = raw.replace(/[^\p{Script=Han}A-Za-z0-9]/gu, "");
                           setTagQuery(filtered);
                          }}
                          onCompositionStart={() => {
 
                           isComposingRef.current = true;
                         }}
                          onCompositionEnd={(e) => {
                            isComposingRef.current = false;
                            const raw = e.currentTarget.value;
                            const filtered = raw.replace(/[^\p{Script=Han}A-Za-z0-9]/gu, "");
                            setTagQuery(filtered.slice(0, 16));
                          }}
                          onKeyDown={handleTagInputKeyDown}
                        />
                    </div>
                    {trimmedTagQuery && (
                      <div className="border border-border rounded-xl overflow-hidden bg-background">
                        {tagSearchLoading ? (
                          <div className="px-3 py-2 text-xs text-muted-foreground">Searching...</div>
                        ) : tagDropdownItems.length > 0 ? (
                          <>
                            {tagDropdownItems.map((item, index) => (
                              <button
                                key={item.key}
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 ${index === tagDropdownIndex ? "bg-muted/40" : ""}`}
                                onClick={() => handleTagDropdownSelect(item)}
                              >
                                {item.type === "create"
                                  ? `Create #${trimmedTagQuery}`
                                  : item.type === "use"
                                  ? `Use existing #${trimmedTagQuery}`
                                  : `#${item.tag?.name || ""}`}
                              </button>
                            ))}
                          </>
                        ) : (
                          <div className="px-3 py-2 text-xs text-muted-foreground">No matching tags</div>
                        )}
                      </div>
                    )}
                     <div className="flex flex-wrap gap-2">
                      {selectedTags.length === 0 ? (
                         <div className="text-sm text-muted-foreground">No tags yet</div>
                       ) : (
                         selectedTags.map((tag) => (
                           <div
                             key={tag.id}
                             className={`inline-flex items-center gap-1 px-2 py-1 text-sm border rounded-full transition-colors cursor-pointer select-none ${
                               selectedTagIDs.includes(tag.id)
                                 ? "bg-primary text-primary-foreground border-primary"
                                 : "bg-secondary text-secondary-foreground border-input hover:bg-muted"
                             }`}
                             onClick={() => toggleTag(tag.id)}
                           >
                             <span>
                               #{tag.name}
                             </span>
                           </div>
                         ))
                       )}
                     </div>
                    
                    <div className="pt-4 mt-4 border-t border-border">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full text-xs rounded-xl" 
                          onClick={() => router.push(`/tags?return=${encodeURIComponent(`/docs/${id}`)}`)}
                        >
                          Manage Tags
                        </Button>
                    </div>
                  </div>
                )}

                {activeTab === "summary" && (
                  <div className="space-y-4">
                    <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">AI Summary</div>
                    {summary ? (
                      <div className="text-sm leading-relaxed whitespace-pre-wrap border border-border rounded-xl p-3 bg-muted/20">
                        {summary}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">No summary yet</div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs rounded-xl"
                      onClick={handleAiSummary}
                      disabled={aiLoading}
                    >
                      Generate Summary
                    </Button>
                  </div>
                )}

                {activeTab === "history" && (
                  <div className="space-y-4">
                   {versions.length === 0 ? (
                     <div className="text-sm text-muted-foreground">No history available</div>
                   ) : (
                     versions.map((v) => (
                       <div key={v.version} className="border border-border p-3 text-sm">
                         <div className="font-mono text-xs text-muted-foreground mb-1">
                           v{v.version} • {formatDate(v.ctime)}
                         </div>
                         <div className="font-bold mb-2 truncate">{v.title}</div>
                         <Button variant="outline" size="sm" className="w-full h-7" onClick={() => handleRevert(v)}>
                           Revert
                         </Button>
                       </div>
                     ))
                   )}
                 </div>
               )}

                {activeTab === "share" && (
                   <div className="space-y-4">
                     {activeShare ? (
                       <Button variant="outline" className="w-full text-xs font-bold" onClick={handleRevokeShare}>
                         <X className="mr-2 h-3.5 w-3.5" />
                         Revoke Share Link
                       </Button>
                     ) : (
                       <Button onClick={handleShare} className="w-full text-xs font-bold">
                         <Share2 className="mr-2 h-3.5 w-3.5" />
                         Generate Share Link
                       </Button>
                     )}
                     {shareUrl && (
                       <div 
                         onClick={handleCopyLink}
                         className="group p-3 bg-muted border border-border rounded-lg break-all text-[10px] font-mono cursor-pointer hover:bg-accent transition-colors relative"
                       >
                         <div className="mb-1 text-muted-foreground uppercase tracking-tighter flex items-center justify-between">
                            <span>Share Link</span>
                            <Copy className="h-3 w-3 opacity-50 group-hover:opacity-100" />
                         </div>
                         <div className="text-foreground leading-relaxed select-all">{shareUrl}</div>
                         <div className={`absolute inset-0 flex items-center justify-center bg-accent/90 transition-opacity rounded-lg ${copied ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
                            <div className="flex items-center gap-2">
                               <Check className="h-3.5 w-3.5 text-primary" />
                               <span className="text-[10px] font-bold">COPIED TO CLIPBOARD</span>
                            </div>
                         </div>
                       </div>
                     )}
                    <div className="pt-4 border-t border-border mt-4">
                      <Button variant="outline" className="w-full mb-2 text-xs font-bold" onClick={handleExport}>
                        <Download className="mr-2 h-3.5 w-3.5" />
                        Export Markdown
                      </Button>
                      <Button variant="destructive" className="w-full text-xs font-bold" onClick={() => setShowDeleteConfirm(true)}>
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        Delete Note
                      </Button>
                    </div>
                  </div>
                )}

             </div>
           </div>
        )}
      </div>

      <Footer 
        cursorPos={cursorPos}
        wordCount={wordCount}
        charCount={charCount}
        hasUnsavedChanges={hasUnsavedChanges}
      />

      {aiModalOpen && (
        <div className="fixed inset-0 z-[170] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={aiLoading ? undefined : closeAiModal} />
          <div className="relative w-full max-w-5xl bg-background border border-border rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-bold">{aiTitle}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {aiLoading ? "Generating..." : "Review before applying"}
                  </div>
                </div>
              </div>
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={closeAiModal}
                disabled={aiLoading}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 max-h-[65vh] overflow-y-auto">
              {aiLoading && (
                <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground py-12">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Waiting for AI response...
                </div>
              )}

              {!aiLoading && aiError && (
                <div className="bg-destructive/10 text-destructive text-sm px-3 py-2 rounded-lg">
                  {aiError}
                </div>
              )}

              {!aiLoading && !aiError && aiAction === "generate" && !aiResultText && (
                <div className="space-y-3">
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Brief description
                  </label>
                  <textarea
                    className="w-full min-h-[140px] rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="Describe what you want to generate..."
                    value={aiPrompt}
                    onChange={(event) => setAiPrompt(event.target.value)}
                  />
                </div>
              )}

              {!aiLoading && !aiError && aiAction === "polish" && aiResultText && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Original</div>
                      <div className="border border-border rounded-lg overflow-hidden">
                        {aiDiffLines.map((line, index) => (
                          <div
                            key={`left-${index}`}
                            className={`px-2 py-1 whitespace-pre-wrap ${
                              line.type === "remove" ? "bg-rose-50 text-rose-700" : "bg-background"
                            }`}
                          >
                            {line.left ?? " "}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Polished</div>
                      <div className="border border-border rounded-lg overflow-hidden">
                        {aiDiffLines.map((line, index) => (
                          <div
                            key={`right-${index}`}
                            className={`px-2 py-1 whitespace-pre-wrap ${
                              line.type === "add" ? "bg-emerald-50 text-emerald-700" : "bg-background"
                            }`}
                          >
                            {line.right ?? " "}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!aiLoading && !aiError && aiAction === "generate" && aiResultText && (
                <div className="border border-border rounded-xl p-4 bg-muted/20">
                  <MarkdownPreview content={aiResultText} className="prose prose-slate max-w-none" />
                </div>
              )}

              {!aiLoading && !aiError && aiAction === "summary" && aiResultText && (
                <div className="border border-border rounded-xl p-4 bg-muted/20 text-sm leading-relaxed whitespace-pre-wrap">
                  {aiResultText}
                </div>
              )}

              {!aiLoading && !aiError && aiAction === "tags" && (
                <div className="space-y-4">
                  <div className="text-xs text-muted-foreground">
                    Available slots: {aiAvailableSlots}
                  </div>
                  <div className="space-y-2">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      Current tags
                    </div>
                    {aiExistingTags.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No tags on this note yet.</div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {aiExistingTags.map((tag) => {
                          const removed = aiRemovedTagIDs.includes(tag.id);
                          return (
                            <button
                              key={tag.id}
                              className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                                removed
                                  ? "bg-rose-50 text-rose-700 border-rose-200"
                                  : "bg-black text-white border-black"
                              }`}
                              onClick={() => toggleExistingTag(tag.id)}
                            >
                              #{tag.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      AI suggested tags
                    </div>
                    {aiSuggestedTags.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No valid tags returned.</div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {aiSuggestedTags.map((tag) => {
                          const checked = aiSelectedTags.includes(tag);
                          return (
                            <button
                              key={tag}
                              className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                                checked ? "bg-black text-white border-black" : "bg-background border-border"
                              } hover:bg-accent`}
                              onClick={() => toggleAiTag(tag)}
                            >
                              #{tag}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
              <Button variant="outline" onClick={closeAiModal} disabled={aiLoading}>
                Cancel
              </Button>
              {aiAction === "generate" && !aiResultText && (
                <Button onClick={handleAiGenerate} disabled={aiLoading}>
                  Generate
                </Button>
              )}
              {aiAction === "tags" && aiSuggestedTags.length > 0 && (
                <Button onClick={handleApplyAiTags} disabled={aiLoading}>
                  Apply Tags
                </Button>
              )}
              {aiAction === "summary" && aiResultText && (
                <Button onClick={handleApplyAiSummary} disabled={aiLoading}>
                  Use Summary
                </Button>
              )}
              {(aiAction === "polish" || aiAction === "generate") && aiResultText && (
                <Button onClick={handleApplyAiText} disabled={aiLoading}>
                  Use Result
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
         <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
            <div className="relative w-full max-w-sm bg-background border border-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
               <div className="p-6 text-center">
                  <div className="w-12 h-12 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto mb-4">
                     <AlertTriangle className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-bold mb-2">Delete Note?</h3>
                  <p className="text-sm text-muted-foreground mb-6">
                     This action cannot be undone. All versions of <span className="font-mono font-bold text-foreground">&ldquo;{title || "Untitled"}&rdquo;</span> will be permanently removed.
                  </p>
                  <div className="flex gap-3">
                     <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowDeleteConfirm(false)}>
                        Cancel
                     </Button>
                     <Button variant="destructive" className="flex-1 rounded-xl font-bold" onClick={handleDelete}>
                        Delete
                     </Button>
                  </div>
               </div>
            </div>
         </div>
      )}

      {showQuickOpen && (
         <div className="fixed inset-0 z-[150] flex items-start justify-center pt-[15vh] px-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={handleCloseQuickOpen} />
            <div className="relative w-full max-w-lg bg-popover border border-border rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
               <div className="flex items-center px-4 py-3 border-b border-border gap-3">
                  <Search className="h-4 w-4 text-muted-foreground" />
                   <input 
                      autoFocus
                      placeholder="Quick open note..."
                      className="bg-transparent border-none focus:ring-0 text-sm flex-1 outline-none"
                      value={quickOpenQuery}
                      onChange={(e) => setQuickOpenQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          handleCloseQuickOpen();
                          return;
                        }
                        if (quickOpenDocs.length === 0) return;
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setQuickOpenIndex((prev) => (prev + 1) % quickOpenDocs.length);
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setQuickOpenIndex((prev) => (prev - 1 + quickOpenDocs.length) % quickOpenDocs.length);
                        } else if (e.key === "Enter") {
                          e.preventDefault();
                          const doc = quickOpenDocs[quickOpenIndex];
                          if (doc) handleQuickOpenSelect(doc);
                        }
                      }}
                   />
                  <X className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-foreground" onClick={handleCloseQuickOpen} />
               </div>
                      <div className="max-h-[50vh] overflow-y-auto p-2">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-2 py-2">
                    {showSearchResults ? "Search Results" : "Recent Updates"}
                  </div>
                  {quickOpenLoading && (
                    <div className="px-2 py-2 text-xs text-muted-foreground">Searching...</div>
                  )}
                  {quickOpenDocs.length === 0 ? (
                    <div className="px-2 py-4 text-sm text-muted-foreground italic">
                      {showSearchResults ? "No matching notes found" : "No recent notes found"}
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {quickOpenDocs.map((doc, index) => {
                        const isActive = index === quickOpenIndex;
                        return (
                          <button
                            key={doc.id}
                            onClick={() => handleQuickOpenSelect(doc)}
                            onMouseEnter={() => setQuickOpenIndex(index)}
                            className={`flex items-center w-full px-3 py-2 text-sm rounded-lg text-left transition-colors group ${isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground"}`}
                          >
                            <div className="flex flex-col min-w-0">
                              <span className="font-medium truncate">{doc.title || "Untitled"}</span>
                              <span className={`text-[10px] truncate ${isActive ? "text-accent-foreground/70" : "text-muted-foreground"}`}>
                                {formatDate(doc.mtime)}
                              </span>
                            </div>
                            <ChevronRight className={`h-3.5 w-3.5 ml-auto transition-opacity ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} />
                          </button>
                        );
                      })}
                    </div>
                  )}
               </div>
               <div className="p-3 bg-muted/30 border-t border-border flex justify-between items-center text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">
                  <span>Tip: Select to switch tab or open</span>
                  <div className="flex items-center gap-1">
                     <span className="border border-border bg-background px-1 rounded shadow-sm font-bold">ESC</span>
                     <span>to close</span>
                  </div>
               </div>
            </div>
         </div>
      )}

      {showFloatingToc && !showDetails && tocContent && (
        <div className="fixed top-24 right-8 z-30 hidden w-72 rounded-2xl border border-slate-200/60 bg-white/80 shadow-2xl backdrop-blur-md xl:block animate-in fade-in slide-in-from-right-4 duration-500">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/60">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">On this page</div>
            <button
              onClick={() => setTocCollapsed(!tocCollapsed)}
              className="p-1 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-all"
            >
              {tocCollapsed ? <Menu className="h-3 w-3" /> : <X className="h-3 w-3" />}
            </button>
          </div>
          {!tocCollapsed && (
            <div className="toc-wrapper text-sm max-h-[60vh] overflow-y-auto p-4 custom-scrollbar">
              <ReactMarkdown
                components={{
                  a: (props) => {
                    const href = props.href || "";
                    return (
                      <a
                        {...props}
                        className="text-slate-500 hover:text-indigo-600 transition-colors py-1 block no-underline"
                        onClick={(event) => {
                          props.onClick?.(event);
                          if (!href.startsWith("#")) return;
                          event.preventDefault();
                          const rawHash = decodeURIComponent(href.slice(1));
                          const normalizedHash = rawHash.normalize("NFKC");
                          const targetCandidates = [rawHash, normalizedHash, slugify(rawHash), slugify(normalizedHash)];
                          for (const candidate of targetCandidates) {
                            const el = getElementById(candidate);
                            if (el) {
                              scrollToElement(el);
                              requestAnimationFrame(() => {
                                forcePreviewSyncRef.current = true;
                                handlePreviewScroll();
                              });
                              break;
                            }
                          }
                        }}
                      />
                    );
                  },
                }}
              >
                {tocContent}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}

      {activePopover === "color" &&
        renderPopover(
          <div className="p-3 bg-background border border-border rounded-lg shadow-xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-2 pb-2 border-b border-border">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">Select Color</span>
              <Button size="icon" variant="ghost" className="h-4 w-4" onClick={() => setActivePopover(null)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            <div className="grid grid-cols-4 gap-2 w-48">
              {COLORS.map((c) => (
                <button
                  key={c.value || "default"}
                  onClick={() => handleColor(c.value)}
                  className="h-8 w-full rounded-lg border border-input hover:scale-105 transition-transform flex items-center justify-center"
                  style={{ backgroundColor: c.value || "transparent" }}
                  title={c.label}
                >
                  {!c.value && <span className="text-xs">A</span>}
                </button>
              ))}
            </div>
          </div>
        )}

      {activePopover === "size" &&
        renderPopover(
          <div className="p-3 bg-background border border-border rounded-lg shadow-xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-2 pb-2 border-b border-border">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">Select Size</span>
              <Button size="icon" variant="ghost" className="h-4 w-4" onClick={() => setActivePopover(null)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex flex-col gap-1 w-32">
              {SIZES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => handleSize(s.value)}
                  className="text-sm px-2 py-1 hover:bg-accent rounded-lg text-left transition-colors flex items-center gap-2"
                >
                  <span style={{ fontSize: s.value }}>Aa</span>
                  <span className="text-xs text-muted-foreground ml-auto">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

      {activePopover === "emoji" &&
        renderPopover(
          <div className="p-3 bg-background border border-border rounded-lg shadow-xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-2 pb-2 border-b border-border">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">Insert Emoji</span>
              <Button size="icon" variant="ghost" className="h-4 w-4" onClick={() => setActivePopover(null)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            <div className="grid grid-cols-5 gap-1 w-64">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    insertTextAtCursor(emoji);
                    setActivePopover(null);
                  }}
                  className="text-xl p-2 hover:bg-accent rounded-lg transition-colors text-center"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}
