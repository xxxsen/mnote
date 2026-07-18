import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, getAuthToken, removeAuthToken } from "@/lib/api";

type ToastVariant = "default" | "success" | "error";

interface UseExportFlowDeps {
  toast: (opts: { description: string | Error; variant?: ToastVariant }) => void;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function exportErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Export failed";
}

async function validateJsonResponse(response: Response) {
  const payload = await response.json().catch(() => null);
  const code = payload?.code;
  if (typeof code === "number" && code !== 0) {
    throw new ApiError(payload?.msg || payload?.message || "Export failed", code);
  }
}

async function downloadArchive(response: Response) {
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  link.href = url;
  link.download = match?.[1] || "mnote-notes.zip";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

async function processExportResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    await validateJsonResponse(response);
    return;
  }
  /* v8 ignore start -- blob download requires real browser APIs */
  await downloadArchive(response);
  /* v8 ignore stop */
}

export function useExportFlow({ toast }: UseExportFlowDeps) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const requestRef = useRef(0);
  const submittingRef = useRef(false);
  const apiBase = process.env.NEXT_PUBLIC_API_BASE || "/api/v1";

  const openDialog = useCallback(() => {
    setError(null);
    setOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    requestRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    submittingRef.current = false;
    setExporting(false);
    setError(null);
    setOpen(false);
  }, []);

  const exportNotes = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestId = ++requestRef.current;
    setError(null);
    setExporting(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`${apiBase}/export/notes`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: controller.signal,
      });
      /* v8 ignore start -- auth redirect requires real browser navigation */
      if (response.status === 401) {
        removeAuthToken();
        window.location.href = "/login";
        return;
      }
      /* v8 ignore stop */
      await processExportResponse(response);
      if (requestId === requestRef.current) setOpen(false);
    } catch (caught) {
      if (isAbortError(caught) || requestId !== requestRef.current) return;
      const message = exportErrorMessage(caught);
      setError(message);
      toast({
        description: caught instanceof Error ? caught : message,
        variant: "error",
      });
    } finally {
      if (requestId === requestRef.current) {
        submittingRef.current = false;
        controllerRef.current = null;
        setExporting(false);
      }
    }
  }, [apiBase, toast]);

  useEffect(() => () => {
    requestRef.current += 1;
    controllerRef.current?.abort();
  }, []);

  return { open, exporting, error, openDialog, closeDialog, exportNotes };
}
