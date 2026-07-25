"use client";

import { useCallback } from "react";
import type { EditorView } from "@codemirror/view";
import type { DocumentVersionSummary } from "@/types";
import { apiFetch } from "@/lib/api";
import {
  getThemeById,
  saveThemePreference,
  type ThemeId,
} from "@/lib/editor-themes";
import { themeCompartment } from "./useEditorExtensions";
import { downloadFile } from "../utils";
import type { EditorSyncStatus } from "../types";

type Options = {
  docId: string;
  title: string;
  starred: number;
  setStarred: (value: number) => void;
  setTheme: (value: ThemeId) => void;
  editorViewRef: React.RefObject<EditorView | null>;
  contentRef: React.RefObject<string>;
  extractTitle: (content: string) => string;
  notify: (message: string, error?: boolean) => void;
  navigate: (path: string) => void;
  navigateWithoutFlush: (path: string) => void;
  discardLocalDraft: () => boolean;
  saveQueue: {
    status: EditorSyncStatus;
    requestSave: (snapshot: { title: string; content: string }) => void;
    retry: (snapshot?: { title: string; content: string }) => void;
  };
  documentActions: { deleteDocument: () => Promise<unknown> };
};

export function useEditorPageActions(opts: Options) {
  const handleThemeChange = useCallback(
    (themeId: ThemeId) => {
      opts.setTheme(themeId);
      saveThemePreference(themeId);
      const view = opts.editorViewRef.current;
      if (view) {
        view.dispatch({
          effects: themeCompartment.reconfigure(
            getThemeById(themeId).extension,
          ),
        });
      }
    },
    [opts],
  );

  const handleSave = useCallback(() => {
    const content = opts.contentRef.current;
    const title = opts.extractTitle(content);
    if (!title) {
      opts.notify("Please add a title using a Markdown heading.");
      return;
    }
    if (opts.saveQueue.status === "ERROR") {
      opts.saveQueue.retry({ title, content });
      return;
    }
    if (opts.saveQueue.status !== "CONFLICT") {
      opts.saveQueue.requestSave({ title, content });
    }
  }, [opts]);

  const handleRetry = useCallback(() => {
    const content = opts.contentRef.current;
    const title = opts.extractTitle(content);
    if (title) opts.saveQueue.retry({ title, content });
  }, [opts]);

  const handleDelete = useCallback(async () => {
    try {
      await opts.documentActions.deleteDocument();
      opts.discardLocalDraft();
      opts.navigateWithoutFlush("/docs");
    } catch (error: unknown) {
      console.error(error);
      opts.notify(
        error instanceof Error ? error.message : "Failed to delete",
        true,
      );
    }
  }, [opts]);

  const handleStarToggle = useCallback(async () => {
    const next = opts.starred ? 0 : 1;
    opts.setStarred(next);
    try {
      await apiFetch(`/documents/${opts.docId}/star`, {
        method: "PUT",
        body: JSON.stringify({ starred: next === 1 }),
      });
    } catch (error: unknown) {
      console.error(error);
      opts.setStarred(opts.starred);
      opts.notify(
        error instanceof Error ? error.message : "Failed to update star",
        true,
      );
    }
  }, [opts]);

  const handleExportMarkdown = useCallback(() => {
    downloadFile(
      opts.contentRef.current,
      `${opts.title || "untitled"}.md`,
      "text/markdown",
    );
  }, [opts]);

  const handleExportConfluenceHTML = useCallback(async () => {
    try {
      const result = await apiFetch<{ html: string }>(
        "/export/confluence-html",
        {
          method: "POST",
          body: JSON.stringify({ document_id: opts.docId }),
        },
      );
      downloadFile(
        result.html,
        `${opts.title || "untitled"}.confluence.html`,
        "text/html",
      );
      opts.notify("Confluence HTML downloaded.");
    } catch (error: unknown) {
      console.error(error);
      opts.notify(
        error instanceof Error
          ? error.message
          : "Failed to download Confluence HTML",
        true,
      );
    }
  }, [opts]);

  const handleRevert = useCallback(
    (version: DocumentVersionSummary) => {
      opts.navigate(`/docs/${opts.docId}/revert?version=${version.version}`);
    },
    [opts],
  );

  return {
    handleThemeChange,
    handleSave,
    handleRetry,
    handleDelete,
    handleStarToggle,
    handleExportMarkdown,
    handleExportConfluenceHTML,
    handleRevert,
  };
}
