"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
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
  Eye,
  Columns,
  Edit3,
  Plus,
  RefreshCw,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

type Mode = "edit" | "split" | "preview";
const MODE_STORAGE_KEY = "mnote_editor_mode";

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [doc, setDoc] = useState<Document | null>(null);
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<Mode>("edit");
  const [modeReady, setModeReady] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [activeTab, setActiveTab] = useState<"tags" | "history" | "share">("tags");
  
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTagIDs, setSelectedTagIDs] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [activeShare, setActiveShare] = useState<Share | null>(null);

  const previewRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const scrollingSource = useRef<"editor" | "preview" | null>(null);

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
  }, [id, router]);

  const fetchTags = useCallback(async () => {
    try {
      const t = await apiFetch<Tag[]>("/tags");
      setAllTags(t || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(MODE_STORAGE_KEY) : null;
    if (stored === "edit" || stored === "split" || stored === "preview") {
      setMode(stored);
    }
    setModeReady(true);
    fetchDoc();
    fetchTags();
  }, [fetchDoc, fetchTags]);

  useEffect(() => {
    if (!modeReady) return;
    if (typeof window !== "undefined") {
      localStorage.setItem(MODE_STORAGE_KEY, mode);
    }
  }, [mode, modeReady]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (title) {
      document.title = title;
    } else {
      document.title = "MNOTE";
    }
  }, [title]);

  useEffect(() => {
    const preview = previewRef.current;
    if (preview) {
      preview.addEventListener("scroll", handlePreviewScroll);
      return () => preview.removeEventListener("scroll", handlePreviewScroll);
    }
  }, [mode, handlePreviewScroll]);

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

  const handleRevert = async (v: DocumentVersion) => {
    if (!confirm(`Revert to version from ${formatDate(v.ctime)}? Unsaved changes will be lost.`)) return;
    setContent(v.content);
    setTitle(v.title);
    await apiFetch(`/documents/${id}`, {
      method: "PUT",
      body: JSON.stringify({ title: v.title, content: v.content }),
    });
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
    <div className="flex flex-col h-screen bg-background">
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

        <div className="flex items-center gap-1 bg-muted p-1 rounded-sm">
           <button 
             onClick={() => setMode("edit")}
             className={`p-1.5 rounded-sm transition-colors ${mode === "edit" ? "bg-background shadow-sm" : "hover:text-foreground text-muted-foreground"}`}
             title="Edit"
           >
             <Edit3 className="h-4 w-4" />
           </button>
           <button 
             onClick={() => setMode("split")}
             className={`hidden md:block p-1.5 rounded-sm transition-colors ${mode === "split" ? "bg-background shadow-sm" : "hover:text-foreground text-muted-foreground"}`}
             title="Split"
           >
             <Columns className="h-4 w-4" />
           </button>
           <button 
             onClick={() => setMode("preview")}
             className={`p-1.5 rounded-sm transition-colors ${mode === "preview" ? "bg-background shadow-sm" : "hover:text-foreground text-muted-foreground"}`}
             title="Preview"
           >
             <Eye className="h-4 w-4" />
           </button>
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
          
          {(mode === "edit" || mode === "split") && (
             <div className={`h-full border-r border-border overflow-hidden min-w-0 ${mode === "split" ? "md:flex-[0_0_50%] w-full" : "w-full"}`}>
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
           )}

           {(mode === "preview" || mode === "split") && (
             <div className={`h-full bg-background overflow-hidden min-w-0 ${mode === "split" ? "md:flex-[0_0_50%] w-full hidden md:block" : "w-full"}`}>
                <MarkdownPreview content={content} className="overflow-auto" ref={previewRef} />
             </div>
           )}

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
    </div>
  );
}
