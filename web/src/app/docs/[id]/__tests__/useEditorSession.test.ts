import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useEditorPersistence } from "../hooks/useEditorPersistence";
import { draftStorageKey } from "../services/draft-storage";

describe("useEditorSession draft persistence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  function renderSession(content: string) {
    const contentRef = { current: content };
    const dirtyRef = { current: true };
    return renderHook(() => useEditorPersistence({
      enabled: true,
      docId: "d1",
      content,
      dirty: true,
      dirtyRef,
      contentRef,
      lastSavedContentRef: { current: "server" },
      serverRevision: 7,
      serverHash: "hash-7",
      status: "LOCAL_CHANGES",
      extractTitle: () => "",
      requestSave: vi.fn(),
      retry: vi.fn(),
    }));
  }

  it("writes a v2 draft after 250ms, including an empty body", () => {
    renderSession("");
    act(() => vi.advanceTimersByTime(250));
    expect(JSON.parse(window.localStorage.getItem(draftStorageKey("d1")) || "{}")).toEqual(
      expect.objectContaining({
        version: 2,
        docId: "d1",
        content: "",
        baseRevision: 7,
        baseContentHash: "hash-7",
      }),
    );
  });

  it("flushes from refs on pagehide without waiting for React state", () => {
    const { result } = renderSession("# Draft");
    act(() => window.dispatchEvent(new Event("pagehide")));
    expect(result.current.localBackupUnavailable).toBe(false);
    expect(JSON.parse(window.localStorage.getItem(draftStorageKey("d1")) || "{}").content).toBe("# Draft");
  });

  it("does not touch a stored draft while session initialization is disabled", () => {
    window.localStorage.setItem(draftStorageKey("d1"), JSON.stringify({ content: "keep" }));
    renderHook(() => useEditorPersistence({
      enabled: false,
      docId: "d1",
      content: "",
      dirty: false,
      dirtyRef: { current: false },
      contentRef: { current: "" },
      lastSavedContentRef: { current: "" },
      serverRevision: 1,
      serverHash: "",
      status: "SYNCED",
      extractTitle: () => "",
      requestSave: vi.fn(),
      retry: vi.fn(),
    }));
    act(() => vi.advanceTimersByTime(1000));
    expect(window.localStorage.getItem(draftStorageKey("d1"))).not.toBeNull();
  });
});
