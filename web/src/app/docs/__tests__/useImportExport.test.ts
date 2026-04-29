import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  getAuthToken: vi.fn().mockReturnValue("tok"),
  removeAuthToken: vi.fn(),
  ApiError: class ApiError extends Error { code: number; constructor(m: string, c: number) { super(m); this.code = c; } },
}));

import { apiFetch } from "@/lib/api";
import { useImportExport } from "../hooks/useImportExport";

const mockApiFetch = vi.mocked(apiFetch);

const makeDeps = () => ({
  fetchSummary: vi.fn().mockResolvedValue(undefined),
  fetchTags: vi.fn().mockResolvedValue(undefined),
  fetchSidebarTags: vi.fn().mockResolvedValue(undefined),
  tagSearch: "", toast: vi.fn(),
});

beforeEach(() => { vi.clearAllMocks(); });

describe("useImportExport", () => {
  it("initializes with closed dialogs", () => {
    const { result } = renderHook(() => useImportExport(makeDeps()));
    expect(result.current.importOpen).toBe(false);
    expect(result.current.exportOpen).toBe(false);
    expect(result.current.importStep).toBe("upload");
  });

  it("openImportModal / closeImportModal toggles import dialog", () => {
    const { result } = renderHook(() => useImportExport(makeDeps()));
    act(() => { result.current.openImportModal("hedgedoc"); });
    expect(result.current.importOpen).toBe(true);
    act(() => { result.current.closeImportModal(); });
    expect(result.current.importOpen).toBe(false);
  });

  it("openExportModal / closeExportModal toggles export dialog", () => {
    const { result } = renderHook(() => useImportExport(makeDeps()));
    act(() => { result.current.openExportModal(); });
    expect(result.current.exportOpen).toBe(true);
    act(() => { result.current.closeExportModal(); });
    expect(result.current.exportOpen).toBe(false);
  });

  it("handleImportFile uploads and previews", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({ code: 0, data: { job_id: "j1" } }),
    }));
    mockApiFetch.mockResolvedValue({ notes_count: 5, tags_count: 2 });
    const { result } = renderHook(() => useImportExport(makeDeps()));
    act(() => { result.current.openImportModal("hedgedoc"); });
    const file = new File(["data"], "backup.zip");
    await act(async () => { await result.current.handleImportFile(file); });
    expect(result.current.importStep).toBe("preview");
    expect(result.current.importPreview).toBeDefined();
  });

  it("handleImportFile handles upload error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({ code: 1001, msg: "bad file" }),
    }));
    const { result } = renderHook(() => useImportExport(makeDeps()));
    act(() => { result.current.openImportModal("hedgedoc"); });
    const file = new File(["data"], "bad.zip");
    await act(async () => { await result.current.handleImportFile(file); });
    expect(result.current.importError).toBe("bad file");
    expect(result.current.importStep).toBe("upload");
  });

  it("handleImportConfirm does nothing without job ID", async () => {
    const { result } = renderHook(() => useImportExport(makeDeps()));
    await act(async () => { await result.current.handleImportConfirm(); });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("handleExportNotes downloads zip", async () => {
    const click = vi.fn();
    const fakeLink = { click, href: "", download: "", remove: vi.fn() };
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "a") return fakeLink as unknown as HTMLAnchorElement;
      return origCreateElement(tag);
    });
    vi.spyOn(document.body, "appendChild").mockImplementation((node) => node);
    vi.stubGlobal("URL", { createObjectURL: vi.fn().mockReturnValue("blob:url"), revokeObjectURL: vi.fn() });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: new Headers({ "content-type": "application/zip", "content-disposition": 'attachment; filename="notes.zip"' }),
      blob: () => Promise.resolve(new Blob(["data"])),
    }));
    const { result } = renderHook(() => useImportExport(makeDeps()));
    await act(async () => { await result.current.handleExportNotes(); });
    expect(click).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("handleExportNotes handles error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const deps = makeDeps();
    const { result } = renderHook(() => useImportExport(deps));
    await act(async () => { await result.current.handleExportNotes(); });
    expect(deps.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
    vi.unstubAllGlobals();
  });

  it("handleExportNotes handles 401", async () => {
    const removeAuthToken = await import("@/lib/api").then((m) => vi.mocked(m.removeAuthToken));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    const { result } = renderHook(() => useImportExport(makeDeps()));
    await act(async () => { await result.current.handleExportNotes(); });
    expect(removeAuthToken).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("handleExportNotes handles JSON error response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve({ code: 500, msg: "export failed" }),
      blob: () => Promise.resolve(new Blob()),
    }));
    const deps = makeDeps();
    const { result } = renderHook(() => useImportExport(deps));
    await act(async () => { await result.current.handleExportNotes(); });
    expect(deps.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
    vi.unstubAllGlobals();
  });
});
