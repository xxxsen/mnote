import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  uploadFile: vi.fn(),
}));
vi.mock("../services/doc-editor.service", () => ({
  docEditorService: {
    getDocument: vi.fn(),
    saveDocument: vi.fn(),
    deleteDocument: vi.fn(),
    listVersions: vi.fn(),
    createShare: vi.fn(),
    getShare: vi.fn(),
    updateShareConfig: vi.fn(),
    revokeShare: vi.fn(),
    searchTags: vi.fn(),
    saveTags: vi.fn(),
  },
}));

import { apiFetch, uploadFile } from "@/lib/api";
import { docEditorService } from "../services/doc-editor.service";
import { useDocumentActions } from "../hooks/useDocumentActions";
import { useTagActions } from "../hooks/useTagActions";
import { usePreviewDoc } from "../hooks/usePreviewDoc";
import { useFilePaste } from "../hooks/useFilePaste";
import { useFloatingPanel } from "../hooks/useFloatingPanel";
import { usePopover } from "../hooks/usePopover";
import { useScrollSync } from "../hooks/useScrollSync";
import { useShareLink } from "../hooks/useShareLink";
import { useSimilarDocs } from "../hooks/useSimilarDocs";
import { useLinkGraph } from "../hooks/useLinkGraph";
import { useQuickOpen } from "../hooks/useQuickOpen";
import { useTagState } from "../hooks/useTagState";

const mockApiFetch = vi.mocked(apiFetch);
const mockUploadFile = vi.mocked(uploadFile);
const mockDocService = vi.mocked(docEditorService);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useDocumentActions", () => {
  it("returns bound action methods", () => {
    const { result } = renderHook(() => useDocumentActions("doc1"));
    expect(result.current.getDocument).toBeInstanceOf(Function);
    expect(result.current.saveDocument).toBeInstanceOf(Function);
    expect(result.current.deleteDocument).toBeInstanceOf(Function);
    expect(result.current.listVersions).toBeInstanceOf(Function);
    expect(result.current.createShare).toBeInstanceOf(Function);
    expect(result.current.getShare).toBeInstanceOf(Function);
    expect(result.current.updateShareConfig).toBeInstanceOf(Function);
    expect(result.current.revokeShare).toBeInstanceOf(Function);
  });

  it("calls service with docId", async () => {
    mockDocService.getDocument.mockResolvedValue({ id: "doc1" } as never);
    const { result } = renderHook(() => useDocumentActions("doc1"));
    await result.current.getDocument();
    expect(mockDocService.getDocument).toHaveBeenCalledWith("doc1");
  });

  it("saveDocument passes title and content", async () => {
    mockDocService.saveDocument.mockResolvedValue(undefined as never);
    const { result } = renderHook(() => useDocumentActions("doc1"));
    await result.current.saveDocument("T", "C");
    expect(mockDocService.saveDocument).toHaveBeenCalledWith("doc1", { title: "T", content: "C" });
  });
});

describe("useTagActions", () => {
  it("returns searchTags and saveTags bound to docId", () => {
    const { result } = renderHook(() => useTagActions("doc1"));
    expect(result.current.searchTags).toBeInstanceOf(Function);
    expect(result.current.saveTags).toBeInstanceOf(Function);
  });

  it("searchTags calls docEditorService", async () => {
    mockDocService.searchTags.mockResolvedValue([] as never);
    const { result } = renderHook(() => useTagActions("doc1"));
    await result.current.searchTags("go");
    expect(mockDocService.searchTags).toHaveBeenCalledWith("go");
  });
});

describe("usePreviewDoc", () => {
  it("starts with null doc and false loading", () => {
    const { result } = renderHook(() => usePreviewDoc());
    expect(result.current.previewDoc).toBeNull();
    expect(result.current.previewLoading).toBe(false);
  });

  it("handleOpenPreview fetches and sets doc", async () => {
    mockApiFetch.mockResolvedValue({ document: { id: "d1", title: "Test" } });
    const { result } = renderHook(() => usePreviewDoc());
    await act(async () => {
      await result.current.handleOpenPreview("d1");
    });
    expect(result.current.previewDoc).toEqual({ id: "d1", title: "Test" });
    expect(result.current.previewLoading).toBe(false);
  });

  it("calls onError on fetch failure", async () => {
    const err = new Error("fail");
    mockApiFetch.mockRejectedValue(err);
    const onError = vi.fn();
    const { result } = renderHook(() => usePreviewDoc({ onError }));
    await act(async () => {
      await result.current.handleOpenPreview("d1");
    });
    expect(onError).toHaveBeenCalledWith(err);
  });
});

describe("useFilePaste", () => {
  it("returns handlePaste callback", () => {
    const { result } = renderHook(() => useFilePaste({
      insertTextAtCursor: vi.fn(),
      replacePlaceholder: vi.fn(),
      toast: vi.fn(),
    }));
    expect(result.current.handlePaste).toBeInstanceOf(Function);
  });

  it("does nothing without clipboard items", async () => {
    const insert = vi.fn();
    const { result } = renderHook(() => useFilePaste({
      insertTextAtCursor: insert,
      replacePlaceholder: vi.fn(),
      toast: vi.fn(),
    }));
    const event = { clipboardData: { items: [] }, preventDefault: vi.fn() } as unknown as ClipboardEvent;
    await act(async () => {
      await result.current.handlePaste(event);
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("uploads file on paste and replaces placeholder", async () => {
    const file = new File(["data"], "image.png", { type: "image/png" });
    const insert = vi.fn();
    const replace = vi.fn();
    mockUploadFile.mockResolvedValue({ url: "/img.png", name: "image.png", content_type: "image/png" });
    const { result } = renderHook(() => useFilePaste({
      insertTextAtCursor: insert,
      replacePlaceholder: replace,
      toast: vi.fn(),
    }));
    const event = {
      clipboardData: { items: [{ kind: "file", getAsFile: () => file }] },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent;
    await act(async () => {
      await result.current.handlePaste(event);
    });
    expect(insert).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith(expect.any(String), expect.stringContaining("![PIC:image.png]"));
  });

  it("handles upload error", async () => {
    const file = new File(["data"], "f.txt", { type: "text/plain" });
    const insert = vi.fn();
    const replace = vi.fn();
    const toast = vi.fn();
    mockUploadFile.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useFilePaste({
      insertTextAtCursor: insert,
      replacePlaceholder: replace,
      toast,
    }));
    const event = {
      clipboardData: { items: [{ kind: "file", getAsFile: () => file }] },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent;
    await act(async () => {
      await result.current.handlePaste(event);
    });
    expect(replace).toHaveBeenCalledWith(expect.any(String), "");
    expect(toast).toHaveBeenCalled();
  });

  it("does not process non-file clipboard items", async () => {
    const insert = vi.fn();
    const { result } = renderHook(() => useFilePaste({
      insertTextAtCursor: insert,
      replacePlaceholder: vi.fn(),
      toast: vi.fn(),
    }));
    const event = {
      clipboardData: { items: [{ kind: "string" }] },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent;
    await act(async () => {
      await result.current.handlePaste(event);
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("handles null clipboardData", async () => {
    const insert = vi.fn();
    const { result } = renderHook(() => useFilePaste({
      insertTextAtCursor: insert,
      replacePlaceholder: vi.fn(),
      toast: vi.fn(),
    }));
    const event = { clipboardData: null } as unknown as ClipboardEvent;
    await act(async () => {
      await result.current.handlePaste(event);
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("generates VIDEO markdown for video content type", async () => {
    const file = new File(["data"], "clip.mp4", { type: "video/mp4" });
    const replace = vi.fn();
    mockUploadFile.mockResolvedValue({ url: "/clip.mp4", name: "clip.mp4", content_type: "video/mp4" });
    const { result } = renderHook(() => useFilePaste({
      insertTextAtCursor: vi.fn(),
      replacePlaceholder: replace,
      toast: vi.fn(),
    }));
    const event = {
      clipboardData: { items: [{ kind: "file", getAsFile: () => file }] },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent;
    await act(async () => {
      await result.current.handlePaste(event);
    });
    expect(replace).toHaveBeenCalledWith(expect.any(String), expect.stringContaining("![VIDEO:"));
  });

  it("generates AUDIO markdown for audio extension", async () => {
    const file = new File(["data"], "song.mp3", { type: "application/octet-stream" });
    const replace = vi.fn();
    mockUploadFile.mockResolvedValue({ url: "/song.mp3", name: "song.mp3", content_type: "application/octet-stream" });
    const { result } = renderHook(() => useFilePaste({
      insertTextAtCursor: vi.fn(),
      replacePlaceholder: replace,
      toast: vi.fn(),
    }));
    const event = {
      clipboardData: { items: [{ kind: "file", getAsFile: () => file }] },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent;
    await act(async () => {
      await result.current.handlePaste(event);
    });
    expect(replace).toHaveBeenCalledWith(expect.any(String), expect.stringContaining("![AUDIO:"));
  });

  it("generates FILE markdown for unknown types", async () => {
    const file = new File(["data"], "doc.pdf", { type: "application/pdf" });
    const replace = vi.fn();
    mockUploadFile.mockResolvedValue({ url: "/doc.pdf", name: "doc.pdf", content_type: "application/pdf" });
    const { result } = renderHook(() => useFilePaste({
      insertTextAtCursor: vi.fn(),
      replacePlaceholder: replace,
      toast: vi.fn(),
    }));
    const event = {
      clipboardData: { items: [{ kind: "file", getAsFile: () => file }] },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent;
    await act(async () => {
      await result.current.handlePaste(event);
    });
    expect(replace).toHaveBeenCalledWith(expect.any(String), expect.stringContaining("[FILE:"));
  });
});

describe("useFloatingPanel", () => {
  it("initializes with default state", () => {
    const { result } = renderHook(() => useFloatingPanel({
      docId: "d1", previewContent: "", summary: "", backlinks: [], outboundLinks: [],
    }));
    expect(result.current.tocContent).toBe("");
    expect(result.current.tocCollapsed).toBe(false);
    expect(result.current.hasTocPanel).toBe(false);
  });

  it("handleTocLoaded sets tocContent", () => {
    const { result } = renderHook(() => useFloatingPanel({
      docId: "d1", previewContent: "[toc]\n# H1", summary: "", backlinks: [], outboundLinks: [],
    }));
    act(() => { result.current.handleTocLoaded("- [H1](#h1)"); });
    expect(result.current.tocContent).toBe("- [H1](#h1)");
    expect(result.current.hasTocPanel).toBe(true);
  });

  it("persists tocCollapsed to localStorage", () => {
    const { result } = renderHook(() => useFloatingPanel({
      docId: "d1", previewContent: "", summary: "", backlinks: [], outboundLinks: [],
    }));
    act(() => { result.current.setTocCollapsed(true); });
    expect(localStorage.getItem("mnote:floating-panel-collapsed")).toBe("1");
  });

  it("computes hasMentionsPanel from backlinks", () => {
    const { result } = renderHook(() => useFloatingPanel({
      docId: "d1", previewContent: "", summary: "",
      backlinks: [{ id: "b1" } as never], outboundLinks: [],
    }));
    expect(result.current.hasMentionsPanel).toBe(true);
  });

  it("computes hasGraphPanel from links", () => {
    const { result } = renderHook(() => useFloatingPanel({
      docId: "d1", previewContent: "", summary: "",
      backlinks: [], outboundLinks: [{ id: "o1" } as never],
    }));
    expect(result.current.hasGraphPanel).toBe(true);
  });

  it("computes hasSummaryPanel from summary", () => {
    const { result } = renderHook(() => useFloatingPanel({
      docId: "d1", previewContent: "", summary: "a summary",
      backlinks: [], outboundLinks: [],
    }));
    expect(result.current.hasSummaryPanel).toBe(true);
  });
});

describe("usePopover", () => {
  it("initializes with no active popover", () => {
    const { result } = renderHook(() => usePopover({ handleFormat: vi.fn() }));
    expect(result.current.activePopover).toBeNull();
    expect(result.current.popoverAnchor).toBeNull();
  });

  it("handleColor calls handleFormat with wrap", () => {
    const handleFormat = vi.fn();
    const { result } = renderHook(() => usePopover({ handleFormat }));
    act(() => { result.current.handleColor("#ff0000"); });
    expect(handleFormat).toHaveBeenCalledWith("wrap", '<span style="color: #ff0000">', "</span>");
  });

  it("handleColor with empty string does nothing", () => {
    const handleFormat = vi.fn();
    const { result } = renderHook(() => usePopover({ handleFormat }));
    act(() => { result.current.handleColor(""); });
    expect(handleFormat).not.toHaveBeenCalled();
  });

  it("handleSize calls handleFormat with wrap", () => {
    const handleFormat = vi.fn();
    const { result } = renderHook(() => usePopover({ handleFormat }));
    act(() => { result.current.handleSize("20px"); });
    expect(handleFormat).toHaveBeenCalledWith("wrap", '<span style="font-size: 20px">', "</span>");
  });

  it("handleSize with empty string does nothing", () => {
    const handleFormat = vi.fn();
    const { result } = renderHook(() => usePopover({ handleFormat }));
    act(() => { result.current.handleSize(""); });
    expect(handleFormat).not.toHaveBeenCalled();
  });

  it("activeEmojiTab defaults to first tab", () => {
    const { result } = renderHook(() => usePopover({ handleFormat: vi.fn() }));
    expect(result.current.activeEmojiTab.key).toBe("smileys");
  });
});

describe("useScrollSync", () => {
  it("returns refs and handlers", () => {
    const editorViewRef = { current: null };
    const { result } = renderHook(() => useScrollSync({ loading: false, editorViewRef }));
    expect(result.current.previewRef).toBeDefined();
    expect(result.current.handleEditorScroll).toBeInstanceOf(Function);
    expect(result.current.handlePreviewScroll).toBeInstanceOf(Function);
  });

  it("handleEditorScroll does nothing when loading", () => {
    const editorViewRef = { current: null };
    const { result } = renderHook(() => useScrollSync({ loading: true, editorViewRef }));
    expect(() => result.current.handleEditorScroll()).not.toThrow();
  });

  it("handlePreviewScroll does nothing when no view", () => {
    const editorViewRef = { current: null };
    const { result } = renderHook(() => useScrollSync({ loading: false, editorViewRef }));
    expect(() => result.current.handlePreviewScroll()).not.toThrow();
  });
});

describe("useShareLink", () => {
  it("initializes with empty state", () => {
    const { result } = renderHook(() => useShareLink({ docId: "d1" }));
    expect(result.current.shareUrl).toBe("");
    expect(result.current.activeShare).toBeNull();
    expect(result.current.copied).toBe(false);
  });

  it("handleShare creates share", async () => {
    mockDocService.createShare.mockResolvedValue({ token: "tok123" } as never);
    const { result } = renderHook(() => useShareLink({ docId: "d1" }));
    await act(async () => { await result.current.handleShare(); });
    expect(result.current.activeShare).toEqual({ token: "tok123" });
    expect(result.current.shareUrl).toContain("/share/tok123");
  });

  it("loadShare sets share data", async () => {
    mockDocService.getShare.mockResolvedValue({ share: { token: "tok1" } } as never);
    const { result } = renderHook(() => useShareLink({ docId: "d1" }));
    await act(async () => { await result.current.loadShare(); });
    expect(result.current.activeShare).toEqual({ token: "tok1" });
  });

  it("loadShare handles null share", async () => {
    mockDocService.getShare.mockResolvedValue({ share: null } as never);
    const { result } = renderHook(() => useShareLink({ docId: "d1" }));
    await act(async () => { await result.current.loadShare(); });
    expect(result.current.activeShare).toBeNull();
    expect(result.current.shareUrl).toBe("");
  });

  it("loadShare calls onError on failure", async () => {
    const err = new Error("fail");
    mockDocService.getShare.mockRejectedValue(err);
    const onError = vi.fn();
    const { result } = renderHook(() => useShareLink({ docId: "d1", onError }));
    await act(async () => { await result.current.loadShare(); });
    expect(onError).toHaveBeenCalledWith(err);
  });

  it("handleRevokeShare clears share state", async () => {
    mockDocService.revokeShare.mockResolvedValue(undefined as never);
    const { result } = renderHook(() => useShareLink({ docId: "d1" }));
    await act(async () => { await result.current.handleRevokeShare(); });
    expect(result.current.activeShare).toBeNull();
  });

  it("updateShareConfig updates share", async () => {
    mockDocService.updateShareConfig.mockResolvedValue({ token: "new-tok" } as never);
    const { result } = renderHook(() => useShareLink({ docId: "d1" }));
    await act(async () => {
      await result.current.updateShareConfig({ expires_at: 0, permission: "view", allow_download: true });
    });
    expect(result.current.shareUrl).toContain("/share/new-tok");
  });

  it("handleCopyLink does nothing without shareUrl", () => {
    const { result } = renderHook(() => useShareLink({ docId: "d1" }));
    expect(() => result.current.handleCopyLink()).not.toThrow();
  });
});

describe("useSimilarDocs", () => {
  it("initializes with collapsed state", () => {
    const { result } = renderHook(() => useSimilarDocs({ docId: "d1", title: "" }));
    expect(result.current.similarDocs).toEqual([]);
    expect(result.current.similarLoading).toBe(false);
    expect(result.current.similarCollapsed).toBe(true);
  });

  it("handleToggleSimilar opens and fetches", async () => {
    mockApiFetch.mockResolvedValue({ items: [{ id: "s1", title: "Sim", score: 0.9 }] });
    const { result } = renderHook(() => useSimilarDocs({ docId: "d1", title: "Hello" }));
    await act(async () => { result.current.handleToggleSimilar(); });
    expect(result.current.similarCollapsed).toBe(false);
  });

  it("handleCollapseSimilar collapses", () => {
    const { result } = renderHook(() => useSimilarDocs({ docId: "d1", title: "Hello" }));
    act(() => { result.current.handleCollapseSimilar(); });
    expect(result.current.similarCollapsed).toBe(true);
  });

  it("handleCloseSimilar resets everything", () => {
    const { result } = renderHook(() => useSimilarDocs({ docId: "d1", title: "Hello" }));
    act(() => { result.current.handleCloseSimilar(); });
    expect(result.current.similarCollapsed).toBe(true);
    expect(result.current.similarDocs).toEqual([]);
    expect(result.current.similarIconVisible).toBe(false);
  });

  it("shows icon when title is long enough", async () => {
    const { result } = renderHook(() => useSimilarDocs({ docId: "d1", title: "Long title" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(result.current.similarIconVisible).toBe(true);
  });

  it("hides icon when title is too short", async () => {
    const { result } = renderHook(() => useSimilarDocs({ docId: "d1", title: "x" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(result.current.similarIconVisible).toBe(false);
  });
});

describe("useLinkGraph", () => {
  it("fetches backlinks on mount", async () => {
    mockApiFetch.mockResolvedValue([]);
    const { result } = renderHook(() => useLinkGraph({ docId: "d1", title: "T", previewContent: "" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(result.current.backlinks).toEqual([]);
  });

  it("computes linkGraph with current node", async () => {
    mockApiFetch.mockResolvedValue([]);
    const { result } = renderHook(() => useLinkGraph({ docId: "d1", title: "My Doc", previewContent: "" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(result.current.linkGraph.nodes).toEqual([
      expect.objectContaining({ id: "d1", title: "My Doc", kind: "current" }),
    ]);
  });

  it("includes backlinks as incoming nodes", async () => {
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url.includes("/backlinks")) return [{ id: "b1", title: "Back" }];
      return [];
    });
    const { result } = renderHook(() => useLinkGraph({ docId: "d1", title: "Doc", previewContent: "" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(result.current.backlinks).toHaveLength(1);
    expect(result.current.linkGraph.nodes).toHaveLength(2);
    expect(result.current.linkGraph.edges).toContainEqual({ from: "b1", to: "d1" });
  });
});

describe("useQuickOpen", () => {
  it("initializes with closed state", () => {
    const { result } = renderHook(() => useQuickOpen({ onSelectDocument: vi.fn() }));
    expect(result.current.showQuickOpen).toBe(false);
    expect(result.current.quickOpenQuery).toBe("");
  });

  it("handleOpenQuickOpen opens dialog", () => {
    const { result } = renderHook(() => useQuickOpen({ onSelectDocument: vi.fn() }));
    act(() => { result.current.handleOpenQuickOpen(); });
    expect(result.current.showQuickOpen).toBe(true);
  });

  it("handleCloseQuickOpen closes and resets", () => {
    const { result } = renderHook(() => useQuickOpen({ onSelectDocument: vi.fn() }));
    act(() => { result.current.handleOpenQuickOpen(); });
    act(() => { result.current.handleCloseQuickOpen(); });
    expect(result.current.showQuickOpen).toBe(false);
    expect(result.current.quickOpenQuery).toBe("");
  });

  it("handleQuickOpenSelect calls onSelectDocument", () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() => useQuickOpen({ onSelectDocument: onSelect }));
    const doc = { id: "d1", title: "T" } as never;
    act(() => { result.current.handleQuickOpenSelect(doc); });
    expect(onSelect).toHaveBeenCalledWith(doc);
  });

  it("fetches recent docs when dialog opens", async () => {
    mockApiFetch.mockResolvedValue([{ id: "r1", title: "Recent" }]);
    const { result } = renderHook(() => useQuickOpen({ onSelectDocument: vi.fn() }));
    act(() => { result.current.handleOpenQuickOpen(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(result.current.quickOpenRecent).toHaveLength(1);
  });

  it("searches when query changes", async () => {
    mockApiFetch.mockResolvedValue([{ id: "s1", title: "Search" }]);
    const { result } = renderHook(() => useQuickOpen({ onSelectDocument: vi.fn() }));
    act(() => { result.current.handleOpenQuickOpen(); });
    act(() => { result.current.setQuickOpenQuery("test"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(result.current.showSearchResults).toBe(true);
  });
});

describe("useTagState", () => {
  const makeOpts = () => ({
    tagActions: { saveTags: vi.fn().mockResolvedValue(undefined), searchTags: vi.fn().mockResolvedValue([]) },
    toast: vi.fn(),
    setLastSavedAt: vi.fn(),
  });

  it("initializes with empty state", () => {
    const { result } = renderHook(() => useTagState(makeOpts()));
    expect(result.current.allTags).toEqual([]);
    expect(result.current.selectedTagIDs).toEqual([]);
  });

  it("mergeTags adds new tags", () => {
    const { result } = renderHook(() => useTagState(makeOpts()));
    act(() => {
      result.current.mergeTags([{ id: "t1", name: "go" } as never]);
    });
    expect(result.current.allTags).toHaveLength(1);
    expect(result.current.tagIndex["t1"]).toBeDefined();
  });

  it("mergeTags skips duplicates", () => {
    const { result } = renderHook(() => useTagState(makeOpts()));
    act(() => {
      result.current.mergeTags([{ id: "t1", name: "go" } as never]);
      result.current.mergeTags([{ id: "t1", name: "go" } as never]);
    });
    expect(result.current.allTags).toHaveLength(1);
  });

  it("mergeTags ignores empty array", () => {
    const { result } = renderHook(() => useTagState(makeOpts()));
    act(() => { result.current.mergeTags([]); });
    expect(result.current.allTags).toEqual([]);
  });

  it("saveTagIDs saves and updates state", async () => {
    const opts = makeOpts();
    const { result } = renderHook(() => useTagState(opts));
    await act(async () => { await result.current.saveTagIDs(["t1", "t2"]); });
    expect(opts.tagActions.saveTags).toHaveBeenCalledWith(["t1", "t2"]);
    expect(result.current.selectedTagIDs).toEqual(["t1", "t2"]);
    expect(opts.setLastSavedAt).toHaveBeenCalled();
  });

  it("saveTagIDs reverts on failure", async () => {
    const opts = makeOpts();
    opts.tagActions.saveTags.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useTagState(opts));
    await act(async () => { await result.current.saveTagIDs(["t1"]); });
    expect(result.current.selectedTagIDs).toEqual([]);
    expect(opts.toast).toHaveBeenCalled();
  });

  it("toggleTag adds tag", async () => {
    const opts = makeOpts();
    const { result } = renderHook(() => useTagState(opts));
    await act(async () => { result.current.toggleTag("t1"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(opts.tagActions.saveTags).toHaveBeenCalledWith(["t1"]);
  });

  it("toggleTag removes existing tag", async () => {
    const opts = makeOpts();
    const { result } = renderHook(() => useTagState(opts));
    await act(async () => { await result.current.saveTagIDs(["t1", "t2"]); });
    await act(async () => { result.current.toggleTag("t1"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(opts.tagActions.saveTags).toHaveBeenLastCalledWith(["t2"]);
  });

  it("toggleTag shows toast at max tags", () => {
    const opts = makeOpts();
    const { result } = renderHook(() => useTagState(opts));
    act(() => { result.current.setSelectedTagIDs(["1", "2", "3", "4", "5", "6", "7"]); });
    act(() => { result.current.toggleTag("8"); });
    expect(opts.toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining("7") }));
  });

  it("findExistingTagByName returns cached tag", async () => {
    const opts = makeOpts();
    const { result } = renderHook(() => useTagState(opts));
    act(() => { result.current.mergeTags([{ id: "t1", name: "go" } as never]); });
    const found = await act(async () => result.current.findExistingTagByName("go"));
    expect(found).toEqual(expect.objectContaining({ id: "t1" }));
  });

  it("findExistingTagByName searches API when not cached", async () => {
    const opts = makeOpts();
    opts.tagActions.searchTags.mockResolvedValue([{ id: "t2", name: "rust" }]);
    const { result } = renderHook(() => useTagState(opts));
    const found = await act(async () => result.current.findExistingTagByName("rust"));
    expect(found).toEqual(expect.objectContaining({ id: "t2" }));
  });

  it("findExistingTagByName returns null for empty", async () => {
    const { result } = renderHook(() => useTagState(makeOpts()));
    const found = await act(async () => result.current.findExistingTagByName(""));
    expect(found).toBeNull();
  });
});
