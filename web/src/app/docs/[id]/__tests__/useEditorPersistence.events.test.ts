import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useEditorPersistence } from "../hooks/useEditorPersistence";
import { draftStorageKey } from "../services/draft-storage";

describe("useEditorPersistence browser events", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function renderPersistence(contentRef = { current: "# Local\nlatest" }) {
    return renderHook(() => useEditorPersistence({
      enabled: true,
      docId: "d1",
      content: contentRef.current,
      dirty: true,
      dirtyRef: { current: true },
      contentRef,
      lastSavedContentRef: { current: "# Server" },
      serverRevision: 7,
      serverHash: "hash-7",
      status: "LOCAL_CHANGES",
      extractTitle: () => "Local",
      requestSave: vi.fn(),
      retry: vi.fn(),
    }));
  }

  it("flushes the latest ref when the document becomes hidden", () => {
    const contentRef = { current: "# Local\nfirst" };
    renderPersistence(contentRef);
    contentRef.current = "# Local\nhidden latest";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });

    act(() => document.dispatchEvent(new Event("visibilitychange")));

    expect(JSON.parse(
      window.localStorage.getItem(draftStorageKey("d1")) || "{}",
    ).content).toBe("# Local\nhidden latest");
  });

  it("flushes the latest ref during unmount", () => {
    const contentRef = { current: "# Local\nfirst" };
    const { unmount } = renderPersistence(contentRef);
    contentRef.current = "# Local\nunmount latest";

    unmount();

    expect(JSON.parse(
      window.localStorage.getItem(draftStorageKey("d1")) || "{}",
    ).content).toBe("# Local\nunmount latest");
  });

  it("surfaces storage failure and enables beforeunload protection", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const { result, unmount } = renderPersistence();

    act(() => vi.advanceTimersByTime(250));
    expect(result.current.localBackupUnavailable).toBe(true);

    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);

    setItem.mockRestore();
    unmount();
  });
});
