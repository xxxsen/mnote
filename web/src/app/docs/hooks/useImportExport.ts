import { useCallback, useState } from "react";
import { apiFetch, getAuthToken, removeAuthToken, ApiError } from "@/lib/api";
import type { ImportStep, ImportMode, ImportSource, ImportPreview, ImportReport } from "../types";

type ToastVariant = "default" | "success" | "error";

interface UseImportExportDeps {
  fetchSummary: () => Promise<void>;
  fetchTags: (query: string) => Promise<void>;
  fetchSidebarTags: (offset: number, append: boolean, query: string) => Promise<void>;
  tagSearch: string;
  toast: (opts: { description: string | Error; variant?: ToastVariant }) => void;
}

export function useImportExport(deps: UseImportExportDeps) {
  const { fetchSummary, fetchTags, fetchSidebarTags, tagSearch, toast } = deps;
  const [importOpen, setImportOpen] = useState(false);
  const [importStep, setImportStep] = useState<ImportStep>("upload");
  const [importMode, setImportMode] = useState<ImportMode>("append");
  const [importSource, setImportSource] = useState<ImportSource>("hedgedoc");
  const [exportOpen, setExportOpen] = useState(false);
  const [importJobId, setImportJobId] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState(0);

  const apiBase = process.env.NEXT_PUBLIC_API_BASE || "/api/v1";

  const resetImportState = useCallback(() => {
    setImportStep("upload");
    setImportMode("append");
    setImportJobId(null);
    setImportPreview(null);
    setImportReport(null);
    setImportError(null);
    setImportFileName(null);
    setImportProgress(0);
  }, []);

  const openImportModal = useCallback((source: ImportSource) => {
    resetImportState();
    setImportSource(source);
    setImportOpen(true);
  }, [resetImportState]);

  const closeImportModal = useCallback(() => {
    setImportOpen(false);
    resetImportState();
  }, [resetImportState]);

  const openExportModal = useCallback(() => { setExportOpen(true); }, []);
  const closeExportModal = useCallback(() => { setExportOpen(false); }, []);

  const handleImportFile = useCallback(async (file: File) => {
    setImportError(null);
    setImportFileName(file.name);
    setImportStep("parsing");
    try {
      const token = getAuthToken();
      const form = new FormData();
      form.append("file", file, file.name);
      const uploadRes = await fetch(`${apiBase}/import/${importSource}/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      /* v8 ignore start -- auth redirect requires real browser navigation */
      if (uploadRes.status === 401) {
        removeAuthToken();
        window.location.href = "/login";
        return;
      }
      /* v8 ignore stop */
      const payload = await uploadRes.json().catch(() => ({}));
      const code = payload?.code;
      if (typeof code === "number" && code !== 0) {
        throw new ApiError(payload?.msg || "Upload failed", code);
      }
      const jobId = payload?.data?.job_id || payload?.job_id;
      if (!jobId) throw new Error("Invalid upload response");
      setImportJobId(jobId);
      const preview = await apiFetch<ImportPreview>(`/import/${importSource}/${jobId}/preview`);
      setImportPreview(preview);
      setImportStep("preview");
    } catch (err) {
      console.error(err);
      setImportError(err instanceof Error ? err.message : "Import failed");
      setImportStep("upload");
    }
  }, [apiBase, importSource]);

  const handleImportConfirm = useCallback(async () => {
    if (!importJobId) return;
    setImportError(null);
    setImportStep("importing");
    try {
      await apiFetch<{ ok: boolean }>(`/import/${importSource}/${importJobId}/confirm`, {
        method: "POST",
        body: JSON.stringify({ mode: importMode }),
      });
      const MAX_POLL_ATTEMPTS = 300;
      let finished = false;
      let attempts = 0;
      while (!finished) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        if (++attempts > MAX_POLL_ATTEMPTS) throw new Error("Import timed out");
        const status = await apiFetch<{
          status: string; progress: number; report: ImportReport | null;
        }>(`/import/${importSource}/${importJobId}/status`);
        setImportProgress(status.progress);
        if (status.status === "done") {
          setImportReport(status.report || null);
          setImportStep("done");
          finished = true;
          void fetchSummary();
          void fetchTags("");
          void fetchSidebarTags(0, false, tagSearch.trim());
        } else if (status.status === "failed" || status.status === "error") {
          throw new Error("Import failed on server");
        }
      }
    } catch (err) {
      console.error(err);
      setImportError(err instanceof Error ? err.message : "Import failed");
      setImportStep("preview");
    }
  }, [fetchSidebarTags, fetchSummary, fetchTags, importJobId, importMode, importSource, tagSearch]);

  // eslint-disable-next-line complexity
  const handleExportNotes = useCallback(async () => {
    try {
      const token = getAuthToken();
      const res = await fetch(`${apiBase}/export/notes`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      /* v8 ignore start -- auth redirect requires real browser navigation */
      if (res.status === 401) {
        removeAuthToken();
        window.location.href = "/login";
        return;
      }
      /* v8 ignore stop */
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const payload = await res.json().catch(() => ({}));
        const code = payload?.code;
        if (typeof code === "number" && code !== 0) {
          throw new ApiError(payload?.msg || payload?.message || "Export failed", code);
        }
      }
      /* v8 ignore start -- blob download requires real browser APIs */
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const disposition = res.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="?([^";]+)"?/i);
      link.href = url;
      link.download = match?.[1] || "mnote-notes.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      /* v8 ignore stop */
    } catch (err) {
      console.error(err);
      toast({ description: err instanceof Error ? err : "Export failed", variant: "error" });
    }
  }, [apiBase, toast]);

  return {
    importOpen, importStep, importMode, setImportMode, importSource,
    exportOpen, importPreview, importReport,
    importError, importFileName, importProgress,
    openImportModal, closeImportModal, openExportModal, closeExportModal,
    handleImportFile, handleImportConfirm, handleExportNotes,
  };
}
