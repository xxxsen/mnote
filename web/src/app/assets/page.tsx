"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { Asset } from "@/types";
import { ChevronLeft, Copy, ExternalLink, FileImage, FileText, Video } from "lucide-react";

type AssetReference = {
  document_id: string;
  title: string;
  mtime: number;
};

const formatSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const resolveAssetURL = (value: string) => {
  if (!value) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (!value.startsWith("/")) return value;
  const apiBase = process.env.NEXT_PUBLIC_API_BASE || "/api/v1";
  if (/^https?:\/\//i.test(apiBase)) {
    try {
      const origin = new URL(apiBase).origin;
      return `${origin}${value}`;
    } catch {
      return value;
    }
  }
  return value;
};

export default function AssetsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedID, setSelectedID] = useState<string>("");
  const [references, setReferences] = useState<AssetReference[]>([]);
  const [loadingReferences, setLoadingReferences] = useState(false);

  const selected = useMemo(() => assets.find((item) => item.id === selectedID) || null, [assets, selectedID]);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "200");
      const items = await apiFetch<Asset[]>(`/assets?${params.toString()}`);
      const next = items || [];
      setAssets(next);
      setSelectedID((prev) => {
        if (next.length === 0) return "";
        if (!prev) return next[0].id;
        if (next.find((item) => item.id === prev)) return prev;
        return next[0].id;
      });
    } catch (err) {
      toast({ description: err instanceof Error ? err.message : "Failed to load assets", variant: "error" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  useEffect(() => {
    const fetchReferences = async () => {
      if (!selected) {
        setReferences([]);
        return;
      }
      setLoadingReferences(true);
      try {
        const items = await apiFetch<AssetReference[]>(`/assets/${selected.id}/references`);
        setReferences(items || []);
      } catch (err) {
        toast({ description: err instanceof Error ? err.message : "Failed to load references", variant: "error" });
        setReferences([]);
      } finally {
        setLoadingReferences(false);
      }
    };
    void fetchReferences();
  }, [selected, toast]);

  const copyText = async (value: string, message: string) => {
    await navigator.clipboard.writeText(value);
    toast({ description: message });
  };

  const renderCardPreview = (asset: Asset) => {
    const resolvedURL = resolveAssetURL(asset.url);
    if (asset.content_type.startsWith("image/")) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={resolvedURL} alt={asset.name} className="h-28 w-full object-cover rounded-lg" />
      );
    }
    return (
      <div className="h-28 w-full rounded-md border border-border bg-muted/40 flex items-center justify-center">
        {asset.content_type.startsWith("video/") ? <Video className="h-6 w-6 text-muted-foreground" /> : <FileText className="h-6 w-6 text-muted-foreground" />}
      </div>
    );
  };

  const renderSelectedPreview = () => {
    if (!selected) return null;
    const resolvedURL = resolveAssetURL(selected.url);
    if (selected.content_type.startsWith("image/")) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={resolvedURL} alt={selected.name} className="max-h-56 w-full object-contain rounded-lg" />
      );
    }
    if (selected.content_type.startsWith("video/")) {
      return <video src={resolvedURL} controls className="max-h-56 w-full rounded-lg" />;
    }
    if (selected.content_type.startsWith("audio/")) {
      return <audio src={resolvedURL} controls className="w-full" />;
    }
    return (
      <div className="h-32 rounded-md border border-border bg-muted/40 flex items-center justify-center text-xs text-muted-foreground">
        <FileImage className="h-5 w-5 mr-2" />
        No preview available
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-6xl mx-auto flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => router.push("/docs")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold">Assets</h1>
        </div>
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-[1fr_360px] gap-4">
        <div className="border border-border rounded-xl bg-card p-3">
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading...</div>
          ) : assets.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No assets found.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {assets.map((asset) => {
                const active = asset.id === selectedID;
                return (
                  <button
                    key={asset.id}
                    className={`rounded-lg border border-border p-2 text-left transition-colors ${active ? "bg-primary/5 shadow-sm" : "hover:border-foreground/30"}`}
                    onClick={() => setSelectedID(asset.id)}
                  >
                    {renderCardPreview(asset)}
                    <div className="mt-2 text-xs font-semibold truncate">{asset.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{formatSize(asset.size)} · {asset.ref_count} refs</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="border border-border rounded-xl bg-card p-3 space-y-3 h-fit sticky top-6 self-start max-h-[calc(100vh-3rem)] overflow-y-auto">
          {!selected ? (
            <div className="text-sm text-muted-foreground">Select an asset card to view details.</div>
          ) : (
            <>
              <div className="text-sm font-semibold truncate">{selected.name}</div>
              <div className="text-xs text-muted-foreground break-all">{resolveAssetURL(selected.url)}</div>
              <div className="text-xs text-muted-foreground">{selected.content_type} · {formatSize(selected.size)}</div>
              {renderSelectedPreview()}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => void copyText(resolveAssetURL(selected.url), "Asset URL copied.")}>
                  <Copy className="h-3.5 w-3.5 mr-1" />
                  URL
                </Button>
                <Button size="sm" variant="outline" onClick={() => void copyText(`![${selected.name}](${resolveAssetURL(selected.url)})`, "Markdown snippet copied.")}>
                  <Copy className="h-3.5 w-3.5 mr-1" />
                  Markdown
                </Button>
                <a href={resolveAssetURL(selected.url)} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </a>
              </div>
              <div className="text-xs uppercase tracking-wide font-semibold text-muted-foreground mt-2">References</div>
              {loadingReferences ? (
                <div className="text-xs text-muted-foreground">Loading...</div>
              ) : references.length === 0 ? (
                <div className="text-xs text-muted-foreground">No references found.</div>
              ) : (
                references.map((ref) => (
                  <button
                    key={`${selected.id}-${ref.document_id}`}
                    className="w-full text-left rounded-lg border border-border p-2 hover:bg-muted"
                    onClick={() => router.push(`/docs/${ref.document_id}`)}
                  >
                    <div className="text-sm truncate">{ref.title}</div>
                    <div className="text-xs text-muted-foreground font-mono">{ref.document_id.slice(0, 8)}</div>
                  </button>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
