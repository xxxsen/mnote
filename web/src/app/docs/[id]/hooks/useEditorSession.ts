"use client";

import { useCallback, useEffect, useRef } from "react";
import type { EditorView } from "@codemirror/view";
import { decideSavedSync } from "../utils";
import { useEditorBuffer } from "./useEditorBuffer";
import { useEditorPersistence } from "./useEditorPersistence";
import {
  useEditorSaveQueue,
  type SaveFn,
} from "./useEditorSaveQueue";

export type UseEditorSessionOptions = {
  enabled: boolean;
  docId: string;
  editorViewRef: React.RefObject<EditorView | null>;
  contentRef: React.RefObject<string>;
  lastSavedContentRef: React.RefObject<string>;
  initialRevision: number;
  initialHash?: string;
  initialSavedContent: string;
  initialSavedTitle: string;
  save: SaveFn;
  extractTitle: (content: string) => string;
  onConflict: () => void;
  onError: (error: unknown) => void;
};

/**
 * Owns the editor's correctness-critical session state. Page-level features
 * such as tags, sharing and routing stay outside this boundary.
 */
export function useEditorSession({
  enabled,
  docId,
  editorViewRef,
  contentRef,
  lastSavedContentRef,
  initialRevision,
  initialHash,
  initialSavedContent,
  initialSavedTitle,
  save,
  extractTitle,
  onConflict,
  onError,
}: UseEditorSessionOptions) {
  const markLocalChangesRef = useRef<() => void>(() => undefined);
  const publishDirtyState = useCallback((dirty: boolean) => {
    if (dirty) markLocalChangesRef.current();
  }, []);

  const buffer = useEditorBuffer({
    editorViewRef,
    contentRef,
    lastSavedContentRef,
    onDirtyChange: publishDirtyState,
  });

  const saveQueue = useEditorSaveQueue({
    initialRevision,
    initialHash,
    initialSavedContent,
    initialSavedTitle,
    save,
    onSaved: ({ snapshot, isLatest }) => {
      lastSavedContentRef.current = snapshot.content;
      const currentContent = contentRef.current;
      const action = decideSavedSync({
        snapshotContent: snapshot.content,
        snapshotTitle: snapshot.title,
        currentContent,
        currentTitle: extractTitle(currentContent),
        isLatest,
      });
      buffer.setHasUnsavedChanges(action !== "clear");
    },
    onConflict,
    onError,
  });

  useEffect(() => {
    markLocalChangesRef.current = saveQueue.markLocalChanges;
  }, [saveQueue.markLocalChanges]);

  const persistence = useEditorPersistence({
    enabled,
    docId,
    content: buffer.content,
    dirty: buffer.hasUnsavedChanges,
    dirtyRef: buffer.dirtyRef,
    contentRef,
    lastSavedContentRef,
    serverRevision: saveQueue.serverRevision,
    serverHash: saveQueue.serverHash,
    getServerSnapshot: saveQueue.getServerSnapshot,
    status: saveQueue.status,
    extractTitle,
    requestSave: saveQueue.requestSave,
    retry: saveQueue.retry,
  });

  return {
    buffer,
    saveQueue,
    ...persistence,
  };
}
