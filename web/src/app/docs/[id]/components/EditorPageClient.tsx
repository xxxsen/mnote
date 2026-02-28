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
import { Input } from "@/components/ui/input";
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
  List,
  ListOrdered,
  ListTodo,
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
  FileText
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
import { useTagInput } from "../hooks/useTagInput";
import { useEditorLifecycle } from "../hooks/useEditorLifecycle";

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
  const { shareUrl, activeShare, copied, handleShare, loadShare, handleRevokeShare, handleCopyLink } = share;
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
  const [tabs, setTabs] = useState<{ id: string; title: string }[]>([]);

  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [starred, setStarred] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [activeTab, setActiveTab] = useState<"tags" | "summary" | "history" | "share" | "backlinks">("tags");
  const [currentThemeId, setCurrentThemeId] = useState<ThemeId>(loadThemePreference);

  const [versions, setVersions] = useState<DocumentVersionSummary[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTagIDs, setSelectedTagIDs] = useState<string[]>([]);
  const [backlinks, setBacklinks] = useState<MnoteDocument[]>([]);
  const [backlinksLoading, setBacklinksLoading] = useState(false);

  // Wikilink State Extension
  const [wikilinkIndex, setWikilinkIndex] = useState(0);

  const { similarDocs, similarLoading, similarCollapsed, similarIconVisible, handleToggleSimilar, handleCollapseSimilar, handleCloseSimilar } = useSimilarDocs({
    docId: id,
    title,
  });
  const [slashMenu, setSlashMenu] = useState<{ open: boolean; x: number; y: number; filter: string }>({ open: false, x: 0, y: 0, filter: "" });
  const [wikilinkMenu, setWikilinkMenu] = useState<{ open: boolean; x: number; y: number; query: string; from: number }>({ open: false, x: 0, y: 0, query: "", from: 0 });
  const [wikilinkResults, setWikilinkResults] = useState<{ id: string; title: string }[]>([]);
  const [wikilinkLoading, setWikilinkLoading] = useState(false);
  const wikilinkTimerRef = useRef<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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
  const [emojiTab, setEmojiTab] = useState(EMOJI_TABS[0].key);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

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
    setBacklinksLoading(true);
    try {
      const data = await apiFetch<MnoteDocument[]>(`/documents/${id}/backlinks`);
      setBacklinks(data || []);
    } catch {
      setBacklinks([]);
    } finally {
      setBacklinksLoading(false);
    }
  }, [id, setBacklinks, setBacklinksLoading]);

  useEffect(() => {
    void loadBacklinks();
  }, [loadBacklinks]);

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

  const {
    tagQuery,
    tagSearchLoading,
    tagDropdownIndex,
    trimmedTagQuery,
    tagDropdownItems,
    findExistingTagByName,
    handleTagInputChange,
    handleTagCompositionStart,
    handleTagCompositionEnd,
    handleTagInputKeyDown,
    handleTagDropdownSelect,
  } = useTagInput({
    allTags,
    selectedTagIDs,
    maxTags: MAX_TAGS,
    normalizeTagName,
    isValidTagName,
    mergeTags,
    searchTags: tagActions.searchTags,
    saveTagIDs,
    notify: (message) => toast({ description: message }),
    notifyError: (message) => toast({ description: message, variant: "error" }),
  });

  const handleApplyAiText = useCallback(() => {
    if (!aiResultText) {
      closeAiModal();
      return;
    }
    applyContent(aiResultText);
    closeAiModal();
  }, [aiResultText, applyContent, closeAiModal]);

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
                    />

                    {/* Backlinks Panel (Moved from Sidebar) */}
                    <div className="mt-16 pt-8 border-t border-slate-200">
                      <div className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-6 flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Linked Mentions
                      </div>

                      {backlinksLoading ? (
                        <div className="text-sm text-slate-400 animate-pulse">Loading links...</div>
                      ) : backlinks.length === 0 ? (
                        <div className="text-sm text-slate-400 italic">No notes link back to this document yet.</div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {backlinks.map((link) => (
                            <button
                              key={link.id}
                              onClick={() => router.push(`/docs/${link.id}`)}
                              className="group text-left p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 transition-all flex flex-col gap-2 relative overflow-hidden"
                            >
                              <div className="absolute top-0 left-0 w-1 h-full bg-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                              <div className="font-bold text-sm text-slate-700 line-clamp-1 group-hover:text-indigo-600 transition-colors">
                                {link.title || "Untitled"}
                              </div>
                              <div className="text-xs text-slate-400 font-mono">
                                {formatDate(link.mtime || link.ctime)}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
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
              {activeTab === "tags" && (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Search tag..."
                      value={tagQuery}
                      maxLength={16}
                      onChange={handleTagInputChange}
                      onCompositionStart={handleTagCompositionStart}
                      onCompositionEnd={handleTagCompositionEnd}
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
                          className={`inline-flex items-center gap-1 px-2 py-1 text-sm border rounded-full transition-colors cursor-pointer select-none ${selectedTagIDs.includes(tag.id)
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
                  <MarkdownPreview content={previewDoc?.content || ""} className="max-w-none prose-lg" />
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
        showFloatingToc && !showDetails && tocContent && (
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
