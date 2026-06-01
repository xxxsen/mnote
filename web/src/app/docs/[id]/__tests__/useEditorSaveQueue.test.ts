import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useEditorSaveQueue, type SaveFn } from "../hooks/useEditorSaveQueue";

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

function makeOptions(saveImpl: SaveFn) {
  return {
    initialRevision: 1,
    initialSavedContent: "",
    initialSavedTitle: "",
    save: saveImpl,
    onSaved: vi.fn(),
    onStale: vi.fn(),
    onError: vi.fn(),
  };
}

const acceptedResult = (revision: number) => ({
  id: "d1",
  accepted: true,
  version: revision,
  content_revision: revision,
  content_hash: `h${revision}`,
  content_mtime: 1000 + revision,
  mtime: 1000 + revision,
});

const staleResult = (revision: number) => ({
  id: "d1",
  accepted: false,
  version: revision,
  content_revision: revision,
  content_hash: `h${revision}`,
  content_mtime: 1000 + revision,
  mtime: 1000 + revision,
});

describe("useEditorSaveQueue", () => {
  // Same-tick double save must coalesce — only one PUT issues
  // synchronously and the second is folded into the queue, then drained
  // after the first completes. The drained save must carry the next
  // save_seq (initial revision + number of saves issued so far).
  it("coalesces concurrent saves into a single in-flight request", async () => {
    const calls: { snapshot: { title: string; content: string }; saveSeq: number }[] = [];
    const gates: Deferred<ReturnType<typeof acceptedResult>>[] = [];
    const save: SaveFn = (snapshot, saveSeq) => {
      const d = deferred<ReturnType<typeof acceptedResult>>();
      calls.push({ snapshot, saveSeq });
      gates.push(d);
      return d.promise;
    };
    const opts = makeOptions(save);

    const { result } = renderHook(() => useEditorSaveQueue(opts));

    act(() => {
      result.current.requestSave({ title: "T1", content: "v1" });
      result.current.requestSave({ title: "T2", content: "v2" });
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].snapshot.content).toBe("v1");
    // Initial revision was 1, so the first PUT carries save_seq=2.
    expect(calls[0].saveSeq).toBe(2);
    expect(result.current.status).toBe("QUEUED");

    await act(async () => {
      gates[0].resolve(acceptedResult(2));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(calls).toHaveLength(2);
    expect(calls[1].snapshot.content).toBe("v2");
    expect(calls[1].saveSeq).toBe(3);

    await act(async () => {
      gates[1].resolve(acceptedResult(3));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.status).toBe("SYNCED");
    expect(result.current.serverRevision).toBe(3);
    expect(result.current.lastSavedContent).toBe("v2");
    expect(result.current.lastSavedAt).toBe(acceptedResult(3).content_mtime);
  });

  // An accepted=false response must not overwrite the editor's last-saved
  // content (so hasUnsavedChanges stays true) but must advance the local
  // save_seq so the next save publishes a fresh sequence number.
  it("preserves draft and fast-forwards save_seq on accepted=false", async () => {
    const save: SaveFn = vi.fn(() => Promise.resolve(staleResult(5)));
    const opts = makeOptions(save);

    const { result } = renderHook(() => useEditorSaveQueue(opts));

    await act(async () => {
      result.current.requestSave({ title: "My Title", content: "Local Body" });
      await Promise.resolve();
      await Promise.resolve();
    });

    // Stale responses are not errors; the queue settles back to SYNCED.
    expect(result.current.status).toBe("SYNCED");
    // Editor-side last-saved snapshot is intentionally NOT overwritten.
    expect(result.current.lastSavedContent).toBe("");
    expect(result.current.lastSavedTitle).toBe("");
    // serverRevision tracks the value returned by the server.
    expect(result.current.serverRevision).toBe(5);
    expect(opts.onStale).toHaveBeenCalledWith(
      expect.objectContaining({ result: expect.objectContaining({ content_revision: 5 }) }),
    );
    // No error should fire on a stale response.
    expect(opts.onError).not.toHaveBeenCalled();
  });

  // A network/server failure must surface ERROR, must not drop the queued
  // snapshot, and must invoke onError so the page can preserve the
  // localStorage draft.
  it("retains queued snapshot on generic error", async () => {
    let attempts = 0;
    const save: SaveFn = () => {
      attempts++;
      if (attempts === 1) return Promise.reject(new Error("network"));
      return Promise.resolve(acceptedResult(2));
    };
    const opts = makeOptions(save);

    const { result } = renderHook(() => useEditorSaveQueue(opts));

    await act(async () => {
      result.current.requestSave({ title: "T", content: "v1" });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.status).toBe("ERROR");
    expect(opts.onError).toHaveBeenCalled();
  });

  // lastSavedAt must come from the server SaveDocumentResult, not from
  // Date.now() on the client.
  it("uses server-side content_mtime for lastSavedAt", async () => {
    const save: SaveFn = () => Promise.resolve({ ...acceptedResult(2), content_mtime: 9999, mtime: 0 });
    const opts = makeOptions(save);

    const { result } = renderHook(() => useEditorSaveQueue(opts));
    await act(async () => {
      result.current.requestSave({ title: "T", content: "v" });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.lastSavedAt).toBe(9999);
  });

  it("skips no-op saves", async () => {
    const save: SaveFn = vi.fn(() => Promise.resolve(acceptedResult(2)));
    const opts = makeOptions(save);

    const { result } = renderHook(() => useEditorSaveQueue(opts));
    act(() => {
      result.current.resyncRevision({ revision: 2, title: "T", content: "v", mtime: 1234 });
    });

    act(() => {
      result.current.requestSave({ title: "T", content: "v" });
    });
    expect(save).not.toHaveBeenCalled();
    expect(result.current.status).toBe("SYNCED");
  });

  it("resyncRevision ignores absent fields", () => {
    const save: SaveFn = vi.fn();
    const opts = makeOptions(save);
    const { result } = renderHook(() => useEditorSaveQueue(opts));
    act(() => {
      result.current.resyncRevision({ revision: 9 });
    });
    expect(result.current.serverRevision).toBe(9);
    expect(result.current.lastSavedTitle).toBe("");
    expect(result.current.lastSavedContent).toBe("");
    expect(result.current.lastSavedAt).toBeNull();
  });

  // After a stale response the user's next save must use a save_seq that
  // is strictly greater than the server's reported content_revision, so
  // the retry's seq becomes server_revision + 1.
  it("retries with the next save_seq after an accepted=false response", async () => {
    const save = vi
      .fn<SaveFn>()
      .mockResolvedValueOnce(staleResult(5))
      .mockResolvedValueOnce(acceptedResult(6));
    const opts = makeOptions(save);
    const { result } = renderHook(() => useEditorSaveQueue(opts));

    await act(async () => {
      result.current.requestSave({ title: "T", content: "v" });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.status).toBe("SYNCED");
    expect(result.current.serverRevision).toBe(5);
    // Draft was not committed; lastSavedContent stays empty.
    expect(result.current.lastSavedContent).toBe("");

    await act(async () => {
      result.current.requestSave({ title: "T2", content: "v2" });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(save).toHaveBeenLastCalledWith({ title: "T2", content: "v2" }, 6);
    expect(result.current.status).toBe("SYNCED");
    expect(result.current.serverRevision).toBe(6);
    expect(result.current.lastSavedContent).toBe("v2");
  });

  it("falls back to mtime when content_mtime is missing", async () => {
    const save: SaveFn = () => Promise.resolve({ ...acceptedResult(2), content_mtime: 0, mtime: 5555 });
    const opts = makeOptions(save);
    const { result } = renderHook(() => useEditorSaveQueue(opts));
    await act(async () => {
      result.current.requestSave({ title: "T", content: "v" });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.lastSavedAt).toBe(5555);
  });

  // drainQueue must remain idempotent when the user re-triggers a save
  // with an unchanged snapshot while a request is already in flight: the
  // queue records the snapshot but does not start a second concurrent
  // request.
  it("does not fire a second save when the queued snapshot matches the just-saved one", async () => {
    const gate = deferred<ReturnType<typeof acceptedResult>>();
    const save: SaveFn = vi.fn(() => gate.promise);
    const opts = makeOptions(save);
    const { result } = renderHook(() => useEditorSaveQueue(opts));

    act(() => {
      result.current.requestSave({ title: "T", content: "v1" });
    });
    expect(save).toHaveBeenCalledTimes(1);

    // Same identical snapshot while in-flight: queue replaces snapshot and
    // status becomes QUEUED rather than firing a second concurrent save.
    act(() => {
      result.current.requestSave({ title: "T", content: "v1" });
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("QUEUED");

    await act(async () => {
      gate.resolve(acceptedResult(2));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("SYNCED");
  });

  // Branch coverage: hasMore must trigger when only the title differs
  // from the just-saved snapshot (e.g. user renamed mid-save).
  it("requeues a follow-up save when only the title changes", async () => {
    const gates: Deferred<ReturnType<typeof acceptedResult>>[] = [];
    const save: SaveFn = vi.fn(() => {
      const d = deferred<ReturnType<typeof acceptedResult>>();
      gates.push(d);
      return d.promise;
    });
    const opts = makeOptions(save);
    const { result } = renderHook(() => useEditorSaveQueue(opts));

    act(() => {
      result.current.requestSave({ title: "Old", content: "body" });
    });
    act(() => {
      result.current.requestSave({ title: "New", content: "body" });
    });
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => {
      gates[0].resolve(acceptedResult(2));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ title: "New", content: "body" }, 3);

    await act(async () => {
      gates[1].resolve(acceptedResult(3));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.status).toBe("SYNCED");
    expect(result.current.lastSavedTitle).toBe("New");
  });

  it("falls back to null when both content_mtime and mtime are zero", async () => {
    const save: SaveFn = () => Promise.resolve({ ...acceptedResult(2), content_mtime: 0, mtime: 0 });
    const opts = makeOptions(save);
    const { result } = renderHook(() => useEditorSaveQueue(opts));
    await act(async () => {
      result.current.requestSave({ title: "T", content: "v" });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.lastSavedAt).toBeNull();
  });

  // Branch coverage: requestSave while ERROR is sticky must NOT downgrade
  // the visible status — error stays surfaced until the user explicitly
  // retries (and that retry actually fires a save).
  it("preserves ERROR status after a failed save", async () => {
    const gate = deferred<ReturnType<typeof acceptedResult>>();
    const save = vi
      .fn<SaveFn>()
      .mockImplementationOnce(() => gate.promise);
    const opts = makeOptions(save);
    const { result } = renderHook(() => useEditorSaveQueue(opts));

    act(() => {
      result.current.requestSave({ title: "T", content: "v1" });
    });

    await act(async () => {
      gate.reject(new Error("server 500"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.status).toBe("ERROR");
  });

  // After an error with a queued snapshot pending, the queue must not
  // auto-drain that pending snapshot — only the user's next explicit save
  // should retry.
  it("does not auto-drain pending snapshot after ERROR", async () => {
    const gate = deferred<ReturnType<typeof acceptedResult>>();
    const save = vi
      .fn<SaveFn>()
      .mockImplementationOnce(() => gate.promise);
    const opts = makeOptions(save);
    const { result } = renderHook(() => useEditorSaveQueue(opts));

    act(() => {
      result.current.requestSave({ title: "T", content: "v1" });
    });
    act(() => {
      result.current.requestSave({ title: "T", content: "v2" });
    });
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => {
      gate.reject(new Error("boom"));
      await Promise.resolve();
      await Promise.resolve();
    });
    // v2 stays queued, no automatic retry.
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("ERROR");
  });

  // Each save_seq must be strictly greater than the previous one issued by
  // this hook instance, regardless of accept/reject outcome, so the server
  // can deterministically pick the latest write.
  it("increments save_seq strictly between consecutive saves", async () => {
    const seen: number[] = [];
    const save: SaveFn = (_snapshot, seq) => {
      seen.push(seq);
      return Promise.resolve(acceptedResult(seq));
    };
    const opts = makeOptions(save);
    const { result } = renderHook(() => useEditorSaveQueue(opts));

    await act(async () => {
      result.current.requestSave({ title: "T", content: "a" });
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      result.current.requestSave({ title: "T", content: "b" });
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      result.current.requestSave({ title: "T", content: "c" });
      await Promise.resolve();
      await Promise.resolve();
    });
    // Initial revision is 1, so the first save uses 2 and each subsequent
    // save strictly increments.
    expect(seen).toEqual([2, 3, 4]);
  });

  // Branch coverage: after a stale response with a still-pending follow-up
  // snapshot, the queue must surface QUEUED (not SYNCED) so the footer
  // continues to show "work in progress" until the next save actually
  // accepts a write.
  it("surfaces QUEUED after stale response when a follow-up snapshot is pending", async () => {
    const gates: Deferred<ReturnType<typeof staleResult> | ReturnType<typeof acceptedResult>>[] = [];
    const save: SaveFn = vi.fn(() => {
      const d = deferred<ReturnType<typeof staleResult> | ReturnType<typeof acceptedResult>>();
      gates.push(d);
      return d.promise;
    });
    const opts = makeOptions(save);
    const { result } = renderHook(() => useEditorSaveQueue(opts));

    act(() => {
      result.current.requestSave({ title: "T", content: "v1" });
    });
    // While the first save is in-flight, the user keeps typing.
    act(() => {
      result.current.requestSave({ title: "T", content: "v2" });
    });
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => {
      gates[0].resolve(staleResult(5));
      await Promise.resolve();
      await Promise.resolve();
    });
    // Now the queue should be draining v2; status must reflect a pending
    // queued snapshot rather than SYNCED.
    expect(save).toHaveBeenCalledTimes(2);
    expect(["QUEUED", "SAVING"]).toContain(result.current.status);

    await act(async () => {
      gates[1].resolve(acceptedResult(6));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.status).toBe("SYNCED");
    expect(result.current.lastSavedContent).toBe("v2");
  });

  // Race fix: when save A resolves while save B is already queued,
  // onSaved must report isLatest=false so the editor knows the just-saved
  // snapshot is no longer authoritative and must not clear the local
  // draft. The hook decides isLatest by inspecting queuedRef under the
  // single-flight lock, so the call order (set queued snapshot → resolve
  // A → onSaved fires) is the contract this test pins.
  it("reports isLatest=false on onSaved when a newer snapshot is already queued", async () => {
    const gates: Deferred<ReturnType<typeof acceptedResult>>[] = [];
    const save: SaveFn = vi.fn(() => {
      const d = deferred<ReturnType<typeof acceptedResult>>();
      gates.push(d);
      return d.promise;
    });
    const opts = makeOptions(save);
    const { result } = renderHook(() => useEditorSaveQueue(opts));

    act(() => {
      result.current.requestSave({ title: "T", content: "A" });
    });
    expect(save).toHaveBeenCalledTimes(1);
    // While A is in flight the user types more and pushes B onto the queue.
    act(() => {
      result.current.requestSave({ title: "T", content: "B" });
    });
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => {
      gates[0].resolve(acceptedResult(2));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(opts.onSaved).toHaveBeenCalledWith(
      expect.objectContaining({
        isLatest: false,
        snapshot: { title: "T", content: "A" },
      }),
    );
    // The queue must keep draining B without waiting for an external retry.
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ title: "T", content: "B" }, 3);
  });

  // Symmetric guard: when no newer snapshot is queued at the moment the
  // queue commits the save, isLatest must be true so the editor can
  // safely clear hasUnsavedChanges and the localStorage draft.
  it("reports isLatest=true when no follow-up snapshot is queued", async () => {
    const save: SaveFn = () => Promise.resolve(acceptedResult(2));
    const opts = makeOptions(save);
    const { result } = renderHook(() => useEditorSaveQueue(opts));

    await act(async () => {
      result.current.requestSave({ title: "T", content: "v" });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(opts.onSaved).toHaveBeenCalledWith(
      expect.objectContaining({
        isLatest: true,
        snapshot: { title: "T", content: "v" },
      }),
    );
  });

  it("resyncRevision and setLastSavedAt update state without firing a save", () => {
    const save: SaveFn = vi.fn(() => Promise.resolve(acceptedResult(2)));
    const opts = makeOptions(save);

    const { result } = renderHook(() => useEditorSaveQueue(opts));
    act(() => {
      result.current.resyncRevision({ revision: 7, title: "rt", content: "rc", mtime: 1111 });
    });
    expect(result.current.serverRevision).toBe(7);
    expect(result.current.lastSavedContent).toBe("rc");
    expect(result.current.lastSavedTitle).toBe("rt");
    expect(result.current.lastSavedAt).toBe(1111);

    act(() => {
      result.current.setLastSavedAt(2222);
    });
    expect(result.current.lastSavedAt).toBe(2222);
    expect(save).not.toHaveBeenCalled();
  });
});
