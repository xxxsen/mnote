import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useEditorDecisionActions } from "../hooks/useEditorDecisions";
import type { DocDetail } from "../types";

function detail(content = "# Server\nbody", revision = 9): DocDetail {
  return {
    document: {
      id: "d1",
      user_id: "u1",
      title: "Server",
      content,
      summary: "",
      state: 1,
      pinned: 0,
      starred: 0,
      ctime: 10,
      mtime: 20,
      content_hash: `hash-${revision}`,
      content_mtime: 20,
      content_revision: revision,
    },
    tag_ids: [],
    tags: [],
  };
}

function setup(overrides: Record<string, unknown> = {}) {
  const serverDetail = detail();
  const draftRecovery = {
    draft: {
      version: 2 as const,
      docId: "d1",
      content: "# Local\nbody",
      updatedAt: 1,
      baseRevision: 8,
      baseContentHash: "hash-8",
    },
    detail: serverDetail,
  };
  const opts = {
    draftRecovery,
    setDraftRecovery: vi.fn(),
    conflictServer: serverDetail,
    clearConflict: vi.fn(),
    initializeLoaded: vi.fn(),
    removeLocalDraft: vi.fn(() => true),
    contentRef: { current: "# Mine\nlatest" },
    setLastSavedContent: vi.fn(),
    applyContent: vi.fn(),
    setDirty: vi.fn(),
    markLocalChanges: vi.fn(),
    requestSave: vi.fn(),
    resyncRevision: vi.fn(),
    extractTitle: (content: string) => content.match(/^#\s+(.+)/)?.[1] ?? "",
    notify: vi.fn(),
    ...overrides,
  };
  const hook = renderHook(() => useEditorDecisionActions(opts));
  return { ...hook, opts, serverDetail, draftRecovery };
}

describe("useEditorDecisionActions", () => {
  it("uses the server version from draft recovery and removes the local draft", () => {
    const { result, opts, serverDetail } = setup();

    act(() => result.current.useRecoveredServer());

    expect(opts.removeLocalDraft).toHaveBeenCalledTimes(1);
    expect(opts.setDraftRecovery).toHaveBeenCalledWith(null);
    expect(opts.initializeLoaded).toHaveBeenCalledWith(
      serverDetail.document.content,
      serverDetail,
      false,
    );
  });

  it("recovers the local draft against the currently loaded server base", () => {
    const { result, opts, serverDetail, draftRecovery } = setup();

    act(() => result.current.useRecoveredLocal());

    expect(opts.setDraftRecovery).toHaveBeenCalledWith(null);
    expect(opts.initializeLoaded).toHaveBeenCalledWith(
      draftRecovery.draft.content,
      serverDetail,
      true,
    );
  });

  it("replaces the editor with the server version after a save conflict", () => {
    const { result, opts, serverDetail } = setup();

    act(() => result.current.useConflictServer());

    expect(opts.setLastSavedContent).toHaveBeenCalledWith(serverDetail.document.content);
    expect(opts.resyncRevision).toHaveBeenCalledWith(expect.objectContaining({
      revision: 9,
      hash: "hash-9",
      content: serverDetail.document.content,
    }));
    expect(opts.applyContent).toHaveBeenCalledWith(serverDetail.document.content);
    expect(opts.setDirty).toHaveBeenCalledWith(false);
    expect(opts.removeLocalDraft).toHaveBeenCalledTimes(1);
    expect(opts.clearConflict).toHaveBeenCalledTimes(1);
  });

  it("resyncs to the fetched base before explicitly keeping the local draft", () => {
    const { result, opts, serverDetail } = setup();

    act(() => result.current.keepConflictDraft());

    expect(opts.setLastSavedContent).toHaveBeenCalledWith(serverDetail.document.content);
    expect(opts.resyncRevision).toHaveBeenCalledWith(expect.objectContaining({
      revision: 9,
      hash: "hash-9",
    }));
    expect(opts.setDirty).toHaveBeenCalledWith(true);
    expect(opts.markLocalChanges).toHaveBeenCalledTimes(1);
    expect(opts.clearConflict).toHaveBeenCalledTimes(1);
    expect(opts.requestSave).toHaveBeenCalledWith({
      title: "Mine",
      content: "# Mine\nlatest",
    });
  });

  it("does not overwrite the server when the kept draft has no title", () => {
    const { result, opts } = setup({
      contentRef: { current: "titleless body" },
    });

    act(() => result.current.keepConflictDraft());

    expect(opts.notify).toHaveBeenCalledWith("Add a title before syncing this draft.");
    expect(opts.resyncRevision).not.toHaveBeenCalled();
    expect(opts.clearConflict).not.toHaveBeenCalled();
    expect(opts.requestSave).not.toHaveBeenCalled();
  });
});
