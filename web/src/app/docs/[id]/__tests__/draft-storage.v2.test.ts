import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  classifyStoredDraft,
  flushDraft,
  removeDraft,
  type DraftServerSnapshot,
} from "../services/draft-storage";

const server: DraftServerSnapshot = {
  docId: "d1",
  content: "# Server",
  contentRevision: 7,
  contentHash: "hash-7",
};

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("draft storage v2", () => {
  it("auto-recovers an empty draft when its base matches", () => {
    localStorage.setItem("mnote:draft:d1", JSON.stringify({
      version: 2,
      docId: "d1",
      content: "",
      updatedAt: 123,
      baseRevision: 7,
      baseContentHash: "hash-7",
    }));

    expect(classifyStoredDraft(localStorage, server)).toEqual({
      kind: "auto_recover",
      draft: expect.objectContaining({ content: "", baseRevision: 7 }),
    });
  });

  it("requires a decision for a stale v2 draft", () => {
    localStorage.setItem("mnote:draft:d1", JSON.stringify({
      version: 2,
      docId: "d1",
      content: "# Local",
      updatedAt: 123,
      baseRevision: 6,
      baseContentHash: "hash-6",
    }));

    expect(classifyStoredDraft(localStorage, server)).toEqual({
      kind: "needs_recovery",
      draft: expect.objectContaining({ content: "# Local" }),
    });
  });

  it("requires a decision for a non-empty legacy draft", () => {
    localStorage.setItem(
      "mnote:draft:d1",
      JSON.stringify({ content: "# Legacy", updatedAt: 123 }),
    );

    expect(classifyStoredDraft(localStorage, server)).toEqual({
      kind: "needs_recovery",
      draft: expect.objectContaining({ content: "# Legacy" }),
    });
  });

  it("treats legacy empty content as a valid recovery candidate", () => {
    localStorage.setItem("mnote:draft:d1", JSON.stringify({ content: "", updatedAt: 123 }));
    expect(classifyStoredDraft(localStorage, server).kind).toBe("needs_recovery");
  });

  it("removes malformed JSON", () => {
    localStorage.setItem("mnote:draft:d1", "{invalid");

    expect(classifyStoredDraft(localStorage, server).kind).toBe("use_server");
    expect(localStorage.getItem("mnote:draft:d1")).toBeNull();
  });

  it("removes drafts with invalid field types", () => {
    localStorage.setItem("mnote:draft:d1", JSON.stringify({
      version: 2,
      docId: "d1",
      content: 42,
      updatedAt: 123,
      baseRevision: 7,
      baseContentHash: "hash-7",
    }));

    expect(classifyStoredDraft(localStorage, server).kind).toBe("use_server");
    expect(localStorage.getItem("mnote:draft:d1")).toBeNull();
  });

  it("removes drafts that belong to another document", () => {
    localStorage.setItem("mnote:draft:d1", JSON.stringify({
      version: 2,
      docId: "other",
      content: "body",
      updatedAt: 123,
      baseRevision: 7,
      baseContentHash: "hash-7",
    }));

    expect(classifyStoredDraft(localStorage, server).kind).toBe("use_server");
    expect(localStorage.getItem("mnote:draft:d1")).toBeNull();
  });

  it("cleans up a draft whose content already matches the server", () => {
    localStorage.setItem("mnote:draft:d1", JSON.stringify({
      version: 2,
      docId: "d1",
      content: "# Server",
      updatedAt: 123,
      baseRevision: 6,
      baseContentHash: "hash-6",
    }));

    expect(classifyStoredDraft(localStorage, server).kind).toBe("use_server");
    expect(localStorage.getItem("mnote:draft:d1")).toBeNull();
  });

  it("reports localStorage failures without throwing", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(flushDraft(localStorage, {
      version: 2,
      docId: "d1",
      content: "# Local",
      updatedAt: 123,
      baseRevision: 7,
      baseContentHash: "hash-7",
    })).toEqual({ ok: false, error: expect.any(DOMException) });
    setItem.mockRestore();
    expect(removeDraft(localStorage, "d1").ok).toBe(true);
  });
});
