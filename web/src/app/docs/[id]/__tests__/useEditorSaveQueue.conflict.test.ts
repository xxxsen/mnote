import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useEditorSaveQueue, type SaveFn } from "../hooks/useEditorSaveQueue";

const conflict = {
  id: "d1",
  accepted: false,
  reason: "revision_conflict" as const,
  version: 9,
  content_revision: 9,
  content_hash: "server-hash",
  content_mtime: 100,
  mtime: 100,
};

describe("useEditorSaveQueue conflict handling", () => {
  it("stops draining and does not fast-forward the base revision", async () => {
    const save = vi.fn<SaveFn>().mockResolvedValue(conflict);
    const onConflict = vi.fn();
    const { result } = renderHook(() => useEditorSaveQueue({
      initialRevision: 8,
      initialHash: "base-hash",
      initialSavedContent: "server v8",
      initialSavedTitle: "Title",
      save,
      onConflict,
    }));

    await act(async () => {
      result.current.requestSave({ title: "Title", content: "local A" });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.status).toBe("CONFLICT");
    expect(result.current.serverRevision).toBe(8);
    expect(onConflict).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.requestSave({ title: "Title", content: "local B" });
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.conflictSnapshot?.content).toBe("local B");
  });

  it("can resync to the fetched server revision before an explicit keep-mine save", async () => {
    const save = vi
      .fn<SaveFn>()
      .mockResolvedValueOnce(conflict)
      .mockResolvedValueOnce({ ...conflict, accepted: true, reason: "" as const, content_revision: 10 });
    const { result } = renderHook(() => useEditorSaveQueue({
      initialRevision: 8,
      initialSavedContent: "server v8",
      initialSavedTitle: "Title",
      save,
    }));

    await act(async () => {
      result.current.requestSave({ title: "Title", content: "mine" });
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => {
      result.current.resyncRevision({
        revision: 9,
        hash: "server-hash",
        title: "Title",
        content: "server v9",
      });
    });
    await act(async () => {
      result.current.requestSave({ title: "Title", content: "mine" });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(save).toHaveBeenLastCalledWith(
      { title: "Title", content: "mine" },
      10,
      9,
    );
    expect(result.current.status).toBe("SYNCED");
  });
});
