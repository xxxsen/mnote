"use client";

import React, { useEffect, useState, useCallback, useRef, useTransition, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { LanguageDescription } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { styleTags } from "@lezer/highlight";
import { Compartment } from "@codemirror/state";
import { getThemeById, loadThemePreference, saveThemePreference, type ThemeId } from "@/lib/editor-themes";
import { undo, redo, indentWithTab } from "@codemirror/commands";
import { keymap } from "@codemirror/view";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { apiFetch, uploadFile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import MarkdownPreview from "@/components/markdown-preview";
import { Tag, DocumentVersionSummary, Document as MnoteDocument } from "@/types";
import {
  Share2,
  Download,
  Trash2,
  ChevronRight,
  Home,
  Search,
  RefreshCw,
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  ListChecks,
  Quote,
  FileCode,
  Table as TableIcon,
  Sparkles,
  Eye,
  X,
  Menu,
  Command,
  AlertTriangle,
  Copy,
  Check,
  FileText,
  Tags,
  Minus,
  Link2,
  ImageIcon,
  CalendarDays,
  Clock3,
  Network
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { MAX_TAGS } from "../constants";
import type { SlashActionContext, SlashCommand } from "../types";
import { EditorHeader } from "./EditorHeader";
import { EditorFooter } from "./EditorFooter";
import { EditorToolbar } from "./EditorToolbar";
import { useDocumentActions } from "../hooks/useDocumentActions";
import { useTagActions } from "../hooks/useTagActions";
import { useQuickOpen } from "../hooks/useQuickOpen";
import { useShareLink } from "../hooks/useShareLink";
import { usePreviewDoc } from "../hooks/usePreviewDoc";
import { useAiAssistant } from "../hooks/useAiAssistant";
import { useSimilarDocs } from "../hooks/useSimilarDocs";
import { useEditorLifecycle } from "../hooks/useEditorLifecycle";

type InlineTagDropdownItem = {
  key: string;
  type: "use" | "create" | "suggestion";
  tag?: Tag;
  name?: string;
};

const FLOATING_PANEL_COLLAPSED_KEY = "mnote:floating-panel-collapsed";

const EMOJI_TABS = [
  {
    key: "smileys",
    label: "Smileys & Emotion",
    icon: "😀",
    items: [
      "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰",
      "😘", "😗", "😙", "😚", "😋", "😛", "😜", "🤪", "😝", "🫠", "🤗", "🤔", "🫡", "🤐", "😐",
      "😑", "😶", "😶‍🌫️", "😏", "😒", "🙄", "😬", "😮‍💨", "😪", "😴", "🤤", "😵", "🤯", "😲",
      "😳", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬", "😷", "🤒", "🤧", "🥵", "🥶", "😎", "🥸"
    ],
  },
  {
    key: "people",
    label: "People & Body",
    icon: "👋",
    items: [
      "👋", "🤚", "🖐️", "✋", "🖖", "🫶", "🫱", "🫲", "🫳", "🫴", "👌", "🤌", "🤏", "✌️", "🤞",
      "🤟", "🤘", "🤙", "👈", "👉", "👆", "👇", "🫵", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏",
      "🙌", "👐", "🤝", "🙏", "💪", "🦾", "🦿", "🦵", "🦶", "🤲", "🫰", "🤍", "🧠", "🫀", "🫁"
    ],
  },
  {
    key: "animals",
    label: "Animals & Nature",
    icon: "🐱",
    items: [
      "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵",
      "🙈", "🙉", "🙊", "🐔", "🐧", "🐦", "🦉", "🦋", "🐛", "🐝", "🐢", "🐍", "🐙", "🦀", "🐠",
      "🐬", "🐳", "🦕", "🦖", "🌵", "🌲", "🌳", "🌴", "🌺", "🌸", "🌼", "🌻", "🍀", "🌿", "🍁"
    ],
  },
  {
    key: "food",
    label: "Food & Drink",
    icon: "🍎",
    items: [
      "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍒", "🥝", "🍍", "🥥", "🥑", "🍆",
      "🥕", "🌽", "🥦", "🥬", "🍞", "🥐", "🥯", "🥞", "🧇", "🧀", "🥚", "🍳", "🥓", "🍔", "🍟",
      "🍕", "🌮", "🌯", "🥗", "🍜", "🍣", "🍱", "🍙", "🍚", "🍩", "🍪", "🍰", "🧁", "☕", "🧃"
    ],
  },
  {
    key: "travel",
    label: "Travel & Places",
    icon: "🏠",
    items: [
      "✈️", "🛫", "🛬", "🚀", "🚗", "🚕", "🚙", "🚌", "🚎", "🏎️", "🚓", "🚑", "🚒", "🚜", "🚲",
      "🚁", "🚂", "🚆", "🚇", "🚊", "🚉", "🚢", "🛳️", "⛴️", "🛶", "🗺️", "🧭", "🗽", "🗼", "🏰",
      "🏯", "🏝️", "🏔️", "🌋", "🏖️", "🏟️", "🏛️", "🏠", "🏢", "🏙️", "🌉", "🌆", "🌇", "🛣️", "🗾"
    ],
  },
  {
    key: "activities",
    label: "Activities",
    icon: "⚽",
    items: [
      "⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🏉", "🥏", "🎱", "🏓", "🏸", "🥅", "⛳", "🏹", "🥊",
      "🥋", "🛹", "⛸️", "🎿", "🎯", "🎳", "🎮", "🕹️", "🎲", "🧩", "🎨", "🎭", "🎤", "🎧", "🎷",
      "🎸", "🎹", "🥁", "🎺", "🎻", "🎬", "🎟️", "🎪", "🎉", "🎊", "🪁", "🏆", "🥇", "🥈", "🥉"
    ],
  },
  {
    key: "objects",
    label: "Objects",
    icon: "📝",
    items: [
      "💡", "📝", "📌", "📎", "📚", "📒", "📖", "📄", "📑", "🗂️", "🧾", "🖊️", "✏️", "🖍️", "🧠",
      "💻", "🖥️", "⌨️", "🖱️", "🖨️", "📷", "📸", "🎧", "📱", "🔋", "🧲", "🧯", "🗑️", "🔒", "🔑",
      "🧰", "🪛", "🔧", "🔨", "🪜", "🧪", "🧫", "🧬", "🩺", "💊", "🩹", "📦", "📫", "🗃️", "🕰️"
    ],
  },
  {
    key: "symbols",
    label: "Symbols",
    icon: "⛔",
    items: [
      "✅", "❌", "⚠️", "❗", "❓", "ℹ️", "🔔", "🔕", "⭐", "✨", "🔥", "💥", "💫", "💯", "❤️",
      "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "⚫",
      "⚪", "🟥", "🟧", "🟨", "🟩", "🟦", "🟪", "🟫", "➕", "➖", "✖️", "➗", "✔️", "✳️", "♻️"
    ],
  },
  {
    key: "flags",
    label: "Flags",
    icon: "🏁",
    items: [
      "🏁", "🚩", "🏳️", "🏴", "🏳️‍🌈", "🏳️‍⚧️", "🇺🇸", "🇨🇳", "🇯🇵", "🇰🇷", "🇬🇧", "🇫🇷", "🇩🇪", "🇮🇹", "🇪🇸",
      "🇨🇦", "🇦🇺", "🇳🇿", "🇧🇷", "🇦🇷", "🇲🇽", "🇮🇳", "🇷🇺", "🇺🇦", "🇸🇬", "🇭🇰", "🇹🇼", "🇹🇭", "🇻🇳", "🇵🇭"
    ],
  },
];

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

const SLASH_COMMANDS: SlashCommand[] = [
  { id: "h1", label: "Heading 1", keywords: ["title", "#"], icon: <Heading1 className="h-4 w-4" />, action: (s) => s.handleFormat("line", "# ") },
  { id: "h2", label: "Heading 2", keywords: ["subtitle", "##"], icon: <Heading2 className="h-4 w-4" />, action: (s) => s.handleFormat("line", "## ") },
  { id: "h3", label: "Heading 3", keywords: ["section", "###"], icon: <Heading3 className="h-4 w-4" />, action: (s) => s.handleFormat("line", "### ") },
  { id: "bold", label: "Bold", keywords: ["strong"], icon: <Bold className="h-4 w-4" />, action: (s) => s.handleFormat("wrap", "**", "**") },
  { id: "italic", label: "Italic", keywords: ["emphasis"], icon: <Italic className="h-4 w-4" />, action: (s) => s.handleFormat("wrap", "*", "*") },
  { id: "list", label: "Bullet List", keywords: ["unordered"], icon: <List className="h-4 w-4" />, action: (s) => s.handleFormat("line", "- ") },
  { id: "numlist", label: "Numbered List", keywords: ["ordered"], icon: <ListOrdered className="h-4 w-4" />, action: (s) => s.handleFormat("line", "1. ") },
  { id: "todo", label: "Todo List", keywords: ["task", "checkbox"], icon: <ListTodo className="h-4 w-4" />, action: (s) => s.handleFormat("line", "- [ ] ") },
  { id: "done", label: "Done List", keywords: ["task done", "check"], icon: <ListChecks className="h-4 w-4" />, action: (s) => s.handleFormat("line", "- [x] ") },
  { id: "quote", label: "Quote", keywords: ["blockquote"], icon: <Quote className="h-4 w-4" />, action: (s) => s.handleFormat("line", "> ") },
  { id: "code", label: "Code Block", keywords: ["snippet"], icon: <FileCode className="h-4 w-4" />, action: (s) => s.handleFormat("wrap", "```\n", "\n```") },
  { id: "table", label: "Table", keywords: ["grid"], icon: <TableIcon className="h-4 w-4" />, action: (s) => s.handleInsertTable() },
  { id: "link", label: "Link", keywords: ["url"], icon: <Link2 className="h-4 w-4" />, action: (s) => s.insertTextAtCursor("[title](https://)") },
  { id: "image", label: "Image", keywords: ["media"], icon: <ImageIcon className="h-4 w-4" />, action: (s) => s.insertTextAtCursor("![alt](https://)") },
  { id: "callout", label: "Callout", keywords: ["note", "tip", "warning"], icon: <ListChecks className="h-4 w-4" />, action: (s) => s.insertTextAtCursor(":::info\nNote\n:::\n") },
  { id: "date", label: "Current Date", keywords: ["today", "time"], icon: <CalendarDays className="h-4 w-4" />, action: (s) => s.insertTextAtCursor(new Date().toISOString().slice(0, 10)) },
  { id: "time", label: "Current Time", keywords: ["clock"], icon: <Clock3 className="h-4 w-4" />, action: (s) => s.insertTextAtCursor(new Date().toLocaleTimeString("en-US", { hour12: false })) },
  { id: "divider", label: "Divider", keywords: ["hr", "line"], icon: <Minus className="h-4 w-4" />, action: (s) => s.insertTextAtCursor("\n---\n") },
];

// Theme compartment for dynamic theme switching
const themeCompartment = new Compartment();

type EditorPageClientProps = {
  docId: string;
};

export function EditorPageClient({ docId }: EditorPageClientProps) {
  const router = useRouter();
  const id = docId;
  const { toast } = useToast();
  const preview = usePreviewDoc({
    onError: () => {
      toast({ description: "Failed to load document preview", variant: "error" });
    },
  });
  const share = useShareLink({
    docId: id,
    onError: (err) => {
      toast({ description: err instanceof Error ? err : "Share action failed", variant: "error" });
    },
  });
  const quickOpen = useQuickOpen({
    onSelectDocument: (doc) => {
      router.push(`/docs/${doc.id}`);
    },
  });
  const {
    previewDoc,
    setPreviewDoc,
    previewLoading,
    handleOpenPreview,
  } = preview;
  const { shareUrl, activeShare, copied, handleShare, loadShare, updateShareConfig, handleRevokeShare, handleCopyLink } = share;
  const {
    showQuickOpen,
    quickOpenQuery,
    quickOpenIndex,
    quickOpenLoading,
    showSearchResults,
    quickOpenDocs,
    setQuickOpenQuery,
    setQuickOpenIndex,
    handleOpenQuickOpen,
    handleCloseQuickOpen,
    handleQuickOpenSelect,
  } = quickOpen;
  const documentActions = useDocumentActions(id);
  const tagActions = useTagActions(id);

  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [starred, setStarred] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [activeTab, setActiveTab] = useState<"summary" | "history" | "share">("summary");
  const [currentThemeId, setCurrentThemeId] = useState<ThemeId>(loadThemePreference);

  const [versions, setVersions] = useState<DocumentVersionSummary[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTagIDs, setSelectedTagIDs] = useState<string[]>([]);
  const [backlinks, setBacklinks] = useState<MnoteDocument[]>([]);
  const [outboundLinks, setOutboundLinks] = useState<MnoteDocument[]>([]);

  // Wikilink State Extension
  const [wikilinkIndex, setWikilinkIndex] = useState(0);

  const { similarDocs, similarLoading, similarCollapsed, similarIconVisible, handleToggleSimilar, handleCollapseSimilar, handleCloseSimilar } = useSimilarDocs({
    docId: id,
    title,
  });
  const [slashMenu, setSlashMenu] = useState<{ open: boolean; x: number; y: number; filter: string }>({ open: false, x: 0, y: 0, filter: "" });
  const [slashIndex, setSlashIndex] = useState(0);
  const [wikilinkMenu, setWikilinkMenu] = useState<{ open: boolean; x: number; y: number; query: string; from: number }>({ open: false, x: 0, y: 0, query: "", from: 0 });
  const [wikilinkResults, setWikilinkResults] = useState<{ id: string; title: string }[]>([]);
  const [wikilinkLoading, setWikilinkLoading] = useState(false);
  const wikilinkTimerRef = useRef<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [shareExpiresAtInput, setShareExpiresAtInput] = useState("");
  const [shareExpiresAtUnix, setShareExpiresAtUnix] = useState(0);
  const [sharePasswordInput, setSharePasswordInput] = useState("");
  const [shareConfigSaving, setShareConfigSaving] = useState(false);
  const [sharePermission, setSharePermission] = useState<"view" | "comment">("view");
  const [shareAllowDownload, setShareAllowDownload] = useState(true);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [popoverAnchor, setPopoverAnchor] = useState<{ top: number; left: number } | null>(null);

  const [previewContent, setPreviewContent] = useState(content);
  const previewUpdateTimerRef = useRef<number | null>(null);
  const scrollSyncTimerRef = useRef<number | null>(null);
  const [, startTransition] = useTransition();
  const contentRef = useRef<string>("");
  const lastSavedContentRef = useRef<string>("");

  const previewRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const pasteHandlerRef = useRef<((event: ClipboardEvent) => void) | null>(null);
  const editorKeydownHandlerRef = useRef<((event: KeyboardEvent) => void) | null>(null);
  const wikilinkKeydownRef = useRef<(event: KeyboardEvent) => boolean>(() => false);
  const slashKeydownRef = useRef<(event: KeyboardEvent) => boolean>(() => false);
  const colorButtonRef = useRef<HTMLButtonElement | null>(null);
  const sizeButtonRef = useRef<HTMLButtonElement | null>(null);
  const emojiButtonRef = useRef<HTMLButtonElement | null>(null);
  const scrollingSource = useRef<"editor" | "preview" | null>(null);
  const forcePreviewSyncRef = useRef(false);

  // TOC State
  const [tocContent, setTocContent] = useState("");
  const [tocCollapsed, setTocCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    const raw = window.localStorage.getItem(FLOATING_PANEL_COLLAPSED_KEY);
    return raw === "1" || raw === "true";
  });
  const [floatingPanelTab, setFloatingPanelTab] = useState<"toc" | "mentions" | "graph" | "summary">("toc");
  const [floatingPanelTouched, setFloatingPanelTouched] = useState(false);
  const [activePopover, setActivePopover] = useState<"emoji" | "color" | "size" | null>(null);
  const [emojiTab, setEmojiTab] = useState(EMOJI_TABS[0].key);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [inlineTagMode, setInlineTagMode] = useState(false);
  const [inlineTagValue, setInlineTagValue] = useState("");
  const [inlineTagResults, setInlineTagResults] = useState<Tag[]>([]);
  const [inlineTagLoading, setInlineTagLoading] = useState(false);
  const [inlineTagIndex, setInlineTagIndex] = useState(0);
  const inlineTagInputRef = useRef<HTMLInputElement | null>(null);
  const inlineTagComposeRef = useRef(false);
  const inlineTagSearchTimerRef = useRef<number | null>(null);
  const [inlineTagMenuPos, setInlineTagMenuPos] = useState<{ left: number; top: number; width: number } | null>(null);

  const activeEmojiTab = useMemo(
    () => EMOJI_TABS.find((tab) => tab.key === emojiTab) || EMOJI_TABS[0],
    [emojiTab]
  );

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

  const notifyAi = useCallback(
    (message: string) => {
      toast({ description: message });
    },
    [toast]
  );

  const ai = useAiAssistant({
    docId: id,
    maxTags: MAX_TAGS,
    normalizeTagName,
    isValidTagName,
    notify: notifyAi,
  });
  const {
    aiModalOpen,
    aiAction,
    aiLoading,
    aiPrompt,
    aiResultText,
    aiExistingTags,
    aiSuggestedTags,
    aiSelectedTags,
    aiRemovedTagIDs,
    aiError,
    aiDiffLines,
    aiTitle,
    aiAvailableSlots,
    setAiPrompt,
    closeAiModal,
    handleAiPolish,
    handleAiGenerateOpen,
    handleAiGenerate,
    handleAiSummary,
    handleAiTags,
    handleApplyAiSummary,
    handleApplyAiTags,
    toggleAiTag,
    toggleExistingTag,
  } = ai;

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

  const extractLinkedDocIDs = useCallback((value: string) => {
    const ids: string[] = [];
    const seen = new Set<string>();
    const regex = /\/docs\/([a-zA-Z0-9_-]+)/g;
    let match: RegExpExecArray | null = regex.exec(value);
    while (match) {
      const targetID = match[1];
      if (targetID && targetID !== id && !seen.has(targetID)) {
        seen.add(targetID);
        ids.push(targetID);
      }
      match = regex.exec(value);
    }
    return ids;
  }, [id]);

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

      if (scrollSyncTimerRef.current) window.clearTimeout(scrollSyncTimerRef.current);
      scrollSyncTimerRef.current = window.setTimeout(() => {
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

      if (scrollSyncTimerRef.current) window.clearTimeout(scrollSyncTimerRef.current);
      scrollSyncTimerRef.current = window.setTimeout(() => {
        scrollingSource.current = null;
        forcePreviewSyncRef.current = false;
      }, 100);
    }
  }, [loading]);

  useEditorLifecycle({
    id,
    saving,
    hasUnsavedChanges,
    contentRef,
    lastSavedContentRef,
    documentActions,
    extractTitleFromContent,
    onLoadingChange: setLoading,
    onLoaded: ({ initialContent, detail, hasDraftOverride }) => {
      setContent(initialContent);
      setPreviewContent(initialContent);
      setHasUnsavedChanges(hasDraftOverride);

      const derivedTitle = extractTitleFromContent(initialContent);
      setTitle(derivedTitle);
      setSummary(detail.document.summary || "");
      setStarred(detail.document.starred || 0);
      setSelectedTagIDs(detail.tag_ids || []);
      setAllTags(detail.tags || []);
      setLastSavedAt(detail.document.mtime);

      const text = initialContent || "";
      setCharCount(text.length);
      const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
      setWordCount(words.length);
    },
    onLoadError: (err) => {
      toast({ description: err instanceof Error ? err : "Document not found", variant: "error" });
      router.push("/docs");
    },
    onAutoSaved: ({ title: derivedTitle, timestamp }) => {
      setTitle(derivedTitle);
      setLastSavedAt(timestamp);
      setHasUnsavedChanges(false);
    },
  });

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

  const loadBacklinks = useCallback(async () => {
    setBacklinks([]);
    try {
      const data = await apiFetch<MnoteDocument[]>(`/documents/${id}/backlinks`);
      setBacklinks(data || []);
    } catch {
      setBacklinks([]);
    }
  }, [id, setBacklinks]);

  const loadOutboundLinks = useCallback(async (value: string) => {
    const linkIDs = extractLinkedDocIDs(value);
    if (linkIDs.length === 0) {
      setOutboundLinks([]);
      return;
    }
    try {
      const settled = await Promise.all(
        linkIDs.slice(0, 24).map(async (docID) => {
          try {
            const detail = await apiFetch<{ document: MnoteDocument }>(`/documents/${docID}`);
            return detail?.document || null;
          } catch {
            return null;
          }
        })
      );
      setOutboundLinks(settled.filter(Boolean) as MnoteDocument[]);
    } catch {
      setOutboundLinks([]);
    }
  }, [extractLinkedDocIDs]);

  useEffect(() => {
    void loadBacklinks();
  }, [loadBacklinks]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadOutboundLinks(previewContent);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [loadOutboundLinks, previewContent]);

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

  const schedulePreviewUpdate = useCallback(() => {
    if (previewUpdateTimerRef.current) {
      window.clearTimeout(previewUpdateTimerRef.current);
    }
    previewUpdateTimerRef.current = window.setTimeout(() => {
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
        let singleCursorAnchor: number | null = null;
        if (from === to && startLine.number === endLine.number) {
          const line = startLine;
          if (allHavePrefix) {
            if (line.text.startsWith(prefix)) {
              const removable = Math.min(prefix.length, Math.max(0, from - line.from));
              singleCursorAnchor = from - removable;
            } else {
              singleCursorAnchor = from;
            }
          } else if (!line.text.startsWith(prefix)) {
            singleCursorAnchor = from + prefix.length;
          } else {
            singleCursorAnchor = from;
          }
        }
        view.dispatch(
          singleCursorAnchor === null
            ? { changes }
            : { changes, selection: { anchor: singleCursorAnchor } }
        );
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

  const saveTagIDs = useCallback(
    async (nextTagIDs: string[]) => {
      const previous = selectedTagIDs;
      setSelectedTagIDs(nextTagIDs);
      try {
        await tagActions.saveTags(nextTagIDs);
        setLastSavedAt(Math.floor(Date.now() / 1000));
      } catch (err) {
        console.error(err);
        toast({ description: err instanceof Error ? err : "Failed to save tags", variant: "error" });
        setSelectedTagIDs(previous);
      }
    },
    [selectedTagIDs, tagActions, toast]
  );

  const findExistingTagByName = useCallback(
    async (name: string) => {
      const trimmed = normalizeTagName(name);
      if (!trimmed) return null;
      const cached = allTags.find((tag) => tag.name === trimmed);
      if (cached) return cached;
      try {
        const res = await tagActions.searchTags(trimmed);
        const exact = (res || []).find((tag) => tag.name === trimmed) || null;
        if (exact) {
          mergeTags([exact]);
        }
        return exact;
      } catch {
        return null;
      }
    },
    [allTags, mergeTags, normalizeTagName, tagActions]
  );

  const handleApplyAiText = useCallback(() => {
    if (!aiResultText) {
      closeAiModal();
      return;
    }
    applyContent(aiResultText);
    closeAiModal();
  }, [aiResultText, applyContent, closeAiModal]);

  const filteredSlashCommands = useMemo(() => {
    const query = slashMenu.filter.trim().toLowerCase();
    if (!query) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter((cmd) => {
      if (cmd.label.toLowerCase().includes(query)) return true;
      if (cmd.id.toLowerCase().includes(query)) return true;
      return (cmd.keywords || []).some((kw) => kw.toLowerCase().includes(query));
    });
  }, [slashMenu.filter]);

  useEffect(() => {
    setSlashIndex(0);
  }, [slashMenu.open, slashMenu.filter]);

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
    setSlashIndex(0);
    setSlashMenu(prev => ({ ...prev, open: false }));
  }, [handleFormat, handleInsertTable, insertTextAtCursor]);

  const handleSlashKeyDown = useCallback((e: React.KeyboardEvent | KeyboardEvent) => {
    if (!slashMenu.open) return false;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filteredSlashCommands.length === 0) return true;
      setSlashIndex((prev) => (prev + 1) % filteredSlashCommands.length);
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filteredSlashCommands.length === 0) return true;
      setSlashIndex((prev) => (prev - 1 + filteredSlashCommands.length) % filteredSlashCommands.length);
      return true;
    }
    if (e.key === "Enter") {
      if (filteredSlashCommands.length === 0) return false;
      e.preventDefault();
      const selected = filteredSlashCommands[slashIndex] || filteredSlashCommands[0];
      if (selected) {
        handleSlashAction(selected.action);
      }
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setSlashMenu((prev) => ({ ...prev, open: false }));
      return true;
    }
    return false;
  }, [filteredSlashCommands, handleSlashAction, slashIndex, slashMenu.open]);

  // Wikilink search effect
  useEffect(() => {
    if (!wikilinkMenu.open) {
      setWikilinkResults([]);
      return;
    }
    if (wikilinkTimerRef.current) window.clearTimeout(wikilinkTimerRef.current);
    wikilinkTimerRef.current = window.setTimeout(async () => {
      setWikilinkLoading(true);
      try {
        const params = new URLSearchParams();
        if (wikilinkMenu.query) params.set("q", wikilinkMenu.query);
        params.set("limit", "8");
        const docs = await apiFetch<{ id: string; title: string }[]>(`/documents?${params.toString()}`);
        setWikilinkResults(docs || []);
      } catch {
        setWikilinkResults([]);
      } finally {
        setWikilinkLoading(false);
      }
    }, 200);
    return () => { if (wikilinkTimerRef.current) window.clearTimeout(wikilinkTimerRef.current); };
  }, [wikilinkMenu.open, wikilinkMenu.query]);

  useEffect(() => {
    setWikilinkIndex(0);
  }, [wikilinkResults]);

  const handleWikilinkSelect = useCallback((docTitle: string, docId: string) => {
    const view = editorViewRef.current;
    if (!view) return;
    const cursorPos = view.state.selection.main.head;
    const from = wikilinkMenu.from;

    // Check if the next characters are `]]` and remove them if present
    const docString = view.state.doc.toString();
    const hasSuffix = docString.slice(cursorPos, cursorPos + 2) === "]]";

    const insertText = `[${docTitle}](/docs/${docId})`;
    view.dispatch({
      changes: { from, to: hasSuffix ? cursorPos + 2 : cursorPos, insert: insertText },
      selection: { anchor: from + insertText.length },
    });
    contentRef.current = view.state.doc.toString();
    setContent(contentRef.current);
    setPreviewContent(contentRef.current);
    setHasUnsavedChanges(contentRef.current !== lastSavedContentRef.current);
    schedulePreviewUpdate();
    setWikilinkMenu(prev => ({ ...prev, open: false }));
    view.focus();
  }, [wikilinkMenu.from, schedulePreviewUpdate]);

  const handleWikilinkKeyDown = useCallback((e: React.KeyboardEvent | KeyboardEvent) => {
    if (!wikilinkMenu.open || wikilinkResults.length === 0) return false;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setWikilinkIndex(prev => (prev < wikilinkResults.length - 1 ? prev + 1 : prev));
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setWikilinkIndex(prev => (prev > 0 ? prev - 1 : prev));
      return true;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const selected = wikilinkResults[wikilinkIndex];
      if (selected) {
        handleWikilinkSelect(selected.title, selected.id);
      }
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setWikilinkMenu(prev => ({ ...prev, open: false }));
      return true;
    }
    return false;
  }, [wikilinkMenu.open, wikilinkResults, wikilinkIndex, handleWikilinkSelect]);

  useEffect(() => {
    wikilinkKeydownRef.current = (event: KeyboardEvent) => handleWikilinkKeyDown(event);
  }, [handleWikilinkKeyDown]);

  useEffect(() => {
    slashKeydownRef.current = (event: KeyboardEvent) => handleSlashKeyDown(event);
  }, [handleSlashKeyDown]);

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

  const hasTocPanel = useMemo(() => {
    const hasToken = /\[(toc|TOC)]/.test(previewContent);
    return Boolean(tocContent && hasToken);
  }, [tocContent, previewContent]);

  const hasMentionsPanel = backlinks.length > 0;
  const hasGraphPanel = backlinks.length > 0 || outboundLinks.length > 0;
  const hasSummaryPanel = summary.trim().length > 0;
  useEffect(() => {
    if (!activeShare) {
      setShareExpiresAtInput("");
      setShareExpiresAtUnix(0);
      setSharePasswordInput("");
      setSharePermission("view");
      setShareAllowDownload(true);
      return;
    }
    if (activeShare.expires_at > 0) {
      const local = new Date(activeShare.expires_at * 1000 - new Date().getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 10);
      setShareExpiresAtInput(local);
      setShareExpiresAtUnix(activeShare.expires_at);
    } else {
      setShareExpiresAtInput("");
      setShareExpiresAtUnix(0);
    }
    setSharePermission(activeShare.permission === 2 ? "comment" : "view");
    setShareAllowDownload(activeShare.allow_download === 1);
    setSharePasswordInput(activeShare.password || "");
  }, [activeShare]);
  const availableFloatingTabs = useMemo(() => {
    const tabs: Array<"toc" | "mentions" | "graph" | "summary"> = [];
    if (hasTocPanel) tabs.push("toc");
    if (hasMentionsPanel) tabs.push("mentions");
    if (hasGraphPanel) tabs.push("graph");
    if (hasSummaryPanel) tabs.push("summary");
    return tabs;
  }, [hasGraphPanel, hasMentionsPanel, hasSummaryPanel, hasTocPanel]);

  const linkGraph = useMemo(() => {
    const incomingMap = new Map(backlinks.map((doc) => [doc.id, doc]));
    const outgoingMap = new Map(outboundLinks.map((doc) => [doc.id, doc]));
    const bothIDs = Array.from(incomingMap.keys()).filter((docID) => outgoingMap.has(docID));
    const incomingOnly = Array.from(incomingMap.values()).filter((doc) => !outgoingMap.has(doc.id));
    const outgoingOnly = Array.from(outgoingMap.values()).filter((doc) => !incomingMap.has(doc.id));

    const nodes: Array<{ id: string; title: string; x: number; y: number; kind: "current" | "incoming" | "outgoing" | "both" }> = [
      { id, title: title || "Untitled", x: 50, y: 50, kind: "current" },
    ];
    const edges: Array<{ from: string; to: string }> = [];
    const positionByID: Record<string, { x: number; y: number }> = { [id]: { x: 50, y: 50 } };

    const spread = (
      docs: MnoteDocument[],
      x: number,
      kind: "incoming" | "outgoing"
    ) => {
      if (docs.length === 0) return;
      const yMin = 16;
      const yMax = 84;
      const step = docs.length === 1 ? 0 : (yMax - yMin) / (docs.length - 1);
      docs.forEach((doc, index) => {
        const y = docs.length === 1 ? 50 : yMin + step * index;
        nodes.push({ id: doc.id, title: doc.title || "Untitled", x, y, kind });
        positionByID[doc.id] = { x, y };
      });
    };

    spread(incomingOnly, 24, "incoming");
    spread(outgoingOnly, 76, "outgoing");
    bothIDs.forEach((docID, index) => {
      const doc = incomingMap.get(docID) || outgoingMap.get(docID);
      if (!doc) return;
      const side = index % 2 === 0 ? 40 : 60;
      const y = Math.min(84, 20 + Math.floor(index / 2) * 14);
      nodes.push({ id: doc.id, title: doc.title || "Untitled", x: side, y, kind: "both" });
      positionByID[doc.id] = { x: side, y };
    });

    incomingOnly.forEach((doc) => edges.push({ from: doc.id, to: id }));
    outgoingOnly.forEach((doc) => edges.push({ from: id, to: doc.id }));
    bothIDs.forEach((docID) => {
      edges.push({ from: docID, to: id });
      edges.push({ from: id, to: docID });
    });

    return { nodes, edges, positionByID };
  }, [backlinks, id, outboundLinks, title]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(FLOATING_PANEL_COLLAPSED_KEY, tocCollapsed ? "1" : "0");
  }, [tocCollapsed]);

  useEffect(() => {
    setFloatingPanelTab("toc");
    setFloatingPanelTouched(false);
    setOutboundLinks([]);
    setInlineTagMode(false);
    setInlineTagValue("");
    setInlineTagResults([]);
    setInlineTagIndex(0);
  }, [id]);

  useEffect(() => {
    if (availableFloatingTabs.length === 0) return;
    if (floatingPanelTouched) return;
    setFloatingPanelTab(availableFloatingTabs[0]);
  }, [availableFloatingTabs, floatingPanelTouched]);

  useEffect(() => {
    if (availableFloatingTabs.length === 0) return;
    if (!availableFloatingTabs.includes(floatingPanelTab)) {
      setFloatingPanelTab(availableFloatingTabs[0]);
    }
  }, [availableFloatingTabs, floatingPanelTab]);

  const handleSave = useCallback(async () => {
    const latestContent = contentRef.current;
    const derivedTitle = extractTitleFromContent(latestContent);
    if (!derivedTitle) {
      toast({ description: "Please add a title using markdown heading (Title + ===)." });
      return;
    }
    setSaving(true);
    try {
      await documentActions.saveDocument(derivedTitle, latestContent);
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
  }, [documentActions, extractTitleFromContent, id, toast]);

  const handleDelete = async () => {
    try {
      await documentActions.deleteDocument();
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

  const saveShareConfig = useCallback(async (overrides?: Partial<{
    expires_at: number;
    permission: "view" | "comment";
    allow_download: boolean;
    password: string;
    clear_password: boolean;
  }>) => {
    if (!activeShare) return;
    try {
      setShareConfigSaving(true);
      const password = overrides?.password;
      const clearPassword = overrides?.clear_password === true;
      await updateShareConfig({
        expires_at: overrides?.expires_at ?? shareExpiresAtUnix,
        permission: overrides?.permission ?? sharePermission,
        allow_download: overrides?.allow_download ?? shareAllowDownload,
        password: password && password.trim() ? password.trim() : undefined,
        clear_password: clearPassword || undefined,
      });
      if (clearPassword) {
        setSharePasswordInput("");
      }
    } finally {
      setShareConfigSaving(false);
    }
  }, [activeShare, shareAllowDownload, shareExpiresAtUnix, sharePermission, updateShareConfig]);

  const resolveShareExpireTs = useCallback((rawValue: string): number => {
    const raw = rawValue.trim();
    if (!raw) return 0;

    const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dateOnly) return 0;
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    // Unified cross-browser behavior: selected day expires at local 23:59:59.
    const ts = Math.floor(new Date(year, month - 1, day, 23, 59, 59, 0).getTime() / 1000);
    return Number.isFinite(ts) && ts > 0 ? ts : 0;
  }, []);

  const handleShareExpireAtChange = useCallback((next: string) => {
    setShareExpiresAtInput(next);
    if (!next.trim()) {
      setShareExpiresAtUnix(0);
      void saveShareConfig({ expires_at: 0 });
      return;
    }
    const ts = resolveShareExpireTs(next);
    if (ts > 0) {
      setShareExpiresAtUnix(ts);
      void saveShareConfig({ expires_at: ts });
    }
  }, [resolveShareExpireTs, saveShareConfig]);

  const loadVersions = async () => {
    try {
      const v = await documentActions.listVersions();
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

  useEffect(() => {
    if (!inlineTagMode) return;
    inlineTagInputRef.current?.focus();
  }, [inlineTagMode]);

  useEffect(() => {
    if (!inlineTagMode) {
      setInlineTagMenuPos(null);
      return;
    }
    const updateMenuPosition = () => {
      const input = inlineTagInputRef.current;
      if (!input) {
        setInlineTagMenuPos(null);
        return;
      }
      const rect = input.getBoundingClientRect();
      setInlineTagMenuPos({
        left: rect.left,
        top: rect.bottom + 4,
        width: Math.max(rect.width, 192),
      });
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [inlineTagMode, inlineTagValue]);

  const inlineTagTrimmed = useMemo(
    () => normalizeTagName(inlineTagValue),
    [inlineTagValue, normalizeTagName]
  );

  const inlineTagSuggestions = useMemo(
    () => inlineTagResults.filter((tag) => !selectedTagIDs.includes(tag.id)),
    [inlineTagResults, selectedTagIDs]
  );

  const inlineTagExact = useMemo(
    () =>
      inlineTagSuggestions.find((tag) => tag.name === inlineTagTrimmed) ||
      allTags.find((tag) => tag.name === inlineTagTrimmed) ||
      null,
    [allTags, inlineTagSuggestions, inlineTagTrimmed]
  );

  const inlineTagDropdownItems = useMemo(() => {
    if (!inlineTagTrimmed || inlineTagLoading) return [] as InlineTagDropdownItem[];
    const items: InlineTagDropdownItem[] = [];
    if (inlineTagExact) {
      items.push({ key: `use-${inlineTagExact.id}`, type: "use", tag: inlineTagExact });
    } else if (isValidTagName(inlineTagTrimmed)) {
      items.push({ key: `create-${inlineTagTrimmed}`, type: "create", name: inlineTagTrimmed });
    }
    inlineTagSuggestions.forEach((tag) => {
      if (inlineTagExact && tag.id === inlineTagExact.id) return;
      items.push({ key: `suggestion-${tag.id}`, type: "suggestion", tag });
    });
    return items.slice(0, 8);
  }, [inlineTagTrimmed, inlineTagLoading, inlineTagExact, isValidTagName, inlineTagSuggestions]);

  useEffect(() => {
    if (!inlineTagMode) {
      setInlineTagResults([]);
      setInlineTagLoading(false);
      setInlineTagIndex(0);
      return;
    }
    if (inlineTagSearchTimerRef.current) {
      window.clearTimeout(inlineTagSearchTimerRef.current);
    }
    if (!inlineTagTrimmed) {
      setInlineTagResults([]);
      setInlineTagLoading(false);
      setInlineTagIndex(0);
      return;
    }
    inlineTagSearchTimerRef.current = window.setTimeout(async () => {
      setInlineTagLoading(true);
      try {
        const res = await tagActions.searchTags(inlineTagTrimmed);
        const next = res || [];
        setInlineTagResults(next);
        mergeTags(next);
      } catch {
        setInlineTagResults([]);
      } finally {
        setInlineTagLoading(false);
      }
    }, 180);

    return () => {
      if (inlineTagSearchTimerRef.current) {
        window.clearTimeout(inlineTagSearchTimerRef.current);
      }
    };
  }, [inlineTagMode, inlineTagTrimmed, tagActions, mergeTags]);

  useEffect(() => {
    setInlineTagIndex(0);
  }, [inlineTagDropdownItems]);

  const handleInlineAddTag = useCallback(async (name?: string) => {
    const trimmed = normalizeTagName(name ?? inlineTagValue);
    if (!trimmed) {
      setInlineTagMode(false);
      setInlineTagValue("");
      return;
    }
    if (!isValidTagName(trimmed)) {
      toast({ description: "Tags must be letters, numbers, or Chinese characters, and at most 16 characters." });
      return;
    }
    if (selectedTagIDs.length >= MAX_TAGS) {
      toast({ description: `You can only select up to ${MAX_TAGS} tags.` });
      return;
    }

    try {
      let existing = allTags.find((tag) => tag.name === trimmed) || null;
      if (!existing) {
        existing = await findExistingTagByName(trimmed);
      }

      if (existing) {
        if (!selectedTagIDs.includes(existing.id)) {
          await saveTagIDs([...selectedTagIDs, existing.id]);
        }
      } else {
        const created = await apiFetch<Tag>("/tags", {
          method: "POST",
          body: JSON.stringify({ name: trimmed }),
        });
        mergeTags([created]);
        await saveTagIDs([...selectedTagIDs, created.id]);
      }

      setInlineTagValue("");
      setInlineTagMode(false);
    } catch (err) {
      toast({ description: err instanceof Error ? err.message : "Failed to add tag", variant: "error" });
    }
  }, [
    allTags,
    findExistingTagByName,
    inlineTagValue,
    isValidTagName,
    mergeTags,
    normalizeTagName,
    saveTagIDs,
    selectedTagIDs,
    toast,
  ]);

  const handleInlineTagSelect = useCallback(async (item: InlineTagDropdownItem) => {
    if (item.tag) {
      if (!selectedTagIDs.includes(item.tag.id)) {
        if (selectedTagIDs.length >= MAX_TAGS) {
          toast({ description: `You can only select up to ${MAX_TAGS} tags.` });
          return;
        }
        await saveTagIDs([...selectedTagIDs, item.tag.id]);
      }
      setInlineTagMode(false);
      setInlineTagValue("");
      return;
    }
    if (item.type === "create" && item.name) {
      await handleInlineAddTag(item.name);
    }
  }, [handleInlineAddTag, saveTagIDs, selectedTagIDs, toast]);
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
    return () => {
      if (previewUpdateTimerRef.current) {
        window.clearTimeout(previewUpdateTimerRef.current);
      }
      if (scrollSyncTimerRef.current) {
        window.clearTimeout(scrollSyncTimerRef.current);
      }
    };
  }, []);

  const editorExtensions = useMemo(() => [
    markdown({
      codeLanguages: (info) => {
        const languageName = info.includes(':') ? info.split(':')[0] : info;
        return LanguageDescription.matchLanguageName(languages, languageName);
      },
      extensions: [
        {
          props: [
            styleTags({
              HeaderMark: tags.heading
            })
          ]
        }
      ]
    }),
    themeCompartment.of(getThemeById(currentThemeId).extension),
    EditorView.lineWrapping,
    keymap.of([indentWithTab]),
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
          // Check for [[ wikilink trigger
          const textBefore = lineText.slice(0, relativePos);
          const wikilinkMatch = textBefore.match(/\[\[([^\]\[]*)$/);
          if (wikilinkMatch) {
            const query = wikilinkMatch[1];
            const wlFrom = line.from + wikilinkMatch.index!;
            const coords = update.view.coordsAtPos(pos);
            if (coords) {
              startTransition(() => {
                setWikilinkMenu({ open: true, x: coords.left, y: coords.bottom + 5, query, from: wlFrom });
              });
            }
          } else {
            startTransition(() => {
              setWikilinkMenu(prev => prev.open ? { ...prev, open: false } : prev);
            });
          }

          startTransition(() => {
            setSlashMenu(prev => prev.open ? { ...prev, open: false } : prev);
          });
        }
      }
    }),
  ], [updateCursorInfo, currentThemeId]);


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
        
        .cm-editor { 
          font-family: 'JetBrains Mono', 'Fira Code', monospace !important; 
        }
        
        .cm-editor * {
          transition: none !important;
        }
        
        .prose h1, .prose h2, .prose h3 { margin-top: 1.5em; margin-bottom: 0.5em; }
        .prose p { margin-bottom: 1em; line-height: 1.7; }
        
        /* Hide Mermaid internal error messages */
        #mermaid-error-box, .mermaid-error-overlay, [id^="mermaid-error"] { display: none !important; }
        .mermaid-container > svg[id^="mermaid-"] { max-width: 100%; height: auto; }

      `}</style>
      <EditorHeader
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
            <div className="relative z-20 flex items-center bg-background border-b border-border shrink-0 px-3 h-8 gap-1.5 overflow-x-auto overflow-y-visible no-scrollbar">
              {selectedTags.length > 0 ? (
                <>
                  {selectedTags.map((tag) => (
                    <span
                      key={tag.id}
                      className="group relative inline-flex items-center px-2.5 h-6 rounded-full border border-slate-200 bg-white text-[11px] font-medium text-slate-700 whitespace-nowrap"
                      title={`#${tag.name}`}
                    >
                      {tag.name}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          toggleTag(tag.id);
                        }}
                        className="hidden group-hover:flex absolute -top-1 -right-1 h-3.5 w-3.5 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-400 hover:text-slate-700"
                        aria-label={`Remove ${tag.name}`}
                        title="Remove tag"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                </>
              ) : null}
              {selectedTags.length < MAX_TAGS && (
                inlineTagMode ? (
                  <div>
                    <input
                      ref={inlineTagInputRef}
                      value={inlineTagValue}
                      onChange={(event) => {
                        const raw = event.target.value;
                        if (inlineTagComposeRef.current) {
                          setInlineTagValue(raw);
                          return;
                        }
                        setInlineTagValue(raw.replace(/[^\p{Script=Han}A-Za-z0-9]/gu, "").slice(0, 16));
                      }}
                      onCompositionStart={() => {
                        inlineTagComposeRef.current = true;
                      }}
                      onCompositionEnd={(event) => {
                        inlineTagComposeRef.current = false;
                        const raw = event.currentTarget.value;
                        setInlineTagValue(raw.replace(/[^\p{Script=Han}A-Za-z0-9]/gu, "").slice(0, 16));
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowDown") {
                          event.preventDefault();
                          if (inlineTagDropdownItems.length === 0) return;
                          setInlineTagIndex((prev) => (prev + 1) % inlineTagDropdownItems.length);
                          return;
                        }
                        if (event.key === "ArrowUp") {
                          event.preventDefault();
                          if (inlineTagDropdownItems.length === 0) return;
                          setInlineTagIndex((prev) => (prev - 1 + inlineTagDropdownItems.length) % inlineTagDropdownItems.length);
                          return;
                        }
                        if (event.key === "Enter") {
                          event.preventDefault();
                          if (inlineTagDropdownItems.length > 0) {
                            void handleInlineTagSelect(inlineTagDropdownItems[inlineTagIndex]);
                            return;
                          }
                          void handleInlineAddTag();
                          return;
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          setInlineTagMode(false);
                          setInlineTagValue("");
                        }
                      }}
                      onBlur={() => {
                        window.setTimeout(() => {
                          setInlineTagMode(false);
                          setInlineTagValue("");
                        }, 120);
                      }}
                      placeholder="Tag name"
                      maxLength={16}
                      className="h-6 w-28 rounded-full border border-slate-300 bg-white px-2 text-[11px] outline-none focus:border-slate-500"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setInlineTagMode(true);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 transition-colors whitespace-nowrap"
                    title="Add tag"
                  >
                    <Tags className="h-3.5 w-3.5" />
                    Add tag
                  </button>
                )
              )}
              <div className="flex-1" />
              <button
                onClick={handleOpenQuickOpen}
                className="hidden md:inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-700 transition-colors whitespace-nowrap"
                title="Quick Open (Cmd+K)"
              >
                <Command className="h-3 w-3" />
                Open
              </button>
            </div>

            {typeof window !== "undefined" &&
              inlineTagMode &&
              inlineTagMenuPos &&
              (inlineTagLoading || inlineTagDropdownItems.length > 0) &&
              createPortal(
                <div
                  className="fixed z-[300] rounded-md border border-border bg-white shadow-lg p-1"
                  style={{ left: inlineTagMenuPos.left, top: inlineTagMenuPos.top, width: inlineTagMenuPos.width }}
                >
                  {inlineTagLoading ? (
                    <div className="px-2 py-1.5 text-[11px] text-slate-400">Searching...</div>
                  ) : (
                    inlineTagDropdownItems.map((item, index) => (
                      <button
                        key={item.key}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          void handleInlineTagSelect(item);
                        }}
                        className={`w-full text-left px-2 py-1.5 text-[11px] rounded ${index === inlineTagIndex ? "bg-muted text-foreground" : "hover:bg-muted/60 text-slate-700"}`}
                      >
                        {item.type === "create"
                          ? `Create #${item.name || ""}`
                          : `#${item.tag?.name || ""}`}
                      </button>
                    ))
                  )}
                </div>,
                document.body
              )}

            <EditorToolbar
              handleUndo={handleUndo}
              handleRedo={handleRedo}
              handleFormat={handleFormat}
              handleInsertTable={handleInsertTable}
              handleAiPolish={() => void handleAiPolish(contentRef.current)}
              handleAiGenerateOpen={handleAiGenerateOpen}
              handleAiTags={() => void handleAiTags(contentRef.current)}
              handlePreviewOpen={() => setShowPreviewModal(true)}
              aiBusy={aiLoading}
              activePopover={activePopover}
              setActivePopover={setActivePopover}
              colorButtonRef={colorButtonRef}
              sizeButtonRef={sizeButtonRef}
              emojiButtonRef={emojiButtonRef}
              currentTheme={currentThemeId}
              onThemeChange={handleThemeChange}
            />

            <div className="flex-1 overflow-hidden min-h-0">

              <CodeMirror
                value={content}
                height="100%"
                theme="none"
                extensions={editorExtensions}
                placeholder={`start by entering a title here
===

here is the body of note.`}
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

                  // Add keydown listener to view.dom in CAPTURE phase
                  if (editorKeydownHandlerRef.current) {
                    view.dom.removeEventListener("keydown", editorKeydownHandlerRef.current, true);
                  }
                  const keydownHandler = (e: KeyboardEvent) => {
                    if (slashKeydownRef.current(e)) {
                      e.preventDefault();
                      e.stopPropagation();
                      return;
                    }
                    if (wikilinkKeydownRef.current(e)) {
                      e.preventDefault();
                      e.stopPropagation();
                    }
                  };
                  editorKeydownHandlerRef.current = keydownHandler;
                  view.dom.addEventListener("keydown", keydownHandler, true);
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
                    {filteredSlashCommands.map((cmd, index) => (
                        <button
                          key={cmd.id}
                          onClick={() => handleSlashAction(cmd.action)}
                          onMouseEnter={() => setSlashIndex(index)}
                          className={`flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded-md text-left transition-colors ${
                            index === slashIndex
                              ? "bg-accent text-accent-foreground"
                              : "hover:bg-accent hover:text-accent-foreground"
                          }`}
                        >
                          <span className="opacity-70">{cmd.icon}</span>
                          <span className="font-medium">{cmd.label}</span>
                        </button>
                      ))}
                    {filteredSlashCommands.length === 0 && (
                      <div className="px-2 py-2 text-xs text-muted-foreground italic">No commands found</div>
                    )}
                  </div>
                </div>
              )}

              {/* Wikilink autocomplete menu */}
              {wikilinkMenu.open && (
                <div
                  className="fixed z-[60] bg-popover border border-border rounded-lg shadow-2xl p-1 w-56 animate-in fade-in zoom-in-95 duration-200"
                  style={{ left: wikilinkMenu.x, top: wikilinkMenu.y }}
                >
                  <div className="text-[10px] font-bold text-muted-foreground px-2 py-1 uppercase tracking-widest border-b border-border mb-1 flex items-center gap-1">
                    <FileText className="h-3 w-3" /> Link to Note
                  </div>
                  <div className="max-h-64 overflow-y-auto no-scrollbar">
                    {wikilinkLoading ? (
                      <div className="px-2 py-2 text-xs text-muted-foreground italic">Searching...</div>
                    ) : wikilinkResults.length > 0 ? (
                      wikilinkResults.map((doc, index) => (
                        <button
                          key={doc.id}
                          onClick={() => handleWikilinkSelect(doc.title, doc.id)}
                          className={`flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded-md hover:bg-accent hover:text-accent-foreground text-left transition-colors ${index === wikilinkIndex ? "bg-accent text-accent-foreground" : ""}`}
                        >
                          <FileText className="h-3.5 w-3.5 opacity-50 flex-shrink-0" />
                          <span className="font-medium truncate">{doc.title}</span>
                        </button>
                      ))
                    ) : (
                      <div className="px-2 py-2 text-xs text-muted-foreground italic">No documents found</div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>

          <div
            className="h-full bg-[#f8fafc] overflow-auto custom-scrollbar min-w-0 md:flex-[0_0_50%] w-full hidden md:block border-l border-border selection:bg-indigo-100"
            ref={previewRef}
            onScroll={handlePreviewScroll}
          >
            <div className="min-h-full p-4 md:p-8 lg:p-12">
              <div className="max-w-4xl mx-auto">
                <article className="w-full bg-white rounded-2xl shadow-[0_10px_40px_-15px_rgba(0,0,0,0.1)] border border-slate-200/50 relative overflow-visible">
                  <div className="p-6 md:p-10 lg:p-12">
                    <MarkdownPreview
                      content={previewContent}
                      className="markdown-body h-auto overflow-visible p-0 bg-transparent text-slate-800"
                      onTocLoaded={handleTocLoaded}
                      enableMentionHoverPreview
                    />
                  </div>
                </article>
              </div>
            </div>
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
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeTab === "summary" ? "border-b-2 border-foreground" : "text-muted-foreground"}`}
                onClick={() => setActiveTab("summary")}
              >
                Summary
              </button>
              <button
                className={`flex-1 py-3 text-[10px] sm:text-xs font-bold uppercase tracking-wider ${activeTab === "history" ? "border-b-2 border-foreground" : "text-muted-foreground"}`}
                onClick={() => { setActiveTab("history"); loadVersions(); }}
              >
                History
              </button>
              <button
                className={`flex-1 py-3 text-[10px] sm:text-xs font-bold uppercase tracking-wider ${activeTab === "share" ? "border-b-2 border-foreground" : "text-muted-foreground"}`}
                onClick={() => { setActiveTab("share"); loadShare(); }}
              >
                Share
              </button>

            </div>

            <div className="flex-1 overflow-y-auto p-4">
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
                    onClick={() => void handleAiSummary(contentRef.current)}
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
                    versions.map((v, index) => (
                      <div key={v.version} className="border border-border p-3 text-sm">
                        <div className="font-mono text-xs text-muted-foreground mb-1">
                          v{v.version} • {formatDate(v.ctime)}
                        </div>
                        <div className="font-bold mb-2 truncate">{v.title}</div>
                        {index === 0 ? (
                          <Button variant="outline" size="sm" className="w-full h-7 text-xs font-semibold tracking-wide" disabled>
                            CURRENT
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" className="w-full h-7" onClick={() => handleRevert(v)}>
                            Revert
                          </Button>
                        )}
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
                  {activeShare && (
                    <div className="space-y-3 rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Share Settings</div>
                        {shareConfigSaving && <div className="text-[10px] text-muted-foreground">Saving...</div>}
                      </div>
                      <div className="grid grid-cols-[84px_minmax(0,1fr)] items-center gap-x-2 gap-y-2">
                        <div className="text-[11px] text-muted-foreground">Expire At</div>
                        <div className="min-w-0 flex items-center gap-1.5">
                          <input
                            type="date"
                            value={shareExpiresAtInput}
                            onChange={(e) => handleShareExpireAtChange(e.target.value)}
                            onBlur={(e) => handleShareExpireAtChange(e.target.value)}
                            className="h-8 w-full min-w-0 rounded-md border border-border bg-background px-2 text-xs"
                          />
                        </div>

                        <div className="text-[11px] text-muted-foreground">Permission</div>
                        <select
                          value={sharePermission}
                          onChange={(e) => {
                            const next = e.target.value as "view" | "comment";
                            setSharePermission(next);
                            void saveShareConfig({ permission: next });
                          }}
                          className="h-8 w-full min-w-0 rounded-md border border-border bg-background px-2 text-xs"
                        >
                          <option value="view">View</option>
                          <option value="comment">Comment</option>
                        </select>

                        <div className="text-[11px] text-muted-foreground">Allow Download</div>
                        <label className="inline-flex items-center h-8">
                          <input
                            type="checkbox"
                            checked={shareAllowDownload}
                            onChange={(e) => {
                              const next = e.target.checked;
                              setShareAllowDownload(next);
                              void saveShareConfig({ allow_download: next });
                            }}
                          />
                        </label>

                        <div className="text-[11px] text-muted-foreground">Password</div>
                        <div className="min-w-0 relative">
                          <input
                            type="text"
                            value={sharePasswordInput}
                            maxLength={6}
                            inputMode="text"
                            autoComplete="off"
                            onChange={(e) => {
                              const sanitized = e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 6);
                              setSharePasswordInput(sanitized);
                            }}
                            onBlur={() => {
                              const next = sharePasswordInput.trim();
                              if (!next) return;
                              void saveShareConfig({ password: next });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const next = sharePasswordInput.trim();
                                if (!next) return;
                                void saveShareConfig({ password: next });
                              }
                            }}
                            placeholder="Set password"
                            className="h-8 w-full min-w-0 rounded-md border border-border bg-background px-2 pr-9 text-xs"
                          />
                          <button
                            type="button"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              setSharePasswordInput("");
                              void saveShareConfig({ clear_password: true });
                            }}
                            title="Clear password"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
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

      <EditorFooter
        cursorPos={cursorPos}
        wordCount={wordCount}
        charCount={charCount}
        hasUnsavedChanges={hasUnsavedChanges}
      />

      {
        similarIconVisible && (
          <div className={`fixed bottom-12 right-6 z-[100] transition-all duration-300 ${similarCollapsed ? "w-10 h-10" : "w-72 max-h-[400px]"} flex flex-col bg-background/80 backdrop-blur-md border border-border shadow-2xl rounded-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4`}>
            {similarCollapsed ? (
              <button
                onClick={handleToggleSimilar}
                className="w-full h-full flex items-center justify-center text-primary hover:bg-muted/50 transition-colors relative"
                title="Find similar notes"
              >
                <Sparkles className={`h-5 w-5 ${similarLoading ? "animate-pulse" : ""}`} />
                {similarDocs.length > 0 && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[8px] font-bold rounded-full flex items-center justify-center border-2 border-background">
                    {similarDocs.length}
                  </div>
                )}
              </button>
            ) : (
              <>
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
                  <div className="flex items-center gap-2">
                    <Sparkles className={`h-3.5 w-3.5 text-primary ${similarLoading ? "animate-spin" : ""}`} />
                    <span className="text-xs font-bold uppercase tracking-wider">Similar Notes</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleCollapseSimilar}
                      className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                      title="Collapse"
                    >
                      <ChevronRight className="h-3.5 w-3.5 rotate-90" />
                    </button>
                    <button
                      onClick={handleCloseSimilar}
                      className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                      title="Close"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2 no-scrollbar">
                  {similarLoading && similarDocs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                      <RefreshCw className="h-5 w-5 animate-spin opacity-50" />
                      <span className="text-[10px] font-mono uppercase tracking-widest">Searching...</span>
                    </div>
                  ) : similarDocs.length === 0 ? (
                    <div className="text-center py-12 text-sm text-muted-foreground">
                      No similar notes found.
                    </div>
                  ) : (
                    similarDocs.map((doc) => (
                      <div
                        key={doc.id}
                        onClick={() => handleOpenPreview(doc.id)}
                        className="p-3 border border-border rounded-xl cursor-pointer hover:border-primary transition-all bg-background/50 hover:bg-background group"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-tighter">
                            {Math.round((doc.score || 0) * 100)}% Match
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/docs/${doc.id}`);
                              }}
                              className="p-1 hover:bg-muted rounded-md transition-colors"
                              title="Open full page"
                            >
                              <ChevronRight className="h-3 w-3 text-muted-foreground" />
                            </button>
                          </div>
                        </div>
                        <div className="font-bold text-xs leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                          {doc.title || "Untitled"}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="px-3 py-2 border-t border-border bg-muted/10">
                  <p className="text-[9px] text-muted-foreground text-center italic">
                    Based on your current title
                  </p>
                </div>
              </>
            )}
          </div>
        )
      }

      {
        (previewDoc || previewLoading) && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-12">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setPreviewDoc(null)} />
            <div className="relative w-full max-w-4xl h-[80vh] bg-background border border-border rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/10">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <Home className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold truncate max-w-[200px] md:max-w-md">
                      {previewLoading ? "Loading..." : previewDoc?.title || "Untitled"}
                    </h3>
                    {!previewLoading && (
                      <p className="text-[10px] text-muted-foreground font-mono">PREVIEW MODE</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!previewLoading && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg text-xs"
                      onClick={() => router.push(`/docs/${previewDoc?.id}`)}
                    >
                      Open Full Note
                    </Button>
                  )}
                  <button
                    onClick={() => setPreviewDoc(null)}
                    className="h-8 w-8 flex items-center justify-center hover:bg-muted rounded-full transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 md:p-10 no-scrollbar bg-card/30">
                {previewLoading ? (
                  <div className="h-full flex flex-col items-center justify-center gap-4 text-muted-foreground">
                    <RefreshCw className="h-8 w-8 animate-spin opacity-20" />
                    <p className="text-xs font-mono tracking-widest uppercase">Fetching content</p>
                  </div>
                ) : (
                  <MarkdownPreview content={previewDoc?.content || ""} className="max-w-none prose-lg" enableMentionHoverPreview />
                )}
              </div>
            </div>
          </div>
        )
      }

      {
        showPreviewModal && (
          <div className="fixed inset-0 z-[190] flex items-center justify-center p-4 md:p-10">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowPreviewModal(false)} />
            <div className="relative w-full max-w-5xl h-[85vh] bg-background border border-border rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/10">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <Eye className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold truncate max-w-[200px] md:max-w-md">
                      {title || "Untitled"}
                    </h3>
                    <p className="text-[10px] text-muted-foreground font-mono">PREVIEW MODE</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPreviewModal(false)}
                  className="h-8 w-8 flex items-center justify-center hover:bg-muted rounded-full transition-colors"
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 md:p-10 no-scrollbar bg-card/30">
                <article className="w-full bg-white rounded-2xl shadow-[0_10px_40px_-15px_rgba(0,0,0,0.1)] border border-slate-200/50 relative overflow-visible">
                  <div className="p-6 md:p-10 lg:p-12">
                    <MarkdownPreview
                      content={contentRef.current || previewContent}
                      className="markdown-body h-auto overflow-visible p-0 bg-transparent text-slate-800"
                      onTocLoaded={handleTocLoaded}
                      enableMentionHoverPreview
                    />
                  </div>
                </article>
              </div>
            </div>
          </div>
        )
      }

      {
        aiModalOpen && (
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
                              className={`px-2 py-1 whitespace-pre-wrap ${line.type === "remove" ? "bg-rose-50 text-rose-700" : "bg-background"
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
                              className={`px-2 py-1 whitespace-pre-wrap ${line.type === "add" ? "bg-emerald-50 text-emerald-700" : "bg-background"
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
                    <MarkdownPreview content={aiResultText} className="prose prose-slate max-w-none" enableMentionHoverPreview />
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
                                className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${removed
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
                                className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${checked ? "bg-black text-white border-black" : "bg-background border-border"
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
                  <Button
                    onClick={() =>
                      void handleApplyAiTags({
                        findExistingTagByName,
                        mergeTags,
                        saveTagIDs,
                        onError: (message) => toast({ description: message, variant: "error" }),
                      })
                    }
                    disabled={aiLoading}
                  >
                    Apply Tags
                  </Button>
                )}
                {aiAction === "summary" && aiResultText && (
                  <Button
                    onClick={() =>
                      void handleApplyAiSummary({
                        onApplied: (summaryText) => {
                          setSummary(summaryText);
                          setLastSavedAt(Math.floor(Date.now() / 1000));
                        },
                        onError: (message) => toast({ description: message, variant: "error" }),
                      })
                    }
                    disabled={aiLoading}
                  >
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
        )
      }

      {
        showDeleteConfirm && (
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
        )
      }

      {
        showQuickOpen && (
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
        )
      }

      {
        !showDetails && (hasTocPanel || hasMentionsPanel || hasGraphPanel || hasSummaryPanel) && (
          <div className="fixed top-24 right-8 z-30 hidden w-72 rounded-2xl border border-slate-200/60 bg-white/80 shadow-2xl backdrop-blur-md xl:block animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/60">
              <div className="flex-1 min-w-0 overflow-x-auto no-scrollbar">
                <div className="flex items-center gap-1 pr-2">
                {hasTocPanel && (
                  <button
                    onClick={() => {
                      setFloatingPanelTab("toc");
                      setFloatingPanelTouched(true);
                    }}
                    className={`shrink-0 px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-wide transition-colors ${floatingPanelTab === "toc"
                      ? "bg-slate-900 text-white"
                      : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"}`}
                  >
                    TOC
                  </button>
                )}
                {hasMentionsPanel && (
                  <button
                    onClick={() => {
                      setFloatingPanelTab("mentions");
                      setFloatingPanelTouched(true);
                    }}
                    className={`shrink-0 px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-wide transition-colors ${floatingPanelTab === "mentions"
                      ? "bg-slate-900 text-white"
                      : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"}`}
                  >
                    Mentions
                  </button>
                )}
                {hasGraphPanel && (
                  <button
                    onClick={() => {
                      setFloatingPanelTab("graph");
                      setFloatingPanelTouched(true);
                    }}
                    className={`shrink-0 px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-wide transition-colors ${floatingPanelTab === "graph"
                      ? "bg-slate-900 text-white"
                      : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"}`}
                  >
                    Graph
                  </button>
                )}
                {hasSummaryPanel && (
                  <button
                    onClick={() => {
                      setFloatingPanelTab("summary");
                      setFloatingPanelTouched(true);
                    }}
                    className={`shrink-0 px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-wide transition-colors ${floatingPanelTab === "summary"
                      ? "bg-slate-900 text-white"
                      : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"}`}
                  >
                    Summary
                  </button>
                )}
                </div>
              </div>
              <button
                onClick={() => setTocCollapsed(!tocCollapsed)}
                className="shrink-0 p-1 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-all"
              >
                {tocCollapsed ? <Menu className="h-3 w-3" /> : <X className="h-3 w-3" />}
              </button>
            </div>
            {!tocCollapsed && (
              <div className="text-sm max-h-[60vh] overflow-y-auto p-4 custom-scrollbar">
                {floatingPanelTab === "toc" ? (
                  hasTocPanel ? (
                    <div className="toc-wrapper">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeRaw]}
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
                  ) : (
                    <div className="text-xs text-slate-400 italic">No TOC available for this note.</div>
                  )
                ) : floatingPanelTab === "mentions" ? (
                  backlinks.length === 0 ? (
                    <div className="text-xs text-slate-400 italic">No notes link back to this document yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {backlinks.map((link) => (
                        <button
                          key={link.id}
                          onClick={() => router.push(`/docs/${link.id}`)}
                          className="group w-full text-left p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 transition-colors"
                        >
                          <div className="font-bold text-xs text-slate-700 line-clamp-1 group-hover:text-indigo-600 transition-colors">
                            {link.title || "Untitled"}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-1">
                            {formatDate(link.mtime || link.ctime)}
                          </div>
                        </button>
                      ))}
                    </div>
                  )
                ) : floatingPanelTab === "graph" ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      <Network className="h-3 w-3" />
                      Link Graph
                    </div>
                    <div className="relative h-60 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/80">
                      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                        {linkGraph.edges.map((edge, index) => {
                          const from = linkGraph.positionByID[edge.from];
                          const to = linkGraph.positionByID[edge.to];
                          if (!from || !to) return null;
                          return (
                            <line
                              key={`${edge.from}-${edge.to}-${index}`}
                              x1={from.x}
                              y1={from.y}
                              x2={to.x}
                              y2={to.y}
                              stroke="rgba(100,116,139,0.45)"
                              strokeWidth="0.7"
                            />
                          );
                        })}
                      </svg>
                      {linkGraph.nodes.map((node) => (
                        <button
                          key={node.id}
                          disabled={node.kind === "current"}
                          onClick={() => {
                            if (node.kind !== "current") {
                              router.push(`/docs/${node.id}`);
                            }
                          }}
                          className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-lg border px-2 py-1 text-[10px] font-medium shadow-sm max-w-[84px] truncate ${node.kind === "current"
                            ? "border-indigo-500 bg-indigo-600 text-white"
                            : node.kind === "incoming"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300"
                              : node.kind === "outgoing"
                                ? "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300"
                                : "border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300"
                            }`}
                          style={{ left: `${node.x}%`, top: `${node.y}%` }}
                          title={node.title}
                        >
                          {node.title}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span>Inbound: {backlinks.length}</span>
                      <span>Outbound: {outboundLinks.length}</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-500">AI Summary</div>
                    <div className="text-xs leading-relaxed whitespace-pre-wrap text-slate-700">
                      {summary}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      }

      {
        activePopover === "color" &&
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
        )
      }

      {
        activePopover === "size" &&
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
        )
      }

      {
        activePopover === "emoji" &&
        renderPopover(
          <div className="p-3 bg-background border border-border rounded-lg shadow-xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-2 pb-2 border-b border-border">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">Insert Emoji</span>
              <Button size="icon" variant="ghost" className="h-4 w-4" onClick={() => setActivePopover(null)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              {EMOJI_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setEmojiTab(tab.key)}
                  title={tab.label}
                  aria-label={tab.label}
                  className={`h-8 w-8 flex items-center justify-center rounded-full border transition-colors ${tab.key === activeEmojiTab.key
                    ? "border-primary text-primary bg-primary/10"
                    : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                >
                  <span className="text-sm">{tab.icon}</span>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-8 gap-1 w-80 max-h-56 overflow-y-auto pr-1">
              {activeEmojiTab.items.map((emoji) => (
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
        )
      }
    </div >
  );
}
