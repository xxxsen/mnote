import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

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
  },
}));

import { useDocumentActions } from "../hooks/useDocumentActions";
import { docEditorService } from "../services/doc-editor.service";

const mockService = vi.mocked(docEditorService);

beforeEach(() => { vi.clearAllMocks(); });

describe("useDocumentActions", () => {
  it("returns all action methods", () => {
    const { result } = renderHook(() => useDocumentActions("d1"));
    expect(result.current.getDocument).toBeTypeOf("function");
    expect(result.current.saveDocument).toBeTypeOf("function");
    expect(result.current.deleteDocument).toBeTypeOf("function");
    expect(result.current.listVersions).toBeTypeOf("function");
    expect(result.current.createShare).toBeTypeOf("function");
    expect(result.current.getShare).toBeTypeOf("function");
    expect(result.current.updateShareConfig).toBeTypeOf("function");
    expect(result.current.revokeShare).toBeTypeOf("function");
  });

  it("getDocument calls service with docId", async () => {
    mockService.getDocument.mockResolvedValue({ document: { id: "d1" } } as never);
    const { result } = renderHook(() => useDocumentActions("d1"));
    await result.current.getDocument();
    expect(mockService.getDocument).toHaveBeenCalledWith("d1");
  });

  it("saveDocument calls service with docId and params", async () => {
    mockService.saveDocument.mockResolvedValue(undefined as never);
    const { result } = renderHook(() => useDocumentActions("d1"));
    await result.current.saveDocument("Title", "Content");
    expect(mockService.saveDocument).toHaveBeenCalledWith("d1", { title: "Title", content: "Content" });
  });

  it("memoizes across renders with same docId", () => {
    const { result, rerender } = renderHook(() => useDocumentActions("d1"));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("deleteDocument calls service", async () => {
    mockService.deleteDocument.mockResolvedValue(undefined as never);
    const { result } = renderHook(() => useDocumentActions("d1"));
    await result.current.deleteDocument();
    expect(mockService.deleteDocument).toHaveBeenCalledWith("d1");
  });

  it("listVersions calls service", async () => {
    mockService.listVersions.mockResolvedValue([] as never);
    const { result } = renderHook(() => useDocumentActions("d1"));
    await result.current.listVersions();
    expect(mockService.listVersions).toHaveBeenCalledWith("d1");
  });

  it("createShare calls service", async () => {
    mockService.createShare.mockResolvedValue({ token: "abc" } as never);
    const { result } = renderHook(() => useDocumentActions("d1"));
    await result.current.createShare();
    expect(mockService.createShare).toHaveBeenCalledWith("d1");
  });

  it("getShare calls service", async () => {
    mockService.getShare.mockResolvedValue(null as never);
    const { result } = renderHook(() => useDocumentActions("d1"));
    await result.current.getShare();
    expect(mockService.getShare).toHaveBeenCalledWith("d1");
  });

  it("updateShareConfig calls service with payload", async () => {
    mockService.updateShareConfig.mockResolvedValue(undefined as never);
    const { result } = renderHook(() => useDocumentActions("d1"));
    const payload = { expires_at: 0, permission: "view" as const, allow_download: true };
    await result.current.updateShareConfig(payload);
    expect(mockService.updateShareConfig).toHaveBeenCalledWith("d1", payload);
  });

  it("revokeShare calls service", async () => {
    mockService.revokeShare.mockResolvedValue(undefined as never);
    const { result } = renderHook(() => useDocumentActions("d1"));
    await result.current.revokeShare();
    expect(mockService.revokeShare).toHaveBeenCalledWith("d1");
  });
});
