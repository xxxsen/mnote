import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error { code: number; constructor(m: string, c: number) { super(m); this.code = c; } },
  getAuthToken: vi.fn().mockReturnValue(null),
}));

vi.mock("next/navigation", () => ({
  useParams: vi.fn().mockReturnValue({ token: "test-token" }),
}));

import { apiFetch } from "@/lib/api";
import { useShareComments } from "../hooks/useShareComments";
import { useShareToc } from "../hooks/useShareToc";

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
afterEach(() => { cleanup(); });

describe("useShareComments", () => {
  const stableShowToast = vi.fn();
  const stableDetail = { permission: 2 };
  const stableNullDetail = null;
  const makeOpts = (overrides: Record<string, unknown> = {}) => ({
    detail: stableDetail as { permission?: number } | null,
    token: "tok", accessPassword: "",
    canAnnotate: true, guestAuthor: "Guest #ABCD",
    showToast: stableShowToast, ...overrides,
  });

  it("initializes with empty comments", () => {
    mockApiFetch.mockResolvedValue({ items: [], total: 0 });
    const { result } = renderHook(() => useShareComments(makeOpts()));
    expect(result.current.comments).toEqual([]);
    expect(result.current.commentsTotal).toBe(0);
  });

  it("fetches comments on detail change", async () => {
    mockApiFetch.mockResolvedValue({ items: [{ id: "c1", content: "hi" }], total: 1 });
    const { result } = renderHook(() => useShareComments(makeOpts()));
    await waitFor(() => { expect(result.current.comments).toHaveLength(1); });
    expect(result.current.commentsTotal).toBe(1);
  });

  it("clears comments when detail is null", async () => {
    mockApiFetch.mockResolvedValue({ items: [], total: 0 });
    const { result } = renderHook(() => useShareComments(makeOpts({ detail: stableNullDetail })));
    await waitFor(() => { expect(result.current.commentsLoading).toBe(false); });
    expect(result.current.comments).toEqual([]);
  });

  it("handles fetch error", async () => {
    mockApiFetch.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useShareComments(makeOpts()));
    await waitFor(() => { expect(result.current.commentsLoading).toBe(false); });
    expect(result.current.comments).toEqual([]);
  });

  it("handleSubmitComment submits comment", async () => {
    mockApiFetch.mockResolvedValue({ items: [], total: 0 });
    const opts = makeOpts();
    const { result } = renderHook(() => useShareComments(opts));
    await waitFor(() => { expect(result.current.commentsLoading).toBe(false); });
    act(() => { result.current.setAnnotationContent("hello"); });
    mockApiFetch.mockResolvedValueOnce({ id: "c1", content: "hello" });
    mockApiFetch.mockResolvedValueOnce({ items: [{ id: "c1", content: "hello" }], total: 1 });
    await act(async () => { await result.current.handleSubmitComment(); });
    expect(opts.showToast).toHaveBeenCalledWith("Comment added.");
  });

  it("handleSubmitComment does nothing with empty content", async () => {
    mockApiFetch.mockResolvedValue({ items: [], total: 0 });
    const opts = makeOpts();
    const { result } = renderHook(() => useShareComments(opts));
    await waitFor(() => { expect(result.current.commentsLoading).toBe(false); });
    await act(async () => { await result.current.handleSubmitComment(); });
    expect(opts.showToast).toHaveBeenCalledWith(expect.stringContaining("enter"));
  });

  it("setAnnotationContent works", () => {
    mockApiFetch.mockResolvedValue({ items: [], total: 0 });
    const { result } = renderHook(() => useShareComments(makeOpts()));
    act(() => { result.current.setAnnotationContent("test"); });
    expect(result.current.annotationContent).toBe("test");
  });

  it("setReplyingTo works", () => {
    mockApiFetch.mockResolvedValue({ items: [], total: 0 });
    const { result } = renderHook(() => useShareComments(makeOpts()));
    act(() => { result.current.setReplyingTo({ id: "c1", author: "Bob" }); });
    expect(result.current.replyingTo).toEqual({ id: "c1", author: "Bob" });
  });

  it("handleSubmitComment error shows toast", async () => {
    mockApiFetch.mockResolvedValue({ items: [], total: 0 });
    const opts = makeOpts();
    const { result } = renderHook(() => useShareComments(opts));
    await waitFor(() => { expect(result.current.commentsLoading).toBe(false); });
    act(() => { result.current.setAnnotationContent("Hello"); });
    mockApiFetch.mockRejectedValueOnce(new Error("Server error"));
    await act(async () => { await result.current.handleSubmitComment(); });
    expect(stableShowToast).toHaveBeenCalledWith("Server error", 3000);
  });

  it("handleSubmitComment no-op when canAnnotate is false", async () => {
    mockApiFetch.mockResolvedValue({ items: [], total: 0 });
    const opts = makeOpts({ canAnnotate: false });
    const { result } = renderHook(() => useShareComments(opts));
    await waitFor(() => { expect(result.current.commentsLoading).toBe(false); });
    act(() => { result.current.setAnnotationContent("Hello"); });
    await act(async () => { await result.current.handleSubmitComment(); });
    expect(mockApiFetch).not.toHaveBeenCalledWith(expect.stringContaining("comments"), expect.objectContaining({ method: "POST" }));
  });

  it("setInlineReplyContent works", () => {
    mockApiFetch.mockResolvedValue({ items: [], total: 0 });
    const opts = makeOpts();
    const { result } = renderHook(() => useShareComments(opts));
    act(() => { result.current.setInlineReplyContent("reply text"); });
    expect(result.current.inlineReplyContent).toBe("reply text");
  });

  it("handleLoadMoreComments triggers append fetch", async () => {
    mockApiFetch.mockResolvedValue({ items: Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, content: `c${i}` })), total: 20 });
    const opts = makeOpts();
    const { result } = renderHook(() => useShareComments(opts));
    await waitFor(() => { expect(result.current.comments).toHaveLength(10); });
    expect(result.current.commentsHasMore).toBe(true);
    mockApiFetch.mockResolvedValueOnce({ items: [{ id: "c10", content: "c10" }], total: 20 });
    await act(async () => { result.current.handleLoadMoreComments(); });
    await waitFor(() => { expect(result.current.comments.length).toBeGreaterThanOrEqual(10); });
  });

  it("fetchComments background mode does not set loading", async () => {
    mockApiFetch.mockResolvedValue({ items: [{ id: "c1", content: "hi" }], total: 1 });
    const opts = makeOpts();
    const { result } = renderHook(() => useShareComments(opts));
    await waitFor(() => { expect(result.current.comments).toHaveLength(1); });
    expect(result.current.commentsLoading).toBe(false);
  });

  it("handleSubmitComment does nothing when detail is null", async () => {
    mockApiFetch.mockResolvedValue({ items: [], total: 0 });
    const opts = makeOpts({ detail: stableNullDetail });
    const { result } = renderHook(() => useShareComments(opts));
    await waitFor(() => { expect(result.current.commentsLoading).toBe(false); });
    act(() => { result.current.setAnnotationContent("Hello"); });
    await act(async () => { await result.current.handleSubmitComment(); });
    expect(mockApiFetch).not.toHaveBeenCalledWith(expect.stringContaining("comments"), expect.objectContaining({ method: "POST" }));
  });

  it("accessPassword is included in query string", async () => {
    mockApiFetch.mockResolvedValue({ items: [], total: 0 });
    renderHook(() => useShareComments(makeOpts({ accessPassword: "secret" })));
    await waitFor(() => { expect(mockApiFetch).toHaveBeenCalledWith(expect.stringContaining("password=secret"), expect.objectContaining({ requireAuth: false })); });
  });

  it("handleSubmitComment sends with replyingTo parent", async () => {
    mockApiFetch.mockResolvedValue({ items: [], total: 0 });
    const opts = makeOpts();
    const { result } = renderHook(() => useShareComments(opts));
    await waitFor(() => { expect(result.current.commentsLoading).toBe(false); });
    act(() => { result.current.setAnnotationContent("reply content"); });
    act(() => { result.current.setReplyingTo({ id: "p1", author: "Alice" }); });
    mockApiFetch.mockResolvedValueOnce({ id: "c2", content: "reply content" });
    mockApiFetch.mockResolvedValueOnce({ items: [], total: 0 });
    await act(async () => { await result.current.handleSubmitComment(); });
    expect(opts.showToast).toHaveBeenCalledWith("Comment added.");
  });

  it("handleLoadMoreComments no-op when no more comments", async () => {
    mockApiFetch.mockResolvedValue({ items: [{ id: "c1", content: "hi" }], total: 1 });
    const opts = makeOpts();
    const { result } = renderHook(() => useShareComments(opts));
    await waitFor(() => { expect(result.current.comments).toHaveLength(1); });
    await waitFor(() => { expect(result.current.commentsHasMore).toBe(false); });
    const callCount = mockApiFetch.mock.calls.length;
    act(() => { result.current.handleLoadMoreComments(); });
    expect(mockApiFetch.mock.calls.length).toBe(callCount);
  });

  it("fetch comments on detail change with empty accessPassword", async () => {
    mockApiFetch.mockResolvedValue({ items: [{ id: "c1", content: "hi" }], total: 1 });
    const opts = makeOpts({ accessPassword: "" });
    const { result } = renderHook(() => useShareComments(opts));
    await waitFor(() => { expect(result.current.comments).toHaveLength(1); });
    expect(mockApiFetch).toHaveBeenCalledWith(expect.not.stringContaining("password="), expect.anything());
  });
});

describe("useShareToc", () => {
  it("starts with empty toc state", () => {
    const ref = { current: null };
    const { result } = renderHook(() => useShareToc(ref, undefined));
    expect(result.current.tocContent).toBe("");
    expect(result.current.showFloatingToc).toBe(false);
    expect(result.current.hasTocToken).toBe(false);
  });

  it("hasTocToken detects [toc] in content", () => {
    const ref = { current: null };
    const { result } = renderHook(() => useShareToc(ref, { content: "[toc]\n# H1" }));
    expect(result.current.hasTocToken).toBe(true);
  });

  it("handleTocLoaded sets toc content with token", () => {
    const ref = { current: null };
    const { result } = renderHook(() => useShareToc(ref, { content: "[toc]\n# H1" }));
    act(() => { result.current.handleTocLoaded("- [H1](#h1)"); });
    expect(result.current.tocContent).toBe("- [H1](#h1)");
  });

  it("handleTocLoaded clears when no toc token", () => {
    const ref = { current: null };
    const { result } = renderHook(() => useShareToc(ref, { content: "# H1" }));
    act(() => { result.current.handleTocLoaded("- [H1](#h1)"); });
    expect(result.current.tocContent).toBe("");
  });

  it("toggles tocCollapsed", () => {
    const ref = { current: null };
    const { result } = renderHook(() => useShareToc(ref, undefined));
    act(() => { result.current.setTocCollapsed(true); });
    expect(result.current.tocCollapsed).toBe(true);
  });

  it("toggles showMobileToc", () => {
    const ref = { current: null };
    const { result } = renderHook(() => useShareToc(ref, undefined));
    act(() => { result.current.setShowMobileToc(true); });
    expect(result.current.showMobileToc).toBe(true);
  });
});
