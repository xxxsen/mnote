import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("../services/doc-editor.service", () => ({
  docEditorService: {
    searchTags: vi.fn(),
    saveTags: vi.fn(),
  },
}));

import { useTagActions } from "../hooks/useTagActions";
import { docEditorService } from "../services/doc-editor.service";

const mockService = vi.mocked(docEditorService);

beforeEach(() => { vi.clearAllMocks(); });

describe("useTagActions", () => {
  it("returns searchTags and saveTags", () => {
    const { result } = renderHook(() => useTagActions("d1"));
    expect(result.current.searchTags).toBeTypeOf("function");
    expect(result.current.saveTags).toBeTypeOf("function");
  });

  it("searchTags calls service with query", async () => {
    mockService.searchTags.mockResolvedValue([]);
    const { result } = renderHook(() => useTagActions("d1"));
    await result.current.searchTags("test");
    expect(mockService.searchTags).toHaveBeenCalledWith("test");
  });

  it("saveTags calls service with docId and tagIDs", async () => {
    mockService.saveTags.mockResolvedValue(undefined);
    const { result } = renderHook(() => useTagActions("d1"));
    await result.current.saveTags(["t1", "t2"]);
    expect(mockService.saveTags).toHaveBeenCalledWith("d1", ["t1", "t2"]);
  });
});
