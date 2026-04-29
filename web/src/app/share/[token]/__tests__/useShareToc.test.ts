import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useShareToc } from "../hooks/useShareToc";

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); });

describe("useShareToc", () => {
  it("initializes with empty state", () => {
    const previewRef = { current: null };
    const { result } = renderHook(() => useShareToc(previewRef, undefined));
    expect(result.current.tocContent).toBe("");
    expect(result.current.showFloatingToc).toBe(false);
    expect(result.current.tocCollapsed).toBe(false);
    expect(result.current.scrollProgress).toBe(0);
    expect(result.current.showScrollTop).toBe(false);
    expect(result.current.showMobileToc).toBe(false);
  });

  it("hasTocToken is false when doc has no [toc]", () => {
    const previewRef = { current: null };
    const { result } = renderHook(() => useShareToc(previewRef, { content: "hello" }));
    expect(result.current.hasTocToken).toBe(false);
  });

  it("hasTocToken is true when doc has [toc]", () => {
    const previewRef = { current: null };
    const { result } = renderHook(() => useShareToc(previewRef, { content: "hello [toc] world" }));
    expect(result.current.hasTocToken).toBe(true);
  });

  it("hasTocToken is true when doc has [TOC]", () => {
    const previewRef = { current: null };
    const { result } = renderHook(() => useShareToc(previewRef, { content: "hello [TOC] world" }));
    expect(result.current.hasTocToken).toBe(true);
  });

  it("handleTocLoaded sets toc content when hasTocToken", () => {
    const previewRef = { current: null };
    const { result } = renderHook(() => useShareToc(previewRef, { content: "[toc]\n# Hello" }));
    act(() => { result.current.handleTocLoaded("- Hello"); });
    expect(result.current.tocContent).toBe("- Hello");
  });

  it("handleTocLoaded sets empty when no tocToken", () => {
    const previewRef = { current: null };
    const { result } = renderHook(() => useShareToc(previewRef, { content: "no toc here" }));
    act(() => { result.current.handleTocLoaded("- Hello"); });
    expect(result.current.tocContent).toBe("");
  });

  it("setTocCollapsed toggles", () => {
    const previewRef = { current: null };
    const { result } = renderHook(() => useShareToc(previewRef, undefined));
    act(() => { result.current.setTocCollapsed(true); });
    expect(result.current.tocCollapsed).toBe(true);
  });

  it("setShowMobileToc toggles", () => {
    const previewRef = { current: null };
    const { result } = renderHook(() => useShareToc(previewRef, undefined));
    act(() => { result.current.setShowMobileToc(true); });
    expect(result.current.showMobileToc).toBe(true);
  });
});
