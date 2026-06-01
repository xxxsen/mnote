import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useEditorSaveQueue, type SaveFn } from "../hooks/useEditorSaveQueue";
import { decideSavedSync, extractTitleFromContent } from "../utils";
import type { SaveDocumentResult } from "../types";

// These tests wire useEditorSaveQueue's onSaved callback to the exact
// decision the editor page makes via decideSavedSync, so that we can
// observe the end-to-end behavior of:
//
//   1. Save A in flight + user keeps typing B → A resolves: footer
//      stays "unsynced" and localStorage retains B as a draft so a
//      crash here cannot lose the unsynced edits.
//   2. B subsequently fails: footer surfaces ERROR and localStorage
//      still contains B.
//   3. B subsequently succeeds: hasUnsavedChanges flips to false and
//      the localStorage draft is cleared.
//
// The page's contentRef is simulated by a plain object so the test can
// advance it between the queue's "snapshot captured" moment and the
// queue's "PUT resolved" moment. localStorage is provided by jsdom.

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const acceptedResult = (revision: number): SaveDocumentResult => ({
  id: "d1",
  accepted: true,
  version: revision,
  content_revision: revision,
  content_hash: `h${revision}`,
  content_mtime: 1000 + revision,
  mtime: 1000 + revision,
});

const docId = "doc-race-1";
const draftKey = `mnote:draft:${docId}`;

beforeEach(() => {
  window.localStorage.clear();
});

// PageHarness mimics the page's onSaved closure: it owns
// hasUnsavedChanges, the contentRef the editor publishes to, and the
// localStorage draft key. Tests advance contentRef to simulate the user
// typing, then drive the save queue and inspect the harness state.
//
// The fields are exposed via getter/setter functions so the harness
// can be threaded through closures without violating no-param-reassign.
type PageHarness = {
  contentRef: { current: string };
  getHasUnsavedChanges: () => boolean;
  getLastSavedContent: () => string;
  makeOnSaved: () => (payload: {
    snapshot: { title: string; content: string };
    result: SaveDocumentResult;
    isLatest: boolean;
  }) => void;
};

function makeHarness(initialContent: string): PageHarness {
  const contentRef = { current: initialContent };
  let hasUnsavedChanges = false;
  let lastSavedContent = "";
  const onSaved: PageHarness["makeOnSaved"] = () => ({ snapshot, isLatest }) => {
    lastSavedContent = snapshot.content;
    const currentContent = contentRef.current;
    const currentTitle = extractTitleFromContent(currentContent);
    const action = decideSavedSync({
      snapshotContent: snapshot.content,
      snapshotTitle: snapshot.title,
      currentContent,
      currentTitle,
      isLatest,
    });
    if (action === "clear") {
      hasUnsavedChanges = false;
      window.localStorage.removeItem(draftKey);
      return;
    }
    hasUnsavedChanges = true;
    const payload = JSON.stringify({ content: currentContent, updatedAt: Date.now() });
    window.localStorage.setItem(draftKey, payload);
  };
  return {
    contentRef,
    getHasUnsavedChanges: () => hasUnsavedChanges,
    getLastSavedContent: () => lastSavedContent,
    makeOnSaved: onSaved,
  };
}

describe("save queue + page integration (draft preservation race)", () => {
  // Stale save A must not clear the localStorage draft when a newer
  // snapshot B has already been queued behind the single-flight lock.
  it("keeps hasUnsavedChanges=true and retains the B draft after A resolves", async () => {
    const harness = makeHarness("# A\n\nbody A");
    const gates: Deferred<SaveDocumentResult>[] = [];
    const save: SaveFn = vi.fn(() => {
      const d = deferred<SaveDocumentResult>();
      gates.push(d);
      return d.promise;
    });

    const { result } = renderHook(() =>
      useEditorSaveQueue({
        initialRevision: 1,
        initialSavedContent: "",
        initialSavedTitle: "",
        save,
        onSaved: harness.makeOnSaved(),
      }),
    );

    // Phase 1: publish snapshot A; the queue issues PUT A immediately.
    act(() => {
      result.current.requestSave({ title: "A", content: "# A\n\nbody A" });
    });
    expect(save).toHaveBeenCalledTimes(1);

    // Phase 2: user types more; the editor's contentRef advances to B,
    // and the page publishes snapshot B to the queue.
    harness.contentRef.current = "# B\n\nbody B";
    act(() => {
      result.current.requestSave({ title: "B", content: "# B\n\nbody B" });
    });
    expect(save).toHaveBeenCalledTimes(1);

    // Phase 3: PUT A resolves. The queue invokes onSaved with
    // isLatest=false (queued snapshot B exists) and the harness must
    // keep the draft intact.
    await act(async () => {
      gates[0].resolve(acceptedResult(2));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(harness.getHasUnsavedChanges()).toBe(true);
    const stored = window.localStorage.getItem(draftKey);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored as string)).toMatchObject({ content: "# B\n\nbody B" });
    // The queue must have started draining B without waiting.
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ title: "B", content: "# B\n\nbody B" }, 3);
  });

  // The follow-up B save fails. The queue surfaces ERROR and the page
  // keeps the localStorage draft so the user does not lose work.
  it("keeps the B draft and surfaces ERROR when the follow-up save fails", async () => {
    const harness = makeHarness("# A\n\nbody A");
    const gates: Deferred<SaveDocumentResult>[] = [];
    const save: SaveFn = vi.fn(() => {
      const d = deferred<SaveDocumentResult>();
      gates.push(d);
      return d.promise;
    });
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useEditorSaveQueue({
        initialRevision: 1,
        initialSavedContent: "",
        initialSavedTitle: "",
        save,
        onSaved: harness.makeOnSaved(),
        onError,
      }),
    );

    act(() => {
      result.current.requestSave({ title: "A", content: "# A\n\nbody A" });
    });
    harness.contentRef.current = "# B\n\nbody B";
    act(() => {
      result.current.requestSave({ title: "B", content: "# B\n\nbody B" });
    });

    // A resolves first, draining B starts under the queue's lock.
    await act(async () => {
      gates[0].resolve(acceptedResult(2));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(gates).toHaveLength(2);

    // B fails. The queue must surface ERROR; the draft must remain.
    await act(async () => {
      gates[1].reject(new Error("server 500"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.status).toBe("ERROR");
    expect(onError).toHaveBeenCalled();
    expect(harness.getHasUnsavedChanges()).toBe(true);
    expect(window.localStorage.getItem(draftKey)).not.toBeNull();
  });

  // When B eventually succeeds (after the race), the page must clear
  // the localStorage draft and mark hasUnsavedChanges=false. This is
  // the inverse of the first test: only the final save in the chain
  // gets to drop the draft.
  it("clears the draft and flips hasUnsavedChanges to false once B succeeds", async () => {
    const harness = makeHarness("# A\n\nbody A");
    const gates: Deferred<SaveDocumentResult>[] = [];
    const save: SaveFn = vi.fn(() => {
      const d = deferred<SaveDocumentResult>();
      gates.push(d);
      return d.promise;
    });

    const { result } = renderHook(() =>
      useEditorSaveQueue({
        initialRevision: 1,
        initialSavedContent: "",
        initialSavedTitle: "",
        save,
        onSaved: harness.makeOnSaved(),
      }),
    );

    act(() => {
      result.current.requestSave({ title: "A", content: "# A\n\nbody A" });
    });
    harness.contentRef.current = "# B\n\nbody B";
    act(() => {
      result.current.requestSave({ title: "B", content: "# B\n\nbody B" });
    });

    // A resolves → B starts → B resolves.
    await act(async () => {
      gates[0].resolve(acceptedResult(2));
      await Promise.resolve();
      await Promise.resolve();
    });
    // After A: harness still dirty, draft present.
    expect(harness.getHasUnsavedChanges()).toBe(true);
    expect(window.localStorage.getItem(draftKey)).not.toBeNull();

    await act(async () => {
      gates[1].resolve(acceptedResult(3));
      await Promise.resolve();
      await Promise.resolve();
    });

    // After B: harness clean, draft gone, lastSavedContent equals B.
    expect(harness.getHasUnsavedChanges()).toBe(false);
    expect(window.localStorage.getItem(draftKey)).toBeNull();
    expect(harness.getLastSavedContent()).toBe("# B\n\nbody B");
    expect(result.current.status).toBe("SYNCED");
  });
});
