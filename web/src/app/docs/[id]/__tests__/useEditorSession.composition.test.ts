import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useEditorSession } from "../hooks/useEditorSession";

describe("useEditorSession composition", () => {
  it("connects buffer changes to the optimistic save queue", async () => {
    const contentRef = { current: "" };
    const lastSavedContentRef = { current: "# Base" };
    const save = vi.fn().mockResolvedValue({
      id: "d1",
      accepted: true,
      reason: "",
      version: 4,
      content_revision: 4,
      content_hash: "hash-4",
      content_mtime: 100,
      mtime: 100,
    });

    const { result } = renderHook(() => useEditorSession({
      enabled: false,
      docId: "d1",
      editorViewRef: { current: null },
      contentRef,
      lastSavedContentRef,
      initialRevision: 3,
      initialHash: "hash-3",
      initialSavedContent: "# Base",
      initialSavedTitle: "Base",
      save,
      extractTitle: (content) => content.replace(/^#\s*/, ""),
      onConflict: vi.fn(),
      onError: vi.fn(),
    }));

    act(() => {
      result.current.buffer.publishContent("# Updated", true);
    });
    expect(result.current.saveQueue.status).toBe("LOCAL_CHANGES");

    act(() => {
      result.current.saveQueue.requestSave({
        title: "Updated",
        content: "# Updated",
      });
    });
    await waitFor(() => expect(result.current.saveQueue.status).toBe("SYNCED"));
    expect(save).toHaveBeenCalledWith(
      { title: "Updated", content: "# Updated" },
      4,
      3,
    );
    expect(lastSavedContentRef.current).toBe("# Updated");
  });
});
