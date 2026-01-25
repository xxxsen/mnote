"use client";

import React, { useEffect, useState, useCallback, useRef, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
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
  Columns,
  Plus,
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
  X
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

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

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
  const [shareUrl, setShareUrl] = useState("");
  const [activeShare, setActiveShare] = useState<Share | null>(null);

  const [previewContent, setPreviewContent] = useState(content);
  const previewTimerRef = useRef<number | null>(null);
  const [, startTransition] = useTransition();
  const contentRef = useRef<string>("");

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
    if (lines.length < 2) return "";
    const first = lines[0].trim();
    const second = lines[1].trim();
    if (!first) return "";
    if (/^=+$/.test(second)) return first;
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
      setContent(detail.document.content);
      setPreviewContent(detail.document.content);
      const derivedTitle = extractTitleFromContent(detail.document.content);
      setTitle(derivedTitle);
      setSelectedTagIDs(detail.tag_ids || []);
    } catch (err) {
      console.error(err);
      alert("Document not found");
      router.push("/docs");
    } finally {
      setLoading(false);
    }
  }, [id, router, extractTitleFromContent]);

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
  }, [fetchDoc, fetchTags]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (title) {
      document.title = title;
    } else {
      document.title = "MNOTE";
    }
  }, [title]);


  const schedulePreviewUpdate = useCallback(() => {
    if (previewTimerRef.current) {
      window.clearTimeout(previewTimerRef.current);
    }
    previewTimerRef.current = window.setTimeout(() => {
      startTransition(() => {
        setPreviewContent(contentRef.current);
      });
    }, 900);
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
      const detail = await apiFetch<{ document: Document; tag_ids: string[] }>(`/documents/${id}`);
      setSelectedTagIDs(detail.tag_ids || []);
      setTitle(derivedTitle);
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
    try {
      const existing = allTags.find((tag) => tag.name === trimmed);
      if (existing) {
        if (!selectedTagIDs.includes(existing.id)) {
          setSelectedTagIDs([...selectedTagIDs, existing.id]);
        }
      } else {
        const created = await apiFetch<Tag>("/tags", {
          method: "POST",
          body: JSON.stringify({ name: trimmed }),
        });
        setAllTags([...allTags, created]);
        setSelectedTagIDs([...selectedTagIDs, created.id]);
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
    } else {
      setSelectedTagIDs([...selectedTagIDs, tagID]);
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
      if (previewTimerRef.current) {
        window.clearTimeout(previewTimerRef.current);
      }
    };
  }, []);

  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;

  return (
    <div className="flex flex-col h-screen bg-background relative">
      <header className="h-14 border-b border-border flex items-center px-4 gap-4 justify-between bg-background z-20">
        <div className="flex items-center gap-4 flex-1">
          <Button variant="ghost" size="icon" onClick={() => router.push("/docs")}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Input 
            value={title}
            readOnly
            placeholder="Title from markdown (first line + ===)"
            className="font-bold font-mono border-transparent max-w-md h-9 px-2 bg-transparent"
          />
        </div>

        <div className="flex items-center gap-2">
           <Button size="sm" onClick={handleSave} disabled={saving}>
             {saving ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
             Save
           </Button>
           <Button variant="ghost" size="icon" onClick={() => { setShowDetails(!showDetails); if (!showDetails) loadVersions(); }}>
             <Columns className="h-5 w-5 rotate-90" />
           </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden min-w-0">
        <div className={`flex-1 flex flex-col md:flex-row h-full transition-all duration-300 min-w-0 ${showDetails ? "mr-80" : ""}`}>
          
             <div className="h-full border-r border-border overflow-hidden min-w-0 md:flex-[0_0_50%] w-full flex flex-col relative">
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
                    <Button variant="ghost" size="icon" className={`h-8 w-8 shrink-0 hover:text-foreground ${activePopover === "color" ? "text-primary bg-accent" : "text-muted-foreground"}`} onClick={() => setActivePopover(activePopover === "color" ? null : "color")} title="Text Color"><Palette className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className={`h-8 w-8 shrink-0 hover:text-foreground ${activePopover === "size" ? "text-primary bg-accent" : "text-muted-foreground"}`} onClick={() => setActivePopover(activePopover === "size" ? null : "size")} title="Font Size"><Type className="h-4 w-4" /></Button>
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
                    <Button variant="ghost" size="icon" className={`h-8 w-8 shrink-0 hover:text-foreground ${activePopover === "emoji" ? "text-primary bg-accent" : "text-muted-foreground"}`} onClick={() => setActivePopover(activePopover === "emoji" ? null : "emoji")} title="Emoji"><Smile className="h-4 w-4" /></Button>
                  </div>
                </div>

                {activePopover && (
                  <div className="absolute top-12 left-2 z-50 p-3 bg-background border border-border rounded-lg shadow-xl animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex justify-between items-center mb-2 pb-2 border-b border-border">
                        <span className="text-xs font-bold uppercase text-muted-foreground">
                            {activePopover === "color" ? "Select Color" : activePopover === "size" ? "Select Size" : "Insert Emoji"}
                        </span>
                        <Button size="icon" variant="ghost" className="h-4 w-4" onClick={() => setActivePopover(null)}><X className="h-3 w-3" /></Button>
                    </div>
                    {activePopover === "emoji" && (
                        <div className="grid grid-cols-5 gap-1 w-64">
                            {EMOJIS.map(emoji => (
                                <button key={emoji} onClick={() => { insertTextAtCursor(emoji); setActivePopover(null); }} className="text-xl p-2 hover:bg-accent rounded transition-colors text-center">
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    )}
                    {activePopover === "color" && (
                        <div className="grid grid-cols-4 gap-2 w-48">
                            {COLORS.map(c => (
                                <button 
                                    key={c.value || "default"} 
                                    onClick={() => handleColor(c.value)}
                                    className="h-8 w-full rounded border border-input hover:scale-105 transition-transform flex items-center justify-center"
                                    style={{ backgroundColor: c.value || "transparent" }}
                                    title={c.label}
                                >
                                    {!c.value && <span className="text-xs">A</span>}
                                </button>
                            ))}
                        </div>
                    )}
                    {activePopover === "size" && (
                        <div className="flex flex-col gap-1 w-32">
                            {SIZES.map(s => (
                                <button 
                                    key={s.value} 
                                    onClick={() => handleSize(s.value)}
                                    className="text-sm px-2 py-1 hover:bg-accent rounded text-left transition-colors flex items-center gap-2"
                                >
                                    <span style={{ fontSize: s.value }}>Aa</span>
                                    <span className="text-xs text-muted-foreground ml-auto">{s.label}</span>
                                </button>
                            ))}
                        </div>
                    )}
                  </div>
                )}
                <div className="flex-1 overflow-hidden min-h-0">
                  <CodeMirror
                    value={content}
                    height="100%"
                  extensions={[markdown(), EditorView.lineWrapping]}
                  onChange={(val) => {
                    contentRef.current = val;
                    schedulePreviewUpdate();
                  }}
                  className="h-full w-full min-w-0 text-base"
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
              </div>
             </div>

              <div className="h-full bg-background overflow-hidden min-w-0 md:flex-[0_0_50%] w-full hidden md:block">
                  <MarkdownPreview 
                     content={previewContent} 
                     className="h-full overflow-auto p-4" 
                     ref={previewRef}
                     onScroll={handlePreviewScroll}
                     onTocLoaded={(toc) => setTocContent(toc)}
                  />
              </div>

        </div>

        {showDetails && (
           <div className="w-80 border-l border-border bg-background flex flex-col absolute right-0 top-14 bottom-0 z-30 shadow-xl">
             <div className="flex items-center border-b border-border">
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
                       onChange={(e) => setNewTag(e.target.value)}
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
                          <button
                            key={tag.id}
                            onClick={() => toggleTag(tag.id)}
                            className={`px-2 py-1 text-sm border ${
                              selectedTagIDs.includes(tag.id)
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-secondary text-secondary-foreground border-input"
                            }`}
                          >
                            #{tag.name}
                          </button>
                        ))
                      )}
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
                      <Button variant="outline" className="w-full" onClick={handleRevokeShare}>
                        <Share2 className="mr-2 h-4 w-4" />
                        Revoke Share Link
                      </Button>
                    ) : (
                      <Button onClick={handleShare} className="w-full">
                        <Share2 className="mr-2 h-4 w-4" />
                        Generate Share Link
                      </Button>
                    )}
                    {shareUrl && (
                      <div className="p-2 bg-muted border border-border break-all text-xs font-mono select-all">
                        {shareUrl}
                      </div>
                    )}
                   <div className="pt-4 border-t border-border mt-4">
                     <Button variant="outline" className="w-full mb-2" onClick={handleExport}>
                       <Download className="mr-2 h-4 w-4" />
                       Export Markdown
                     </Button>
                     <Button variant="destructive" className="w-full" onClick={handleDelete}>
                       <Trash2 className="mr-2 h-4 w-4" />
                       Delete Document
                     </Button>
                   </div>
                 </div>
               )}
             </div>
           </div>
        )}
      </div>

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
