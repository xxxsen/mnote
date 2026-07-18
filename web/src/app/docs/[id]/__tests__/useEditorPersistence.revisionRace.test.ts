import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useEditorSession } from "../hooks/useEditorSession";
import { draftStorageKey } from "../services/draft-storage";
import type { SaveDocumentResult } from "../types";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("draft base revision race", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("flushes with the accepted revision before React state effects run", async () => {
    const firstSave = deferred<SaveDocumentResult>();
    const secondSave = deferred<SaveDocumentResult>();
    const save = vi.fn()
      .mockImplementationOnce(() => firstSave.promise)
      .mockImplementationOnce(() => secondSave.promise);
    const contentRef = { current: "# Base" };
    const lastSavedContentRef = { current: "# Base" };

    const { result } = renderHook(() => useEditorSession({
      enabled: true,
      docId: "d1",
      editorViewRef: { current: null },
      contentRef,
      lastSavedContentRef,
      initialRevision: 1,
      initialHash: "hash-1",
      initialSavedContent: "# Base",
      initialSavedTitle: "Base",
      save,
      extractTitle: (content) => content.replace(/^#\s*/, "").split("\n")[0],
      onConflict: vi.fn(),
      onError: vi.fn(),
    }));

    act(() => {
      result.current.buffer.publishContent("# A", true);
      result.current.saveQueue.requestSave({ title: "A", content: "# A" });
      result.current.buffer.publishContent("# B", true);
      result.current.saveQueue.requestSave({ title: "B", content: "# B" });
    });

    await act(async () => {
      firstSave.resolve({
        id: "d1",
        accepted: true,
        reason: "",
        version: 2,
        content_revision: 2,
        content_hash: "hash-2",
        content_mtime: 200,
        mtime: 200,
      });
      await Promise.resolve();
      window.dispatchEvent(new Event("pagehide"));
    });

    const stored = JSON.parse(
      window.localStorage.getItem(draftStorageKey("d1")) || "{}",
    ) as Record<string, unknown>;
    expect(stored).toMatchObject({
      version: 2,
      content: "# B",
      baseRevision: 2,
      baseContentHash: "hash-2",
    });
  });
});
