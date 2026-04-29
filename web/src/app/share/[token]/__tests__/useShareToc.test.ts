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

  it("scroll handler updates scrollProgress and showScrollTop", async () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { rafCallbacks.push(cb); return 1; });
    Object.defineProperty(document.documentElement, "scrollHeight", { value: 2000, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 500, configurable: true });
    Object.defineProperty(window, "scrollY", { value: 600, configurable: true, writable: true });

    const previewRef = { current: null };
    const { result } = renderHook(() => useShareToc(previewRef, undefined));

    act(() => { window.dispatchEvent(new Event("scroll")); });
    act(() => { for (const cb of rafCallbacks) cb(0); rafCallbacks.length = 0; });

    expect(result.current.scrollProgress).toBeGreaterThan(0);
    expect(result.current.showScrollTop).toBe(true);
    vi.unstubAllGlobals();
  });

  it("floating toc hidden when no tocContent", () => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 1; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const previewRef = { current: null };
    const { result } = renderHook(() => useShareToc(previewRef, { content: "[toc]\n# H1" }));
    expect(result.current.showFloatingToc).toBe(false);
    vi.unstubAllGlobals();
  });

  it("floating toc visibility updates when tocContent and container present", () => {
    let timeoutCb: (() => void) | null = null;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 1; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("setTimeout", (cb: () => void) => { timeoutCb = cb; return 1; });
    vi.stubGlobal("clearTimeout", vi.fn());

    const tocEl = document.createElement("div");
    tocEl.className = "toc-wrapper";
    Object.defineProperty(tocEl, "getBoundingClientRect", {
      value: () => ({ top: -100, bottom: -50, left: 0, right: 0, width: 0, height: 50 }),
      configurable: true,
    });
    const container = document.createElement("div");
    container.appendChild(tocEl);
    Object.defineProperty(container, "scrollHeight", { value: 200, configurable: true });
    Object.defineProperty(container, "clientHeight", { value: 200, configurable: true });

    const previewRef = { current: container };
    const doc = { content: "[toc]\n# H1" };
    const { result } = renderHook(() => useShareToc(previewRef, doc));

    act(() => { result.current.handleTocLoaded("- H1"); });
    act(() => { if (timeoutCb) timeoutCb(); });

    expect(result.current.showFloatingToc).toBe(true);
    vi.unstubAllGlobals();
  });

  it("floating toc false when toc element is visible in viewport", () => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 1; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("setTimeout", (cb: () => void) => { cb(); return 1; });
    vi.stubGlobal("clearTimeout", vi.fn());

    const tocEl = document.createElement("div");
    tocEl.className = "toc-wrapper";
    Object.defineProperty(tocEl, "getBoundingClientRect", {
      value: () => ({ top: 50, bottom: 150, left: 0, right: 0, width: 0, height: 100 }),
    });
    const container = document.createElement("div");
    container.appendChild(tocEl);
    Object.defineProperty(container, "scrollHeight", { value: 200, configurable: true });
    Object.defineProperty(container, "clientHeight", { value: 200, configurable: true });

    const previewRef = { current: container };
    const doc = { content: "[toc]\n# H1" };
    const { result } = renderHook(() => useShareToc(previewRef, doc));

    act(() => { result.current.handleTocLoaded("- H1"); });

    expect(result.current.showFloatingToc).toBe(false);
    vi.unstubAllGlobals();
  });

  it("floating toc uses container scroll when scrollable", () => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 1; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("setTimeout", (cb: () => void) => { cb(); return 1; });
    vi.stubGlobal("clearTimeout", vi.fn());

    const tocEl = document.createElement("div");
    tocEl.className = "toc-wrapper";
    Object.defineProperty(tocEl, "offsetTop", { value: 10, configurable: true });
    Object.defineProperty(tocEl, "offsetHeight", { value: 50, configurable: true });
    const container = document.createElement("div");
    container.appendChild(tocEl);
    Object.defineProperty(container, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(container, "clientHeight", { value: 200, configurable: true });
    Object.defineProperty(container, "scrollTop", { value: 500, configurable: true });

    const previewRef = { current: container };
    const doc = { content: "[toc]\n# H1" };
    const { result } = renderHook(() => useShareToc(previewRef, doc));

    act(() => { result.current.handleTocLoaded("- H1"); });

    expect(result.current.showFloatingToc).toBe(true);
    vi.unstubAllGlobals();
  });
});
