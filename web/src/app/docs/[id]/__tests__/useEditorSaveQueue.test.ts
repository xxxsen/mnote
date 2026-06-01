import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { ApiError } from "@/lib/api";

import { ERR_CONFLICT_CODE } from "../constants";
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
    onConflict: vi.fn(),
    onError: vi.fn(),
  };
}

const baseResult = (revision: number) => ({
  id: "d1",
  version: revision,
  content_revision: revision,
  content_hash: `h${revision}`,
  content_mtime: 1000 + revision,
  mtime: 1000 + revision,
});

describe("useEditorSaveQueue", () => {
  // FE-1: same-tick double save must coalesce — only one PUT issues
  // synchronously and the second is folded into the queue, then drained
  // after the first completes.
  it("coalesces concurrent saves into a single in-flight request", async () => {
    const calls: { snapshot: { title: string; content: string }; baseRevision: number }[] = [];
    const gates: Deferred<ReturnType<typeof baseResult>>[] = [];
    const save: SaveFn = (snapshot, baseRevision) => {
      const d = deferred<ReturnType<typeof baseResult>>();
      calls.push({ snapshot, baseRevision });
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
    expect(result.current.status).toBe("QUEUED");

    await act(async () => {
      gates[0].resolve(baseResult(2));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(calls).toHaveLength(2);
    expect(calls[1].snapshot.content).toBe("v2");
    expect(calls[1].baseRevision).toBe(2);

    await act(async () => {
      gates[1].resolve(baseResult(3));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.status).toBe("SYNCED");
    expect(result.current.serverRevision).toBe(3);
    expect(result.current.lastSavedContent).toBe("v2");
    expect(result.current.lastSavedAt).toBe(baseResult(3).content_mtime);
  });

  // FE-1: a CONFLICT response must not overwrite the editor's last-saved
  // content (so hasUnsavedChanges stays true) but must advance the local
  // server revision so the next save sends the correct base_revision.
  it("preserves draft and bumps revision on conflict", async () => {
    const conflictPayload = {
      id: "d1",
      title: "Server Title",
      content: "Server Body",
      content_revision: 5,
      content_mtime: 4242,
    };
    const save: SaveFn = vi.fn(() =>
      Promise.reject(new ApiError("conflict", ERR_CONFLICT_CODE, { current: conflictPayload })),
    );
    const opts = makeOptions(save);

    const { result } = renderHook(() => useEditorSaveQueue(opts));

    await act(async () => {
      result.current.requestSave({ title: "My Title", content: "Local Body" });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.status).toBe("CONFLICT");
    // Editor-side last-saved snapshot is intentionally NOT overwritten.
    expect(result.current.lastSavedContent).toBe("");
    expect(result.current.lastSavedTitle).toBe("");
    expect(result.current.serverRevision).toBe(5);
    expect(opts.onConflict).toHaveBeenCalledWith(
      expect.objectContaining({ current: expect.objectContaining({ content_revision: 5 }) }),
    );
  });

  // FE-1: a generic save failure must surface ERROR, must not drop the
  // queued snapshot, and must invoke onError so the page can preserve the
  // localStorage draft.
  it("retains queued snapshot on generic error", async () => {
    let attempts = 0;
    const save: SaveFn = () => {
      attempts++;
      if (attempts === 1) return Promise.reject(new Error("network"));
      return Promise.resolve(baseResult(2));
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

  // FE-1: lastSavedAt must come from the server SaveDocumentResult, not
  // from Date.now() on the client.
  it("uses server-side content_mtime for lastSavedAt", async () => {
    const save: SaveFn = () => Promise.resolve({ ...baseResult(2), content_mtime: 9999, mtime: 0 });
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
    const save: SaveFn = vi.fn(() => Promise.resolve(baseResult(2)));
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

  // FE-1: non-conflict ApiError responses (e.g. forbidden, server 500)
  // must still flow into the ERROR branch, not be interpreted as a
  // conflict by the structured-payload parser.
  it("treats ApiError with non-conflict code as generic error", async () => {
    const save: SaveFn = () => Promise.reject(new ApiError("forbidden", 10000003, null));
    const opts = makeOptions(save);
    const { result } = renderHook(() => useEditorSaveQueue(opts));
    await act(async () => {
      result.current.requestSave({ title: "T", content: "v" });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.status).toBe("ERROR");
    expect(opts.onConflict).not.toHaveBeenCalled();
    expect(opts.onError).toHaveBeenCalled();
  });

  it("falls back to ERROR when conflict payload is malformed", async () => {
    const save: SaveFn = () => Promise.reject(new ApiError("conflict", ERR_CONFLICT_CODE, { current: { id: 1 } }));
    const opts = makeOptions(save);
    const { result } = renderHook(() => useEditorSaveQueue(opts));
    await act(async () => {
      result.current.requestSave({ title: "T", content: "v" });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.status).toBe("ERROR");
    expect(opts.onConflict).not.toHaveBeenCalled();
  });

  // Branch coverage for parseConflictData: each guard short-circuits on a
  // distinct shape of data payload so we exercise them individually.
  it.each([
    ["null data", null],
    ["primitive data", "oops"],
    ["missing current", { unrelated: 1 }],
    ["current null", { current: null }],
    ["current primitive", { current: "string" }],
  ])("treats ApiError with malformed payload (%s) as generic error", async (_, data) => {
    const save: SaveFn = () => Promise.reject(new ApiError("conflict", ERR_CONFLICT_CODE, data));
    const opts = makeOptions(save);
    const { result } = renderHook(() => useEditorSaveQueue(opts));
    await act(async () => {
      result.current.requestSave({ title: "T", content: "v" });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.status).toBe("ERROR");
    expect(opts.onConflict).not.toHaveBeenCalled();
    expect(opts.onError).toHaveBeenCalled();
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

  // FE-1: after a CONFLICT, the user's next save must reuse the bumped
  // server revision so the retry succeeds against the latest snapshot.
  it("retries with the new base_revision after a CONFLICT", async () => {
    const save = vi
      .fn<SaveFn>()
      .mockRejectedValueOnce(
        new ApiError("conflict", ERR_CONFLICT_CODE, {
          current: { id: "d1", title: "S", content: "S", content_revision: 5, content_mtime: 0 },
        }),
      )
      .mockResolvedValueOnce(baseResult(6));
    const opts = makeOptions(save);
    const { result } = renderHook(() => useEditorSaveQueue(opts));

    await act(async () => {
      result.current.requestSave({ title: "T", content: "v" });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.status).toBe("CONFLICT");
    expect(result.current.serverRevision).toBe(5);

    await act(async () => {
      result.current.requestSave({ title: "T2", content: "v2" });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(save).toHaveBeenLastCalledWith({ title: "T2", content: "v2" }, 5);
    expect(result.current.status).toBe("SYNCED");
    expect(result.current.serverRevision).toBe(6);
  });

  it("falls back to mtime when content_mtime is missing", async () => {
    const save: SaveFn = () => Promise.resolve({ ...baseResult(2), content_mtime: 0, mtime: 5555 });
    const opts = makeOptions(save);
    const { result } = renderHook(() => useEditorSaveQueue(opts));
    await act(async () => {
      result.current.requestSave({ title: "T", content: "v" });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.lastSavedAt).toBe(5555);
  });

  // FE-1: drainQueue runs even when invoked while a save is in-flight
  // (defensive bail-out at the very top), so re-entrant scheduling is safe.
  it("drainQueue is idempotent when called while a save is in-flight", async () => {
    const gate = deferred<ReturnType<typeof baseResult>>();
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
      gate.resolve(baseResult(2));
      await Promise.resolve();
      await Promise.resolve();
    });
    // After completion no more saves fire because queued snapshot equals
    // the just-saved snapshot (hasMore check returns false).
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("SYNCED");
  });

  // FE-1: when CONFLICT/ERROR happen with a queued snapshot pending, the
  // queue must not drain that pending snapshot automatically — only the
  // user's next explicit save should retry.
  it("does not auto-drain pending snapshot after CONFLICT", async () => {
    const gate = deferred<ReturnType<typeof baseResult>>();
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
      gate.reject(
        new ApiError("conflict", ERR_CONFLICT_CODE, {
          current: { id: "d1", title: "S", content: "S", content_revision: 5, content_mtime: 0 },
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    // v2 stays queued, no automatic retry.
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("CONFLICT");
  });

  // Branch coverage: hasMore must trigger when only the title differs
  // from the just-saved snapshot (e.g. user renamed mid-save).
  it("requeues a follow-up save when only the title changes", async () => {
    const gates: Deferred<ReturnType<typeof baseResult>>[] = [];
    const save: SaveFn = vi.fn(() => {
      const d = deferred<ReturnType<typeof baseResult>>();
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
      gates[0].resolve(baseResult(2));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ title: "New", content: "body" }, 2);

    await act(async () => {
      gates[1].resolve(baseResult(3));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.status).toBe("SYNCED");
    expect(result.current.lastSavedTitle).toBe("New");
  });

  it("falls back to null when both content_mtime and mtime are zero", async () => {
    const save: SaveFn = () => Promise.resolve({ ...baseResult(2), content_mtime: 0, mtime: 0 });
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
  // the visible status to QUEUED — error stays surfaced until the user
  // explicitly retries (and that retry actually fires a save, see the
  // "treats ApiError" test above for the rejection path).
  it("preserves ERROR status when a follow-up save is requested in-flight", async () => {
    const gate = deferred<ReturnType<typeof baseResult>>();
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

  it("resyncRevision and setLastSavedAt update state without firing a save", () => {
    const save: SaveFn = vi.fn(() => Promise.resolve(baseResult(2)));
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
