"use client";

import React, { useEffect, useState, useCallback, useRef, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView, placeholder } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { undo, redo } from "@codemirror/commands";
import ReactMarkdown from "react-markdown";
import { apiFetch, uploadFile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import MarkdownPreview from "@/components/markdown-preview";
import { Document, Tag, DocumentVersion, Share } from "@/types";
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
  Menu,
  Plus,
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
  Undo,
  Redo,
  X,
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

const SLASH_COMMANDS = [
  { id: "h1", label: "Heading 1", icon: <Heading1 className="h-4 w-4" />, action: (s: any) => s.handleFormat("line", "# ") },
  { id: "h2", label: "Heading 2", icon: <Heading2 className="h-4 w-4" />, action: (s: any) => s.handleFormat("line", "## ") },
  { id: "bold", label: "Bold", icon: <Bold className="h-4 w-4" />, action: (s: any) => s.handleFormat("wrap", "**", "**") },
  { id: "italic", label: "Italic", icon: <Italic className="h-4 w-4" />, action: (s: any) => s.handleFormat("wrap", "*", "*") },
  { id: "list", label: "Bullet List", icon: <List className="h-4 w-4" />, action: (s: any) => s.handleFormat("line", "- ") },
  { id: "numlist", label: "Numbered List", icon: <ListOrdered className="h-4 w-4" />, action: (s: any) => s.handleFormat("line", "1. ") },
  { id: "todo", label: "Todo List", icon: <ListTodo className="h-4 w-4" />, action: (s: any) => s.handleFormat("line", "- [ ] ") },
  { id: "code", label: "Code Block", icon: <FileCode className="h-4 w-4" />, action: (s: any) => s.handleFormat("wrap", "```\n", "\n```") },
  { id: "table", label: "Table", icon: <TableIcon className="h-4 w-4" />, action: (s: any) => s.handleInsertTable() },
  { id: "quote", label: "Quote", icon: <Quote className="h-4 w-4" />, action: (s: any) => s.handleFormat("line", "> ") },
  { id: "divider", label: "Divider", icon: <div className="h-0.5 w-4 bg-muted-foreground opacity-50" />, action: (s: any) => s.insertTextAtCursor("\n---\n") },
];

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const [id, setId] = useState(params.id as string);
  const [tabs, setTabs] = useState<{ id: string; title: string }[]>([]);

  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [activeTab, setActiveTab] = useState<"tags" | "history" | "share">("tags");
  
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTagIDs, setSelectedTagIDs] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [typewriterMode, setTypewriterMode] = useState(false);
  const [slashMenu, setSlashMenu] = useState<{ open: boolean; x: number; y: number; filter: string }>({ open: false, x: 0, y: 0, filter: "" });
  const [hoverImage, setHoverImage] = useState<{ url: string; x: number; y: number } | null>(null);
  const [showQuickOpen, setShowQuickOpen] = useState(false);
  const [otherDocs, setOtherDocs] = useState<Document[]>([]);
  const [shareUrl, setShareUrl] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activeShare, setActiveShare] = useState<Share | null>(null);
  const [copied, setCopied] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const isComposingRef = useRef(false);

  const [previewContent, setPreviewContent] = useState(content);
  const previewTimerRef = useRef<number | null>(null);
  const draftTimerRef = useRef<number | null>(null);
  const [, startTransition] = useTransition();
  const contentRef = useRef<string>("");
  const lastSavedContentRef = useRef<string>("");

  const previewRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const pasteHandlerRef = useRef<((event: ClipboardEvent) => void) | null>(null);
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
    if (scrollingSource.current === "preview") return;
    const view = editorViewRef.current;
    const preview = previewRef.current;
    if (!view || !preview) return;

    scrollingSource.current = "editor";
    
    const scrollInfo = view.scrollDOM;
    const maxScroll = scrollInfo.scrollHeight - scrollInfo.clientHeight;
    if (maxScroll <= 0) return;

    const percentage = scrollInfo.scrollTop / maxScroll;
    
    if (preview.scrollHeight > preview.clientHeight) {
        preview.scrollTop = percentage * (preview.scrollHeight - preview.clientHeight);
    }

    requestAnimationFrame(() => {
        scrollingSource.current = null;
    });
  }, []);

  const handlePreviewScroll = useCallback(() => {
    if (scrollingSource.current === "editor") return;
    const view = editorViewRef.current;
    const preview = previewRef.current;
    if (!view || !preview) return;

    const editorFocused = view.dom && document.activeElement ? view.dom.contains(document.activeElement) : false;
    if (editorFocused && !forcePreviewSyncRef.current) {
      return;
    }

    scrollingSource.current = "preview";

    const maxScroll = preview.scrollHeight - preview.clientHeight;
    if (maxScroll <= 0) return;

    const percentage = preview.scrollTop / maxScroll;
    
    const scrollInfo = view.scrollDOM;
    if (scrollInfo.scrollHeight > scrollInfo.clientHeight) {
         view.scrollDOM.scrollTop = percentage * (scrollInfo.scrollHeight - scrollInfo.clientHeight);
    }

    requestAnimationFrame(() => {
      scrollingSource.current = null;
      forcePreviewSyncRef.current = false;
    });
  }, []);

  const fetchDoc = useCallback(async () => {
    try {
      const detail = await apiFetch<{ document: Document; tag_ids: string[] }>(`/documents/${id}`);
      contentRef.current = detail.document.content;
      lastSavedContentRef.current = detail.document.content;
      setContent(detail.document.content);
      setPreviewContent(detail.document.content);
      setHasUnsavedChanges(false);
      const derivedTitle = extractTitleFromContent(detail.document.content);
      setTitle(derivedTitle);
      setSelectedTagIDs(detail.tag_ids || []);
      setLastSavedAt(detail.document.mtime);

      if (typeof window !== "undefined") {
        const draft = window.localStorage.getItem(`mnote:draft:${id}`);
        if (draft) {
          try {
            const parsed = JSON.parse(draft) as { content?: string };
            if (parsed.content && parsed.content !== detail.document.content) {
              contentRef.current = parsed.content;
              setContent(parsed.content);
              setPreviewContent(parsed.content);
              setTitle(extractTitleFromContent(parsed.content));
              setHasUnsavedChanges(true);
            }
          } catch {
            window.localStorage.removeItem(`mnote:draft:${id}`);
          }
        }
      }
    } catch (err) {
      console.error(err);
      alert("Document not found");
      router.push("/docs");
    } finally {
      setLoading(false);
    }
  }, [id, router, extractTitleFromContent]);

  const fetchOtherDocs = useCallback(async () => {
    try {
      const docs = await apiFetch<Document[]>("/documents?limit=20");
      setOtherDocs(docs || []);
    } catch (e) {
      console.error(e);
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

  const fetchTags = useCallback(async () => {
    try {
      const t = await apiFetch<Tag[]>("/tags");
      setAllTags(t || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchDoc();
    fetchTags();
    fetchOtherDocs();
  }, [fetchDoc, fetchTags, fetchOtherDocs]);

  useEffect(() => {
    const text = content || "";
    setCharCount(text.length);
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    setWordCount(words.length);
  }, [content]);

  const updateCursorInfo = useCallback((view: EditorView) => {
    const state = view.state;
    const pos = state.selection.main.head;
    const line = state.doc.lineAt(pos);
    setCursorPos({
      line: line.number,
      col: pos - line.from + 1
    });
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = title ? `${title} - Micro Note` : "micro note";
  }, [title]);


  const schedulePreviewUpdate = useCallback(() => {
    if (previewTimerRef.current) {
      window.clearTimeout(previewTimerRef.current);
    }
    previewTimerRef.current = window.setTimeout(() => {
      startTransition(() => {
        setPreviewContent(contentRef.current);
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
      setHasUnsavedChanges(contentRef.current !== lastSavedContentRef.current);
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
        const contentType = result.content_type || file.type || "";
        const name = result.name || file.name || "file";
        const markdown = contentType.startsWith("image/")
          ? `![PIC:${name}](${result.url})`
          : `[FILE:${name}](${result.url})`;
        replacePlaceholder(placeholder, markdown);
      } catch (err) {
        console.error(err);
        replacePlaceholder(placeholder, "");
        alert("Upload failed");
      }
    },
    [insertTextAtCursor, randomString, replacePlaceholder]
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

  const handleSlashAction = useCallback((action: (s: any) => void) => {
    const view = editorViewRef.current;
    if (!view) return;
    
    const { from, to } = view.state.selection.main;
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
        body: JSON.stringify({ title: derivedTitle, content: latestContent, tag_ids: selectedTagIDs }),
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
  }, [extractTitleFromContent, id, saving, selectedTagIDs]);

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
      alert("Please add a title using markdown heading (Title + ===)."
      );
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/documents/${id}`, {
        method: "PUT",
        body: JSON.stringify({ title: derivedTitle, content: latestContent, tag_ids: selectedTagIDs }),
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
      alert("Failed to save");
    } finally {
      setSaving(false);
    }
  }, [extractTitleFromContent, id, selectedTagIDs]);

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this document?")) return;
    try {
      await apiFetch(`/documents/${id}`, { method: "DELETE" });
      router.push("/docs");
    } catch (err) {
      console.error(err);
      alert("Failed to delete");
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
      const v = await apiFetch<DocumentVersion[]>(`/documents/${id}/versions`);
      setVersions(v);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRevert = (v: DocumentVersion) => {
    router.push(`/docs/${id}/revert?versionId=${v.id}`);
  };

  const handleAddTag = async () => {
    const trimmed = newTag.trim();
    if (!trimmed) return;
    
    // Validate length properly before attempting to create
    if (Array.from(trimmed).length > 16) {
       alert("Tag is too long (max 16 characters)");
       return;
    }

    if (!/^[\p{Script=Han}A-Za-z0-9]{1,16}$/u.test(trimmed)) {
      alert("Tags must be letters, numbers, or Chinese characters, and at most 16 characters.");
      return;
    }
    
    const existing = allTags.find((tag) => tag.name === trimmed);
    const willSelect = !existing || !selectedTagIDs.includes(existing.id);

    if (willSelect && selectedTagIDs.length >= 7) {
      alert("You can only select up to 7 tags.");
      return;
    }

    try {
      if (existing) {
        if (!selectedTagIDs.includes(existing.id)) {
          setSelectedTagIDs([...selectedTagIDs, existing.id]);
          setHasUnsavedChanges(true);
        }
      } else {
        const created = await apiFetch<Tag>("/tags", {
          method: "POST",
          body: JSON.stringify({ name: trimmed }),
        });
        setAllTags([...allTags, created]);
        setSelectedTagIDs([...selectedTagIDs, created.id]);
        setHasUnsavedChanges(true);
      }
      setNewTag("");
    } catch (err) {
      console.error(err);
      alert("Failed to add tag");
    }
  };

  const toggleTag = (tagID: string) => {
    if (selectedTagIDs.includes(tagID)) {
      setSelectedTagIDs(selectedTagIDs.filter((id) => id !== tagID));
      setHasUnsavedChanges(true);
    } else {
      if (selectedTagIDs.length >= 7) {
        alert("You can only select up to 7 tags.");
        return;
      }
      setSelectedTagIDs([...selectedTagIDs, tagID]);
      setHasUnsavedChanges(true);
    }
  };


  const handleShare = async () => {
    try {
      const res = await apiFetch<Share>(`/documents/${id}/share`, { method: "POST" });
      setActiveShare(res);
      const url = `${window.location.origin}/share/${res.token}`;
      setShareUrl(url);
    } catch (err) {
      console.error(err);
      alert("Failed to create share link");
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
      alert("Failed to revoke share link");
    }
  };

  const handleCopyLink = useCallback(() => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareUrl]);

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
        .cm-scroller { scroll-behavior: smooth; }
        
        .prose h1, .prose h2, .prose h3 { margin-top: 1.5em; margin-bottom: 0.5em; }
        .prose p { margin-bottom: 1em; line-height: 1.7; }
      `}</style>
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
            <Button size="sm" onClick={handleSave} disabled={saving || !hasUnsavedChanges} className="rounded-xl h-8 text-xs font-bold px-3">
              {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => { setShowDetails(!showDetails); if (!showDetails) loadVersions(); }} className={`h-8 w-8 ${showDetails ? "bg-accent text-foreground" : "text-muted-foreground"}`}>
              <Columns className="h-4 w-4 rotate-90" />
            </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden min-w-0 relative">
        <div className={`flex-1 flex flex-col md:flex-row h-full transition-all duration-300 min-w-0 ${showDetails ? "mr-80" : ""}`}>
          
              <div className="h-full border-r border-border overflow-hidden min-w-0 md:flex-[0_0_50%] w-full flex flex-col relative">
                 <div className="flex items-center gap-1 px-1 pt-1 bg-muted/30 border-b border-border overflow-x-auto no-scrollbar shrink-0">
                    {tabs.map(tab => (
                       <div 
                          key={tab.id}
                          onClick={() => { if (tab.id !== id) router.push(`/docs/${tab.id}`); }}
                          className={`group flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-t-lg border-x border-t transition-all cursor-pointer select-none ${tab.id === id ? "bg-background border-border text-foreground" : "bg-transparent border-transparent text-muted-foreground hover:bg-muted"}`}
                       >
                          <span className="truncate max-w-[100px]">{tab.title || "Untitled"}</span>
                          {tabs.length > 1 && (
                             <button 
                                onClick={(e) => {
                                   e.stopPropagation();
                                   const nextTabs = tabs.filter(t => t.id !== tab.id);
                                   setTabs(nextTabs);
                                   if (tab.id === id && nextTabs.length > 0) router.push(`/docs/${nextTabs[0].id}`);
                                }}
                                className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                             >
                                <X className="h-3 w-3" />
                             </button>
                          )}
                       </div>
                    ))}
                    <button 
                       onClick={() => setShowQuickOpen(true)}
                       className="px-2 py-1.5 text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                       title="Quick Open (Cmd+K)"
                    >
                       <Command className="h-3 w-3" />
                       <span className="text-[9px] font-bold">OPEN</span>
                    </button>
                 </div>
                 <div className="flex items-center gap-1 p-2 border-b border-border bg-background/50 backdrop-blur-sm sticky top-0 z-10 flex-none overflow-x-auto no-scrollbar">

                   <div className="flex items-center gap-0.5">
                     <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" onClick={handleUndo} title="Undo"><Undo className="h-4 w-4" /></Button>
                     <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" onClick={handleRedo} title="Redo"><Redo className="h-4 w-4" /></Button>
                   </div>
                   <div className="w-px h-4 bg-border mx-1 shrink-0" />

                   <div className="flex items-center gap-0.5">
                     <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => handleFormat("line", "# ")} title="Heading 1"><Heading1 className="h-4 w-4" /></Button>
                     <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => handleFormat("line", "## ")} title="Heading 2"><Heading2 className="h-4 w-4" /></Button>
                   </div>
                   <div className="w-px h-4 bg-border mx-1 shrink-0" />

                   <div className="flex items-center gap-0.5">
                     <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => handleFormat("wrap", "**", "**")} title="Bold"><Bold className="h-4 w-4" /></Button>
                     <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => handleFormat("wrap", "*", "*")} title="Italic"><Italic className="h-4 w-4" /></Button>
                     <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => handleFormat("wrap", "~~", "~~")} title="Strikethrough"><Strikethrough className="h-4 w-4" /></Button>
                     <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => handleFormat("wrap", "<u>", "</u>")} title="Underline"><UnderlineIcon className="h-4 w-4" /></Button>
                     <div className="relative">
                        <Button 
                           variant="ghost" 
                           size="icon" 
                           className={`h-8 w-8 shrink-0 hover:text-foreground ${activePopover === "color" ? "text-primary bg-accent" : "text-muted-foreground"}`} 
                           onClick={() => setActivePopover(activePopover === "color" ? null : "color")} 
                           title="Text Color"
                        >
                           <Palette className="h-4 w-4" />
                        </Button>
                        {activePopover === "color" && (
                           <div className="absolute top-full left-0 mt-2 z-50 p-3 bg-background border border-border rounded-lg shadow-xl animate-in fade-in zoom-in-95 duration-200">
                              <div className="flex justify-between items-center mb-2 pb-2 border-b border-border">
                                 <span className="text-[10px] font-bold uppercase text-muted-foreground">Select Color</span>
                                 <Button size="icon" variant="ghost" className="h-4 w-4" onClick={() => setActivePopover(null)}><X className="h-3 w-3" /></Button>
                              </div>
                              <div className="grid grid-cols-4 gap-2 w-48">
                                 {COLORS.map(c => (
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
                     </div>
                     <div className="relative">
                        <Button 
                           variant="ghost" 
                           size="icon" 
                           className={`h-8 w-8 shrink-0 hover:text-foreground ${activePopover === "size" ? "text-primary bg-accent" : "text-muted-foreground"}`} 
                           onClick={() => setActivePopover(activePopover === "size" ? null : "size")} 
                           title="Font Size"
                        >
                           <Type className="h-4 w-4" />
                        </Button>
                        {activePopover === "size" && (
                           <div className="absolute top-full left-0 mt-2 z-50 p-3 bg-background border border-border rounded-lg shadow-xl animate-in fade-in zoom-in-95 duration-200">
                              <div className="flex justify-between items-center mb-2 pb-2 border-b border-border">
                                 <span className="text-[10px] font-bold uppercase text-muted-foreground">Select Size</span>
                                 <Button size="icon" variant="ghost" className="h-4 w-4" onClick={() => setActivePopover(null)}><X className="h-3 w-3" /></Button>
                              </div>
                              <div className="flex flex-col gap-1 w-32">
                                 {SIZES.map(s => (
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
                     </div>
                   </div>
                   <div className="w-px h-4 bg-border mx-1 shrink-0" />

                   <div className="flex items-center gap-0.5">
                     <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => handleFormat("line", "- ")} title="Bullet List"><List className="h-4 w-4" /></Button>
                     <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => handleFormat("line", "1. ")} title="Ordered List"><ListOrdered className="h-4 w-4" /></Button>
                     <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => handleFormat("line", "- [ ] ")} title="Todo List"><ListTodo className="h-4 w-4" /></Button>
                     <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => handleFormat("line", "> ")} title="Quote"><Quote className="h-4 w-4" /></Button>
                   </div>
                   <div className="w-px h-4 bg-border mx-1 shrink-0" />

                   <div className="flex items-center gap-0.5">
                     <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => handleFormat("wrap", "`", "`")} title="Inline Code"><Code className="h-4 w-4" /></Button>
                     <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => handleFormat("wrap", "```\n", "\n```")} title="Code Block"><FileCode className="h-4 w-4" /></Button>
                     <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => handleFormat("wrap", "[", "](url)")} title="Link"><LinkIcon className="h-4 w-4" /></Button>
                     <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" onClick={handleInsertTable} title="Table"><TableIcon className="h-4 w-4" /></Button>
                     <div className="relative">
                        <Button 
                           variant="ghost" 
                           size="icon" 
                           className={`h-8 w-8 shrink-0 hover:text-foreground ${activePopover === "emoji" ? "text-primary bg-accent" : "text-muted-foreground"}`} 
                           onClick={() => setActivePopover(activePopover === "emoji" ? null : "emoji")} 
                           title="Emoji"
                        >
                           <Smile className="h-4 w-4" />
                        </Button>
                        {activePopover === "emoji" && (
                           <div className="absolute top-full right-0 mt-2 z-50 p-3 bg-background border border-border rounded-lg shadow-xl animate-in fade-in zoom-in-95 duration-200">
                              <div className="flex justify-between items-center mb-2 pb-2 border-b border-border">
                                 <span className="text-[10px] font-bold uppercase text-muted-foreground">Insert Emoji</span>
                                 <Button size="icon" variant="ghost" className="h-4 w-4" onClick={() => setActivePopover(null)}><X className="h-3 w-3" /></Button>
                              </div>
                              <div className="grid grid-cols-5 gap-1 w-64">
                                 {EMOJIS.map(emoji => (
                                    <button key={emoji} onClick={() => { insertTextAtCursor(emoji); setActivePopover(null); }} className="text-xl p-2 hover:bg-accent rounded-lg transition-colors text-center">
                                          {emoji}
                                    </button>
                                 ))}
                              </div>
                           </div>
                        )}
                     </div>
                   </div>
                 </div>

                 <div className="flex-1 overflow-hidden min-h-0">

                   <CodeMirror
                     key={`editor-${typewriterMode}`}
                     value={content}
                     height="100%"
                   extensions={[
                     markdown(), 
                     EditorView.lineWrapping, 
                     EditorView.domEventHandlers({
                       mousemove: (event, view) => {
                         const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
                         if (pos === null) {
                           setHoverImage(null);
                           return;
                         }
                         const line = view.state.doc.lineAt(pos);
                         const lineText = line.text;
                         const imgRegex = /!\[.*?\]\((.*?)\)/g;
                         let match;
                         while ((match = imgRegex.exec(lineText)) !== null) {
                           const start = line.from + match.index;
                           const end = start + match[0].length;
                           if (pos >= start && pos <= end) {
                             setHoverImage({ url: match[1], x: event.clientX, y: event.clientY });
                             return;
                           }
                         }
                         setHoverImage(null);
                       },
                       mouseleave: () => setHoverImage(null),
                     }),
                     EditorView.scrollMargins.of((view) => {
                        if (!typewriterMode) return null;
                        const height = view.scrollDOM.clientHeight;
                        return { top: height / 2 - 10, bottom: height / 2 - 10 };
                     }),
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
                                     setSlashMenu({
                                        open: true,
                                        x: coords.left,
                                        y: coords.bottom + 5,
                                        filter: filter
                                     });
                                     return;
                                  }
                               }
                            }
                            setSlashMenu(prev => ({ ...prev, open: false }));
                         }
                       }
                     }),
                     placeholder("start by entering a title here\n===\n\nhere is the body of note.")
                   ]}
                    onChange={(val) => {
                      contentRef.current = val;
                      setContent(val);
                      setHasUnsavedChanges(contentRef.current !== lastSavedContentRef.current);
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

                 
                 {hoverImage && (
                    <div 
                      className="fixed z-[70] pointer-events-none p-1 bg-background border border-border rounded-lg shadow-2xl animate-in fade-in zoom-in-95 duration-200"
                      style={{ left: hoverImage.x + 20, top: hoverImage.y - 100 }}
                    >
                       {/* eslint-disable-next-line @next/next/no-img-element */}
                       <img src={hoverImage.url} alt="Preview" className="max-w-[200px] max-h-[200px] rounded object-contain" />
                    </div>
                 )}
                 
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
                     className="h-full overflow-auto p-4" 
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
                         placeholder="New tag..." 
                         value={newTag} 
                         maxLength={16}
                         onChange={(e) => {
                           const raw = e.target.value;
                           if (isComposingRef.current) {
                             setNewTag(raw);
                             return;
                           }
                           const filtered = raw.replace(/[^\p{Script=Han}A-Za-z0-9]/gu, "");
                           setNewTag(filtered);
                         }}
                         onCompositionStart={() => {

                          isComposingRef.current = true;
                        }}
                         onCompositionEnd={(e) => {
                           isComposingRef.current = false;
                           const raw = e.currentTarget.value;
                           const filtered = raw.replace(/[^\p{Script=Han}A-Za-z0-9]/gu, "");
                           setNewTag(filtered.slice(0, 16));
                         }}
                         onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                       />

                     <Button size="icon" variant="secondary" onClick={handleAddTag}>
                       <Plus className="h-4 w-4" />
                     </Button>
                   </div>
                    <div className="flex flex-wrap gap-2">
                      {allTags.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No tags yet</div>
                      ) : (
                        allTags.map((tag) => (
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
                        Delete Document
                      </Button>
                    </div>
                  </div>
                )}

             </div>
           </div>
        )}
      </div>

      <footer className={`h-8 border-t border-border bg-background/50 backdrop-blur-sm flex items-center px-4 justify-between text-[10px] font-mono text-muted-foreground z-20 transition-all duration-300`}>
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
          <div className="flex items-center gap-1.5 hover:text-foreground cursor-pointer transition-colors" onClick={() => setTypewriterMode(!typewriterMode)}>
            <span className={typewriterMode ? "text-primary" : "opacity-50"}>TYPEWRITER</span>
          </div>
        </div>
      </footer>

      {showDeleteConfirm && (
         <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
            <div className="relative w-full max-w-sm bg-background border border-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
               <div className="p-6 text-center">
                  <div className="w-12 h-12 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto mb-4">
                     <AlertTriangle className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-bold mb-2">Delete Document?</h3>
                  <p className="text-sm text-muted-foreground mb-6">
                     This action cannot be undone. All versions of <span className="font-mono font-bold text-foreground">"{title || "Untitled"}"</span> will be permanently removed.
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
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowQuickOpen(false)} />
            <div className="relative w-full max-w-lg bg-popover border border-border rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
               <div className="flex items-center px-4 py-3 border-b border-border gap-3">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <input 
                     autoFocus
                     placeholder="Quick open document..."
                     className="bg-transparent border-none focus:ring-0 text-sm flex-1 outline-none"
                     onKeyDown={(e) => e.key === "Escape" && setShowQuickOpen(false)}
                  />
                  <X className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => setShowQuickOpen(false)} />
               </div>
                     <div className="max-h-[50vh] overflow-y-auto p-2">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-2 py-2">Switch to Document</div>
                  {otherDocs.length === 0 ? (

                     <div className="px-2 py-4 text-sm text-muted-foreground italic">No other documents found</div>
                  ) : (
                     <div className="space-y-0.5">
                        {otherDocs.map(doc => (
                           <button
                              key={doc.id}
                              onClick={() => {
                                 router.push(`/docs/${doc.id}`);
                                 setShowQuickOpen(false);
                              }}
                              className="flex items-center w-full px-3 py-2 text-sm rounded-lg hover:bg-accent hover:text-accent-foreground text-left transition-colors group"
                           >
                              <div className="flex flex-col min-w-0">
                                 <span className="font-medium truncate">{doc.title || "Untitled"}</span>
                                 <span className="text-[10px] text-muted-foreground truncate">{formatDate(doc.mtime)}</span>
                              </div>
                              <ChevronRight className="h-3.5 w-3.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                           </button>
                        ))}
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
        <div className="fixed top-24 right-8 z-50 hidden w-64 rounded-xl border border-border bg-card/95 shadow-xl backdrop-blur-sm lg:block animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
            <div className="text-xs font-mono text-muted-foreground">目录</div>
            <button
              onClick={() => setTocCollapsed(!tocCollapsed)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {tocCollapsed ? "展开" : "收起"}
            </button>
          </div>
          {!tocCollapsed && (
            <div className="toc-wrapper text-sm max-h-[60vh] overflow-y-auto p-3">
              <ReactMarkdown
              components={{
                a: (props) => {
                  const href = props.href || "";
                  
                  return (
                    <a
                      {...props}
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
    </div>
  );
}
