"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Check, ChevronDown, ChevronLeft, ChevronUp } from "lucide-react";

import { apiFetch } from "@/lib/api";
import type { DiffRow } from "@/lib/diff";
import { computeDiff } from "@/lib/diff";
import { formatDate } from "@/lib/utils";
import type { Document, DocumentVersion, DocumentVersionSummary } from "@/types";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { PageState } from "@/components/ui/page-state";
import { useToast } from "@/components/ui/toast";
import type { SaveDocumentResult } from "../types";
import { buildMobileDiffBlocks, isEditableEventTarget } from "./helpers";

type Router = { push: (path: string) => void };

function useRevertData(
  id: string,
  versionParam: string | null,
  versionID: string | null,
  router: Router,
) {
  const [doc, setDoc] = useState<Document | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<DocumentVersion | null>(null);
  const [diffRows, setDiffRows] = useState<DiffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const routerRef = useRef(router);

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    const controller = new AbortController();
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const docPromise = apiFetch<{ document: Document }>(
          `/documents/${id}`,
          { signal: controller.signal },
        );
        const parsedVersion = versionParam ? Number(versionParam) : NaN;
        const versionNumber = Number.isFinite(parsedVersion) && parsedVersion > 0
          ? parsedVersion
          : null;
        let version: DocumentVersion;
        let currentDoc: Document;

        if (!versionNumber && versionID) {
          const [docResponse, summaries] = await Promise.all([
            docPromise,
            apiFetch<DocumentVersionSummary[]>(
              `/documents/${id}/versions`,
              { signal: controller.signal },
            ),
          ]);
          const versionMeta = summaries.find((item) => item.id === versionID);
          if (!versionMeta) {
            routerRef.current.push(`/docs/${id}`);
            return;
          }
          currentDoc = docResponse.document;
          version = await apiFetch<DocumentVersion>(
            `/documents/${id}/versions/${versionMeta.version}`,
            { signal: controller.signal },
          );
        } else if (versionNumber) {
          const [docResponse, versionResponse] = await Promise.all([
            docPromise,
            apiFetch<DocumentVersion>(
              `/documents/${id}/versions/${versionNumber}`,
              { signal: controller.signal },
            ),
          ]);
          currentDoc = docResponse.document;
          version = versionResponse;
        } else {
          routerRef.current.push(`/docs/${id}`);
          return;
        }

        if (controller.signal.aborted) return;
        setDoc(currentDoc);
        setSelectedVersion(version);
        setDiffRows(computeDiff(currentDoc.content, version.content));
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load comparison");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    if (id && (versionParam || versionID)) void loadData();
    else if (id) routerRef.current.push(`/docs/${id}`);
    else setLoading(false);
    return () => controller.abort();
  }, [id, reloadToken, versionID, versionParam]);

  return {
    doc,
    selectedVersion,
    diffRows,
    loading,
    error,
    reload: useCallback(() => setReloadToken((value) => value + 1), []),
  };
}

function DiffNavigator({
  diffIndices,
  currentDiffIndex,
  onNavigate,
}: {
  diffIndices: number[];
  currentDiffIndex: number;
  onNavigate: (index: number) => void;
}) {
  if (diffIndices.length === 0) return null;
  return (
    <div className="flex items-center overflow-hidden rounded-md border border-border bg-background shadow-sm">
      <IconButton
        label="Previous change"
        variant="ghost"
        className="h-11 w-11 rounded-none md:h-10 md:w-10"
        disabled={currentDiffIndex <= 0}
        onClick={() => onNavigate(currentDiffIndex - 1)}
      >
        <ChevronUp className="h-4 w-4" aria-hidden="true" />
      </IconButton>
      <span className="min-w-16 border-x border-border px-3 text-center font-mono text-xs text-muted-foreground">
        {currentDiffIndex >= 0 ? currentDiffIndex + 1 : 0} / {diffIndices.length}
      </span>
      <IconButton
        label="Next change"
        variant="ghost"
        className="h-11 w-11 rounded-none md:h-10 md:w-10"
        disabled={currentDiffIndex >= diffIndices.length - 1}
        onClick={() => onNavigate(currentDiffIndex < 0 ? 0 : currentDiffIndex + 1)}
      >
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </IconButton>
    </div>
  );
}

function DiffCell({ cell, side }: {
  cell?: { value: string; type: string };
  side: "left" | "right";
}) {
  if (!cell) return <div className="min-w-0 flex-1 bg-muted/30" aria-hidden="true" />;
  const changed = cell.type === "removed" || cell.type === "added";
  const color = cell.type === "removed"
    ? "border-destructive/50 bg-destructive/10"
    : cell.type === "added"
      ? "border-success/50 bg-success/10"
      : "";
  return (
    <div className={`min-w-0 flex-1 border-l-4 ${changed ? color : "border-transparent"}`}>
      <pre className="whitespace-pre-wrap break-words px-3 py-1 font-mono text-sm leading-6">
        {cell.value || " "}
      </pre>
      <span className="sr-only">{side === "left" ? "Current" : "Selected version"} {cell.type}</span>
    </div>
  );
}

function DesktopDiff({ rows, version }: { rows: DiffRow[]; version: number }) {
  return (
    <section aria-label="Side-by-side document differences" className="hidden overflow-hidden rounded-xl border border-border bg-card md:flex md:flex-col">
      <div className="sticky top-0 z-10 flex border-b border-border bg-muted text-xs font-medium text-muted-foreground">
        <div className="flex-1 border-r border-border p-3">Current document</div>
        <div className="flex-1 p-3">Version v{version}</div>
      </div>
      <div className="min-h-0 overflow-auto">
        {rows.map((row, index) => (
          <div key={index} data-diff-index={index} className="flex min-w-[40rem] border-b border-border/50">
            <DiffCell cell={row.left} side="left" />
            <DiffCell cell={row.right} side="right" />
          </div>
        ))}
      </div>
    </section>
  );
}

function MobileDiff({ rows, version }: { rows: DiffRow[]; version: number }) {
  const blocks = useMemo(() => buildMobileDiffBlocks(rows), [rows]);
  return (
    <section aria-label="Stacked document differences" className="space-y-3 md:hidden">
      {blocks.map((block) => (
        <div
          key={block.startIndex}
          data-diff-index={block.startIndex}
          className="overflow-x-auto rounded-xl border border-border bg-card"
        >
          {block.kind === "context" ? (
            <div className="border-l-4 border-transparent p-3">
              <div className="mb-1 text-xs font-medium text-muted-foreground">Unchanged context</div>
              <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-6">
                {block.rows.map((row) => row.left?.value ?? row.right?.value ?? "").join("\n")}
              </pre>
            </div>
          ) : (
            <div className="grid">
              <div className="border-b border-destructive/20 bg-destructive/5 p-3">
                <div className="mb-1 text-xs font-semibold text-destructive">Current</div>
                <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-6">
                  {block.rows.flatMap((row) => row.left?.type === "removed" ? [row.left.value] : []).join("\n") || "—"}
                </pre>
              </div>
              <div className="bg-success/5 p-3">
                <div className="mb-1 text-xs font-semibold text-success">Version v{version}</div>
                <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-6">
                  {block.rows.flatMap((row) => row.right?.type === "added" ? [row.right.value] : []).join("\n") || "—"}
                </pre>
              </div>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

function TitleChange({
  currentTitle,
  versionTitle,
  version,
}: {
  currentTitle: string;
  versionTitle: string;
  version: number;
}) {
  return (
    <section aria-labelledby="title-change-heading" className="rounded-xl border border-border bg-card p-4">
      <h2 id="title-change-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
        Title change
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="mb-1 text-xs text-muted-foreground">Current</div>
          <div className="break-words rounded-md border border-destructive/30 bg-destructive/10 p-3">{currentTitle}</div>
        </div>
        <div>
          <div className="mb-1 text-xs text-muted-foreground">Version v{version}</div>
          <div className="break-words rounded-md border border-success/30 bg-success/10 p-3">{versionTitle}</div>
        </div>
      </div>
    </section>
  );
}

export default function RevertPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const id = params.id as string;
  const data = useRevertData(
    id,
    searchParams.get("version"),
    searchParams.get("versionId"),
    router,
  );
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [currentDiffIndex, setCurrentDiffIndex] = useState(-1);

  const diffIndices = useMemo(() => {
    const indices: number[] = [];
    let inDiffBlock = false;
    data.diffRows.forEach((row, index) => {
      const changed = row.left?.type === "removed" || row.right?.type === "added";
      if (changed && !inDiffBlock) indices.push(index);
      inDiffBlock = changed;
    });
    return indices;
  }, [data.diffRows]);

  const scrollToDiff = useCallback((index: number) => {
    if (index < 0 || index >= diffIndices.length) return;
    const rowIndex = diffIndices[index];
    const element = document.querySelector(`[data-diff-index="${rowIndex}"]`);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    setCurrentDiffIndex(index);
  }, [diffIndices]);

  useEffect(() => {
    if (diffIndices.length === 0) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableEventTarget(event.target)) return;
      if (event.key === "ArrowUp" && currentDiffIndex > 0) {
        event.preventDefault();
        scrollToDiff(currentDiffIndex - 1);
      } else if (event.key === "ArrowDown") {
        const nextIndex = currentDiffIndex < 0 ? 0 : currentDiffIndex + 1;
        if (nextIndex >= diffIndices.length) return;
        event.preventDefault();
        scrollToDiff(nextIndex);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentDiffIndex, diffIndices.length, scrollToDiff]);

  useEffect(() => {
    document.title = data.doc
      ? `Revert ${data.doc.title || "Untitled"} · Micro Note`
      : "Revert document · Micro Note";
  }, [data.doc]);

  const confirmRevert = async () => {
    if (!data.selectedVersion || !data.doc || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await apiFetch<SaveDocumentResult>(`/documents/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: data.selectedVersion.title,
          content: data.selectedVersion.content,
          base_revision: data.doc.content_revision,
          save_seq: data.doc.content_revision + 1,
        }),
      });
      if (!result.accepted) {
        toast({
          description: "The document changed. The comparison was refreshed; review it before restoring again.",
          variant: "error",
        });
        data.reload();
        return;
      }
      router.push(`/docs/${id}`);
    } catch {
      toast({ description: "Failed to restore this version.", variant: "error" });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (data.loading) {
    return <main className="flex min-h-dvh items-center" aria-label="Version comparison"><PageState kind="loading" title="Loading comparison…" /></main>;
  }
  if (data.error || !data.doc || !data.selectedVersion) {
    return (
      <main className="flex min-h-dvh items-center" aria-label="Version comparison">
        <PageState
          kind="error"
          title="Comparison could not be loaded"
          description={data.error || "The selected version is unavailable."}
          actionLabel="Retry"
          onAction={data.reload}
        />
      </main>
    );
  }

  const version = data.selectedVersion;
  const back = () => {
    if (!saving) router.push(`/docs/${id}`);
  };

  return (
    <div className="flex h-dvh min-w-0 flex-col overflow-hidden bg-background text-foreground">
      <header className="z-20 shrink-0 border-b border-border bg-card">
        <div className="flex min-h-14 items-center gap-2 px-3 sm:px-4">
          <IconButton label="Back to editor" variant="ghost" onClick={back} disabled={saving}>
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </IconButton>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">Revert {data.doc.title || "Untitled"}</h1>
            <p className="truncate text-xs text-muted-foreground">
              Current vs v{version.version} · {formatDate(version.ctime)}
            </p>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <Button variant="outline" onClick={back} disabled={saving}>Cancel</Button>
            <Button variant="destructive" onClick={() => void confirmRevert()} isLoading={saving}>
              <Check className="mr-2 h-4 w-4" aria-hidden="true" />
              Restore v{version.version}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-border p-2 md:hidden">
          <Button variant="outline" className="h-11" onClick={back} disabled={saving}>Cancel</Button>
          <Button variant="destructive" className="h-11" onClick={() => void confirmRevert()} isLoading={saving}>
            Restore v{version.version}
          </Button>
        </div>
      </header>
      <main aria-label={`Compare current document with version ${version.version}`} className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-muted/30 p-3 sm:p-4 lg:p-6">
        <div className="mx-auto max-w-7xl space-y-4">
          <div className="sticky top-0 z-10 flex justify-end rounded-lg bg-muted/90 p-2 backdrop-blur">
            <DiffNavigator diffIndices={diffIndices} currentDiffIndex={currentDiffIndex} onNavigate={scrollToDiff} />
          </div>
          {data.doc.title !== version.title ? (
            <TitleChange
              currentTitle={data.doc.title}
              versionTitle={version.title}
              version={version.version}
            />
          ) : null}
          {diffIndices.length === 0 ? (
            <div className="rounded-xl border border-border bg-card">
              <PageState kind="empty" title="No content differences" description="The selected version has the same content as the current document." />
            </div>
          ) : (
            <>
              <DesktopDiff rows={data.diffRows} version={version.version} />
              <MobileDiff rows={data.diffRows} version={version.version} />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
