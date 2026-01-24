"use client";

import React, { useEffect, useState, useCallback, useRef, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import ReactMarkdown from "react-markdown";
import { apiFetch } from "@/lib/api";
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
} from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [doc, setDoc] = useState<Document | null>(null);
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

  const previewRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const scrollingSource = useRef<"editor" | "preview" | null>(null);

  // TOC State
  const [tocContent, setTocContent] = useState("");
  const [showFloatingToc, setShowFloatingToc] = useState(false);

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

  const normalizeId = useCallback((value: string) => {
    return value.replace(/-\d+$/, "");
  }, []);

  const normalizeText = useCallback((value: string) => {
    return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
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
    });
  }, []);

  const fetchDoc = useCallback(async () => {
    try {
      const detail = await apiFetch<{ document: Document; tag_ids: string[] }>(`/documents/${id}`);
      setDoc(detail.document);
      setContent(detail.document.content);
      setTitle(extractTitleFromContent(detail.document.content));
      setSelectedTagIDs(detail.tag_ids || []);
    } catch (e) {
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

  useEffect(() => {
    if (previewTimerRef.current) {
      window.clearTimeout(previewTimerRef.current);
    }
    if (content === previewContent) {
      return;
    }
    previewTimerRef.current = window.setTimeout(() => {
      startTransition(() => {
        setPreviewContent(content);
      });
    }, 600);
    return () => {
      if (previewTimerRef.current) {
        window.clearTimeout(previewTimerRef.current);
      }
    };
  }, [content, previewContent]);

  // preview scroll handled via MarkdownPreview onScroll

  // TOC Visibility Effect
  useEffect(() => {
    const hasToken = /\[(toc|TOC)]/.test(content);
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
  }, [tocContent, content]);

  const handleSave = async () => {
    const derivedTitle = extractTitleFromContent(content);
    if (!derivedTitle) {
      alert("Please add a title using markdown heading (Title + ===)."
      );
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/documents/${id}`, {
        method: "PUT",
        body: JSON.stringify({ title: derivedTitle, content, tag_ids: selectedTagIDs }),
      });
      const detail = await apiFetch<{ document: Document; tag_ids: string[] }>(`/documents/${id}`);
      setDoc(detail.document);
      setSelectedTagIDs(detail.tag_ids || []);
      setTitle(derivedTitle);
    } catch (e) {
      alert("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this document?")) return;
    try {
      await apiFetch(`/documents/${id}`, { method: "DELETE" });
      router.push("/docs");
    } catch (e) {
      alert("Failed to delete");
    }
  };

  const handleExport = () => {
    const blob = new Blob([content], { type: "text/markdown" });
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
    } catch (e) {
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
    } catch (e) {
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
    } catch (e) {
      setActiveShare(null);
      setShareUrl("");
    }
  }, [id]);

  const handleRevokeShare = async () => {
    try {
      await apiFetch(`/documents/${id}/share`, { method: "DELETE" });
      setActiveShare(null);
      setShareUrl("");
    } catch (e) {
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
  }, [content, title]);

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
          
             <div className="h-full border-r border-border overflow-hidden min-w-0 md:flex-[0_0_50%] w-full">
                <CodeMirror
                  value={content}
                  height="100%"
                  extensions={[markdown(), EditorView.lineWrapping]}
                  onChange={(val) => {
                    setContent(val);
                    setTitle(extractTitleFromContent(val));
                  }}
                  className="h-full w-full min-w-0 text-base"
                  onCreateEditor={(view) => {
                    editorViewRef.current = view;
                    view.scrollDOM.addEventListener("scroll", handleEditorScroll);
                  }}
                  basicSetup={{
                    lineNumbers: true,
                    foldGutter: true,
                    highlightActiveLine: false,
                  }}
                />
             </div>

              <div className="h-full bg-background overflow-hidden min-w-0 md:flex-[0_0_50%] w-full hidden md:block">
                  <MarkdownPreview 
                     content={previewContent} 
                     className="h-full overflow-auto p-6" 
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
        <div className="fixed top-24 right-8 z-50 hidden w-64 rounded-xl border border-border bg-card/95 p-4 shadow-xl backdrop-blur-sm lg:block max-h-[70vh] overflow-y-auto animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="text-xs font-mono text-muted-foreground mb-2">目录</div>
          <div className="toc-wrapper text-sm">
            <ReactMarkdown
              components={{
                a: (props) => {
                  const href = props.href || "";
                  const raw = href.startsWith("#") ? href.slice(1) : "";
                  const decoded = raw ? decodeURIComponent(raw) : "";
                  const normalized = decoded ? decoded.normalize("NFKC") : "";
                  const candidates = [raw, decoded, normalized, slugify(decoded), slugify(normalized)].map(normalizeId);
                  
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
        </div>
      )}
    </div>
  );
}
