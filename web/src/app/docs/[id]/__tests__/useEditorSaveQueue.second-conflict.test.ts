import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useEditorSaveQueue, type SaveFn } from "../hooks/useEditorSaveQueue";

function conflict(revision: number) {
  return {
    id: "d1",
    accepted: false,
    reason: "revision_conflict" as const,
    version: revision,
    content_revision: revision,
    content_hash: `hash-${revision}`,
    content_mtime: revision,
    mtime: revision,
  };
}

describe("useEditorSaveQueue repeated conflict", () => {
  it("stays blocked and requests a fresh decision when keep-mine conflicts again", async () => {
    const save = vi.fn<SaveFn>()
      .mockResolvedValueOnce(conflict(9))
      .mockResolvedValueOnce(conflict(10));
    const onConflict = vi.fn();
    const { result } = renderHook(() => useEditorSaveQueue({
      initialRevision: 8,
      initialHash: "hash-8",
      initialSavedContent: "# Server 8",
      initialSavedTitle: "Server 8",
      save,
      onConflict,
    }));

    await act(async () => {
      result.current.requestSave({ title: "Mine", content: "# Mine\nfirst" });
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => {
      result.current.resyncRevision({
        revision: 9,
        hash: "hash-9",
        title: "Server 9",
        content: "# Server 9",
      });
    });
    await act(async () => {
      result.current.requestSave({ title: "Mine", content: "# Mine\nsecond" });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(save).toHaveBeenLastCalledWith(
      { title: "Mine", content: "# Mine\nsecond" },
      10,
      9,
    );
    expect(result.current.status).toBe("CONFLICT");
    expect(result.current.serverRevision).toBe(9);
    expect(result.current.conflictSnapshot?.content).toBe("# Mine\nsecond");
    expect(onConflict).toHaveBeenCalledTimes(2);
  });
});
