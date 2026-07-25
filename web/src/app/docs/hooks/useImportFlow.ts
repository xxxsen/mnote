import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch, ApiError, getAuthToken, removeAuthToken } from "@/lib/api";
import type {
  ImportMode,
  ImportPreview,
  ImportReport,
  ImportSource,
  ImportStep,
} from "../types";

interface UseImportFlowDeps {
  fetchOverview: () => Promise<void>;
  fetchTags: (query: string) => Promise<void>;
  fetchSidebarTags: (offset: number, append: boolean, query: string) => Promise<void>;
  tagSearch: string;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Import failed";
}

function abortableDelay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

function readUploadJobId(payload: {
  code?: number;
  msg?: string;
  job_id?: string;
  data?: { job_id?: string };
}) {
  if (typeof payload.code === "number" && payload.code !== 0) {
    throw new ApiError(payload.msg || "Upload failed", payload.code);
  }
  const jobId = payload.data?.job_id || payload.job_id;
  if (!jobId) throw new Error("Invalid upload response");
  return jobId;
}

async function pollImport({
  source,
  jobId,
  signal,
  onProgress,
}: {
  source: ImportSource;
  jobId: string;
  signal: AbortSignal;
  onProgress: (progress: number) => void;
}) {
  const maxAttempts = 300;
  for (let attempts = 0; attempts < maxAttempts; attempts += 1) {
    await abortableDelay(700, signal);
    const status = await apiFetch<{
      status: string;
      progress: number;
      report: ImportReport | null;
    }>(`/import/${source}/${jobId}/status`, { signal });
    onProgress(status.progress);
    if (status.status === "done") return status.report;
    if (status.status === "failed" || status.status === "error") {
      throw new Error("Import failed on server");
    }
  }
  throw new Error("Import timed out");
}

export function useImportFlow(deps: UseImportFlowDeps) {
  const { fetchOverview, fetchTags, fetchSidebarTags, tagSearch } = deps;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<ImportStep>("upload");
  const [mode, setMode] = useState<ImportMode>("append");
  const [source, setSource] = useState<ImportSource>("hedgedoc");
  const [jobId, setJobId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const uploadControllerRef = useRef<AbortController | null>(null);
  const importControllerRef = useRef<AbortController | null>(null);
  const uploadRequestRef = useRef(0);
  const importRequestRef = useRef(0);
  const submittingRef = useRef(false);
  const apiBase = process.env.NEXT_PUBLIC_API_BASE || "/api/v1";

  const reset = useCallback(() => {
    setStep("upload");
    setMode("append");
    setJobId(null);
    setPreview(null);
    setReport(null);
    setError(null);
    setFileName(null);
    setProgress(0);
  }, []);

  const openDialog = useCallback((nextSource: ImportSource) => {
    uploadControllerRef.current?.abort();
    reset();
    setSource(nextSource);
    setOpen(true);
  }, [reset]);

  const closeDialog = useCallback(() => {
    if (submittingRef.current) return;
    uploadRequestRef.current += 1;
    uploadControllerRef.current?.abort();
    uploadControllerRef.current = null;
    setOpen(false);
    reset();
  }, [reset]);

  const importFile = useCallback(async (file: File) => {
    uploadControllerRef.current?.abort();
    const controller = new AbortController();
    uploadControllerRef.current = controller;
    const requestId = ++uploadRequestRef.current;
    setError(null);
    setFileName(file.name);
    setStep("parsing");
    try {
      const token = getAuthToken();
      const form = new FormData();
      form.append("file", file, file.name);
      const response = await fetch(`${apiBase}/import/${source}/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
        signal: controller.signal,
      });
      /* v8 ignore start -- auth redirect requires real browser navigation */
      if (response.status === 401) {
        removeAuthToken();
        window.location.href = "/login";
        return;
      }
      /* v8 ignore stop */
      const payload = await response.json().catch(() => ({}));
      const nextJobId = readUploadJobId(payload);
      const nextPreview = await apiFetch<ImportPreview>(
        `/import/${source}/${nextJobId}/preview`,
        { signal: controller.signal },
      );
      if (requestId !== uploadRequestRef.current) return;
      setJobId(nextJobId);
      setPreview(nextPreview);
      setStep("preview");
    } catch (caught) {
      if (isAbortError(caught) || requestId !== uploadRequestRef.current) return;
      setError(errorMessage(caught));
      setStep("upload");
    } finally {
      if (requestId === uploadRequestRef.current) uploadControllerRef.current = null;
    }
  }, [apiBase, source]);

  const confirm = useCallback(async () => {
    if (!jobId || submittingRef.current) return;
    submittingRef.current = true;
    const controller = new AbortController();
    importControllerRef.current = controller;
    const requestId = ++importRequestRef.current;
    setError(null);
    setStep("importing");
    try {
      await apiFetch<{ ok: boolean }>(`/import/${source}/${jobId}/confirm`, {
        method: "POST",
        body: JSON.stringify({ mode }),
        signal: controller.signal,
      });
      const nextReport = await pollImport({
        source,
        jobId,
        signal: controller.signal,
        onProgress: (nextProgress) => {
          if (requestId === importRequestRef.current) setProgress(nextProgress);
        },
      });
      if (requestId !== importRequestRef.current) return;
      setReport(nextReport);
      setStep("done");
      void fetchOverview();
      void fetchTags("");
      void fetchSidebarTags(0, false, tagSearch.trim());
    } catch (caught) {
      if (isAbortError(caught) || requestId !== importRequestRef.current) return;
      setError(errorMessage(caught));
      setStep("preview");
    } finally {
      if (requestId === importRequestRef.current) {
        submittingRef.current = false;
        importControllerRef.current = null;
      }
    }
  }, [fetchSidebarTags, fetchOverview, fetchTags, jobId, mode, source, tagSearch]);

  useEffect(() => () => {
    uploadRequestRef.current += 1;
    importRequestRef.current += 1;
    uploadControllerRef.current?.abort();
    importControllerRef.current?.abort();
  }, []);

  return {
    open,
    step,
    mode,
    setMode,
    source,
    preview,
    report,
    error,
    fileName,
    progress,
    openDialog,
    closeDialog,
    importFile,
    confirm,
  };
}
