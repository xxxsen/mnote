import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useShareLink } from "../hooks/useShareLink";

const stableCreateShare = vi.fn();
const stableGetShare = vi.fn();
const stableUpdateShareConfig = vi.fn();
const stableRevokeShare = vi.fn();

vi.mock("../hooks/useDocumentActions", () => ({
  useDocumentActions: () => ({
    createShare: stableCreateShare,
    getShare: stableGetShare,
    updateShareConfig: stableUpdateShareConfig,
    revokeShare: stableRevokeShare,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "location", { value: { origin: "https://example.com" }, writable: true });
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe("useShareLink", () => {
  it("initializes with empty state", () => {
    const { result } = renderHook(() => useShareLink({ docId: "d1" }));
    expect(result.current.shareUrl).toBe("");
    expect(result.current.activeShare).toBeNull();
    expect(result.current.copied).toBe(false);
  });

  it("handleShare creates share and sets url", async () => {
    stableCreateShare.mockResolvedValue({ token: "abc", id: "s1" });
    const { result } = renderHook(() => useShareLink({ docId: "d1" }));
    await act(async () => { await result.current.handleShare(); });
    expect(result.current.shareUrl).toBe("https://example.com/share/abc");
    expect(result.current.activeShare).toEqual({ token: "abc", id: "s1" });
  });

  it("handleShare calls onError on failure", async () => {
    const onError = vi.fn();
    stableCreateShare.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useShareLink({ docId: "d1", onError }));
    await act(async () => { await result.current.handleShare(); });
    expect(onError).toHaveBeenCalled();
  });

  it("loadShare loads existing share", async () => {
    stableGetShare.mockResolvedValue({ share: { token: "xyz", id: "s2" } });
    const { result } = renderHook(() => useShareLink({ docId: "d1" }));
    await act(async () => { await result.current.loadShare(); });
    expect(result.current.shareUrl).toBe("https://example.com/share/xyz");
    expect(result.current.activeShare).toEqual({ token: "xyz", id: "s2" });
  });

  it("loadShare with no share clears state", async () => {
    stableGetShare.mockResolvedValue({ share: null });
    const { result } = renderHook(() => useShareLink({ docId: "d1" }));
    await act(async () => { await result.current.loadShare(); });
    expect(result.current.shareUrl).toBe("");
    expect(result.current.activeShare).toBeNull();
  });

  it("loadShare error clears state", async () => {
    const onError = vi.fn();
    stableGetShare.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useShareLink({ docId: "d1", onError }));
    await act(async () => { await result.current.loadShare(); });
    expect(result.current.activeShare).toBeNull();
    expect(onError).toHaveBeenCalled();
  });

  it("updateShareConfig updates share", async () => {
    stableUpdateShareConfig.mockResolvedValue({ token: "upd", id: "s3" });
    const { result } = renderHook(() => useShareLink({ docId: "d1" }));
    await act(async () => {
      await result.current.updateShareConfig({ expires_at: 0, permission: "view", allow_download: true });
    });
    expect(result.current.shareUrl).toBe("https://example.com/share/upd");
  });

  it("handleRevokeShare clears state", async () => {
    stableCreateShare.mockResolvedValue({ token: "abc", id: "s1" });
    stableRevokeShare.mockResolvedValue(undefined);
    const { result } = renderHook(() => useShareLink({ docId: "d1" }));
    await act(async () => { await result.current.handleShare(); });
    expect(result.current.shareUrl).not.toBe("");
    await act(async () => { await result.current.handleRevokeShare(); });
    expect(result.current.shareUrl).toBe("");
    expect(result.current.activeShare).toBeNull();
  });

  it("handleCopyLink copies to clipboard", async () => {
    stableCreateShare.mockResolvedValue({ token: "abc", id: "s1" });
    const { result } = renderHook(() => useShareLink({ docId: "d1" }));
    await act(async () => { await result.current.handleShare(); });
    act(() => { result.current.handleCopyLink(); });
    await waitFor(() => { expect(result.current.copied).toBe(true); });
  });

  it("handleCopyLink does nothing when no url", () => {
    const { result } = renderHook(() => useShareLink({ docId: "d1" }));
    act(() => { result.current.handleCopyLink(); });
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });
});
