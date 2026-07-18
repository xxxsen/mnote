import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAutosaveScheduler } from "../hooks/useAutosaveScheduler";
import type { EditorSyncStatus } from "../types";

describe("useAutosaveScheduler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(status: EditorSyncStatus = "LOCAL_CHANGES") {
    const contentRef = { current: "# Title\nbody" };
    const lastSavedContentRef = { current: "# Title" };
    const requestSave = vi.fn();
    const retry = vi.fn();
    let content = contentRef.current;
    const hook = renderHook(() => useAutosaveScheduler({
      content,
      dirty: true,
      status,
      contentRef,
      lastSavedContentRef,
      extractTitle: () => "Title",
      requestSave,
      retry,
    }));
    return {
      ...hook,
      requestSave,
      retry,
      contentRef,
      update(next: string) {
        content = next;
        contentRef.current = next;
        hook.rerender();
      },
    };
  }

  it("saves the current ref snapshot after two idle seconds", () => {
    const harness = setup();
    harness.update("# Title\nlatest");
    act(() => vi.advanceTimersByTime(1999));
    expect(harness.requestSave).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(harness.requestSave).toHaveBeenCalledWith({
      title: "Title",
      content: "# Title\nlatest",
    });
  });

  it("submits after the ten second max wait during continuous typing", () => {
    const harness = setup();
    for (let second = 1; second <= 9; second += 1) {
      act(() => vi.advanceTimersByTime(1000));
      harness.update(`# Title\n${second}`);
    }
    expect(harness.requestSave).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(harness.requestSave).toHaveBeenCalledTimes(1);
    expect(harness.requestSave.mock.calls[0][0].content).toBe("# Title\n9");
  });

  it.each(["ERROR", "CONFLICT"] as const)("pauses automatic saves in %s", (status) => {
    const harness = setup(status);
    act(() => vi.advanceTimersByTime(20_000));
    expect(harness.requestSave).not.toHaveBeenCalled();
  });

  it("retries the latest snapshot once when the browser returns online", () => {
    const harness = setup("ERROR");
    act(() => window.dispatchEvent(new Event("online")));
    expect(harness.retry).toHaveBeenCalledTimes(1);
    expect(harness.retry).toHaveBeenCalledWith({
      title: "Title",
      content: "# Title\nbody",
    });
  });
});
