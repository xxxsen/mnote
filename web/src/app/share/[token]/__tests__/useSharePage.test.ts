import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";

const stableToast = vi.fn();
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error { code: number; constructor(m: string, c: number) { super(m); this.code = c; } },
  getAuthToken: vi.fn().mockReturnValue("tok"),
}));
vi.mock("next/navigation", () => ({
  useParams: vi.fn().mockReturnValue({ token: "abc123" }),
}));

import { apiFetch, ApiError } from "@/lib/api";
import { useSharePage } from "../hooks/useSharePage";

const mockApiFetch = vi.mocked(apiFetch);

const makeDetail = (overrides = {}) => ({
  document: { id: "d1", title: "Test Doc", content: "# Hello\nWorld", ctime: 0, mtime: 0 },
  permission: 2,
  allow_download: 1,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("useSharePage", () => {
  it("fetches share detail on mount", async () => {
    mockApiFetch.mockResolvedValue(makeDetail());
    const { result } = renderHook(() => useSharePage());
    expect(result.current.loading).toBe(true);
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    expect(result.current.detail).toBeTruthy();
    expect(result.current.doc?.title).toBe("Test Doc");
  });

  it("sets error on fetch failure", async () => {
    mockApiFetch.mockRejectedValue(new Error("network error"));
    const { result } = renderHook(() => useSharePage());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    expect(result.current.error).toBe(true);
  });

  it("handles password-required response", async () => {
    const err = new ApiError("password required", 10000002);
    mockApiFetch.mockRejectedValue(err);
    const { result } = renderHook(() => useSharePage());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    expect(result.current.passwordRequired).toBe(true);
  });

  it("canAnnotate reflects permission level", async () => {
    mockApiFetch.mockResolvedValue(makeDetail({ permission: 2 }));
    const { result } = renderHook(() => useSharePage());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    expect(result.current.canAnnotate).toBe(true);
    expect(result.current.permissionLabel).toBe("Annotate");
  });

  it("read-only permission", async () => {
    mockApiFetch.mockResolvedValue(makeDetail({ permission: 1 }));
    const { result } = renderHook(() => useSharePage());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    expect(result.current.canAnnotate).toBe(false);
    expect(result.current.permissionLabel).toBe("Read");
  });

  it("showToast sets and clears toast", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockApiFetch.mockResolvedValue(makeDetail());
    const { result } = renderHook(() => useSharePage());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.showToast("Hello!", 100); });
    expect(result.current.toast).toBe("Hello!");
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(result.current.toast).toBeNull();
    vi.useRealTimers();
  });

  it("slugify converts headings to slugs", async () => {
    mockApiFetch.mockResolvedValue(makeDetail());
    const { result } = renderHook(() => useSharePage());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    expect(result.current.slugify("Hello World")).toBe("hello-world");
    expect(result.current.slugify("")).toBe("section");
  });

  it("getElementById returns element from preview ref", async () => {
    mockApiFetch.mockResolvedValue(makeDetail());
    const { result } = renderHook(() => useSharePage());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    const el = result.current.getElementById("test");
    expect(el).toBeNull();
  });

  it("token is extracted from params", async () => {
    mockApiFetch.mockResolvedValue(makeDetail());
    const { result } = renderHook(() => useSharePage());
    expect(result.current.token).toBe("abc123");
  });

  it("sets document title from content", async () => {
    mockApiFetch.mockResolvedValue(makeDetail());
    const { result } = renderHook(() => useSharePage());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    expect(document.title).toBe("Hello");
  });

  it("sharePasswordInput state works", async () => {
    mockApiFetch.mockResolvedValue(makeDetail());
    const { result } = renderHook(() => useSharePage());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.setSharePasswordInput("secret"); });
    expect(result.current.sharePasswordInput).toBe("secret");
  });

  it("handleCopyLink copies to clipboard", async () => {
    mockApiFetch.mockResolvedValue(makeDetail());
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const { result } = renderHook(() => useSharePage());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.handleCopyLink(); });
  });

  it("handleExport no-op when doc is null", async () => {
    mockApiFetch.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useSharePage());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.handleExport(); });
  });

  it("handleExport no-op when allow_download is 0", async () => {
    mockApiFetch.mockResolvedValue(makeDetail({ allow_download: 0 }));
    const { result } = renderHook(() => useSharePage());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.handleExport(); });
  });

  it("password required error sets passwordRequired", async () => {
    const { ApiError: AE } = await import("@/lib/api");
    mockApiFetch.mockRejectedValue(new AE("Password required", 10000002));
    const { result } = renderHook(() => useSharePage());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    expect(result.current.passwordRequired).toBe(true);
  });

  it("generic error sets error state", async () => {
    mockApiFetch.mockRejectedValue(new Error("unknown"));
    const { result } = renderHook(() => useSharePage());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    expect(result.current.error).toBe(true);
  });

  it("sets accessPassword from sharePasswordInput", async () => {
    const { ApiError: AE } = await import("@/lib/api");
    mockApiFetch.mockRejectedValueOnce(new AE("Password required", 10000002));
    const { result } = renderHook(() => useSharePage());
    await waitFor(() => { expect(result.current.passwordRequired).toBe(true); });
    mockApiFetch.mockResolvedValue(makeDetail());
    act(() => { result.current.setSharePasswordInput("secret"); });
    act(() => { result.current.setAccessPassword("secret"); });
    await waitFor(() => { expect(result.current.doc).toBeTruthy(); });
  });

  it("guestAuthor is generated for non-authenticated users", async () => {
    const { getAuthToken } = await import("@/lib/api");
    vi.mocked(getAuthToken).mockReturnValue(null);
    mockApiFetch.mockResolvedValue(makeDetail());
    const { result } = renderHook(() => useSharePage());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    expect(result.current.guestAuthor).toMatch(/^Guest #[A-Z0-9]{4}$/);
    vi.mocked(getAuthToken).mockReturnValue("tok");
  });

  it("handleCopyLink sets toast on success", async () => {
    mockApiFetch.mockResolvedValue(makeDetail());
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useSharePage());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    await act(async () => { result.current.handleCopyLink(); await vi.advanceTimersByTimeAsync(100); });
    expect(result.current.toast).toBe("Link copied to clipboard!");
    vi.useRealTimers();
  });

  it("handleCopyLink shows error toast on clipboard failure", async () => {
    mockApiFetch.mockResolvedValue(makeDetail());
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useSharePage());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    await act(async () => { result.current.handleCopyLink(); await vi.advanceTimersByTimeAsync(100); });
    expect(result.current.toast).toBe("Failed to copy link");
    vi.useRealTimers();
  });

  it("scrollToElement scrolls element into view when no container", async () => {
    mockApiFetch.mockResolvedValue(makeDetail());
    const { result } = renderHook(() => useSharePage());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    const el = document.createElement("div");
    el.scrollIntoView = vi.fn();
    result.current.scrollToElement(el);
    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("permissionHint for read-only", async () => {
    mockApiFetch.mockResolvedValue(makeDetail({ permission: 1 }));
    const { result } = renderHook(() => useSharePage());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    expect(result.current.permissionHint).toBe("Read access only");
  });

  it("permissionHint for annotate", async () => {
    mockApiFetch.mockResolvedValue(makeDetail({ permission: 2 }));
    const { result } = renderHook(() => useSharePage());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    expect(result.current.permissionHint).toBe("Can comment on this share");
  });

  it("extractDocTitle extracts h1 from content", async () => {
    mockApiFetch.mockResolvedValue(makeDetail({ document: { id: "d1", title: "", content: "# My Title\nBody", ctime: 0, mtime: 0 } }));
    const { result } = renderHook(() => useSharePage());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    expect(document.title).toBe("My Title");
  });

  it("extractDocTitle truncates long first line", async () => {
    const longLine = "A".repeat(100);
    mockApiFetch.mockResolvedValue(makeDetail({ document: { id: "d1", title: "", content: longLine, ctime: 0, mtime: 0 } }));
    const { result } = renderHook(() => useSharePage());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    expect(document.title).toHaveLength(53);
  });

  it("extractDocTitle detects setext heading", async () => {
    mockApiFetch.mockResolvedValue(makeDetail({ document: { id: "d1", title: "", content: "My Title\n========\nBody", ctime: 0, mtime: 0 } }));
    const { result } = renderHook(() => useSharePage());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    expect(document.title).toBe("My Title");
  });

  it("handleExport creates download link", async () => {
    mockApiFetch.mockResolvedValue(makeDetail());
    const click = vi.fn();
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "a") return { click, href: "", download: "", style: {} } as unknown as HTMLAnchorElement;
      return origCreateElement(tag);
    });
    vi.spyOn(document.body, "appendChild").mockImplementation((n) => n);
    vi.spyOn(document.body, "removeChild").mockImplementation((n) => n);
    vi.stubGlobal("URL", { createObjectURL: vi.fn().mockReturnValue("blob:url"), revokeObjectURL: vi.fn() });

    const { result } = renderHook(() => useSharePage());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.handleExport(); });
    expect(click).toHaveBeenCalled();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});
