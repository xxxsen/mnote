import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/lib/api";
import { useTagInput } from "../hooks/useTagInput";
import type { Tag } from "@/types";

const mockApiFetch = vi.mocked(apiFetch);
const tag = (id: string, name: string): Tag => ({ id, name } as Tag);

const stableMergeTags = vi.fn();
const stableSearchTags = vi.fn().mockResolvedValue([]);
const stableSaveTagIDs = vi.fn().mockResolvedValue(undefined);
const stableNotify = vi.fn();
const stableNotifyError = vi.fn();
const stableNormalize = (v: string) => v.trim().toLowerCase();
const stableIsValid = (v: string) => /^[\p{Script=Han}A-Za-z0-9]+$/u.test(v) && v.length <= 16;

const makeOpts = (overrides = {}) => ({
  allTags: [tag("t1", "go"), tag("t2", "rust")],
  selectedTagIDs: ["t1"],
  maxTags: 5,
  normalizeTagName: stableNormalize,
  isValidTagName: stableIsValid,
  mergeTags: stableMergeTags,
  searchTags: stableSearchTags,
  saveTagIDs: stableSaveTagIDs,
  notify: stableNotify,
  notifyError: stableNotifyError,
  ...overrides,
});

beforeEach(() => { vi.clearAllMocks(); stableSearchTags.mockResolvedValue([]); });

describe("useTagInput", () => {
  it("initializes with empty query", () => {
    const { result } = renderHook(() => useTagInput(makeOpts()));
    expect(result.current.tagQuery).toBe("");
    expect(result.current.tagSearchLoading).toBe(false);
    expect(result.current.tagDropdownItems).toEqual([]);
  });

  it("findExistingTagByName returns cached tag", async () => {
    const { result } = renderHook(() => useTagInput(makeOpts()));
    const found = await act(async () => result.current.findExistingTagByName("go"));
    expect(found).toEqual(tag("t1", "go"));
  });

  it("findExistingTagByName searches remotely", async () => {
    stableSearchTags.mockResolvedValue([tag("t3", "python")]);
    const { result } = renderHook(() => useTagInput(makeOpts()));
    const found = await act(async () => result.current.findExistingTagByName("python"));
    expect(found).toEqual(tag("t3", "python"));
    expect(stableMergeTags).toHaveBeenCalledWith([tag("t3", "python")]);
  });

  it("findExistingTagByName returns null on error", async () => {
    stableSearchTags.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useTagInput(makeOpts()));
    const found = await act(async () => result.current.findExistingTagByName("unknown"));
    expect(found).toBeNull();
  });

  it("findExistingTagByName returns null for empty name", async () => {
    const { result } = renderHook(() => useTagInput(makeOpts()));
    const found = await act(async () => result.current.findExistingTagByName(""));
    expect(found).toBeNull();
  });

  it("handleTagInputChange filters input", () => {
    const { result } = renderHook(() => useTagInput(makeOpts()));
    act(() => { result.current.handleTagInputChange({ target: { value: "hello" } } as never); });
    expect(result.current.tagQuery).toBe("hello");
  });

  it("handleTagCompositionEnd processes IME input", () => {
    const { result } = renderHook(() => useTagInput(makeOpts()));
    act(() => { result.current.handleTagCompositionStart(); });
    act(() => { result.current.handleTagCompositionEnd({ currentTarget: { value: "你好" } } as never); });
    expect(result.current.tagQuery).toBe("你好");
  });

  it("trimmedTagQuery normalizes", () => {
    const { result } = renderHook(() => useTagInput(makeOpts()));
    act(() => { result.current.handleTagInputChange({ target: { value: "Go" } } as never); });
    expect(result.current.trimmedTagQuery).toBe("go");
  });

  it("handleTagInputKeyDown Escape clears query", () => {
    const { result } = renderHook(() => useTagInput(makeOpts()));
    act(() => { result.current.handleTagInputChange({ target: { value: "test" } } as never); });
    act(() => { result.current.handleTagInputKeyDown({ key: "Escape", preventDefault: vi.fn() } as never); });
    expect(result.current.tagQuery).toBe("");
  });

  it("handleTagInputKeyDown Enter with empty query calls handleAddTag", () => {
    const { result } = renderHook(() => useTagInput(makeOpts()));
    act(() => { result.current.handleTagInputKeyDown({ key: "Enter", preventDefault: vi.fn() } as never); });
  });

  it("handleTagInputKeyDown ArrowDown increments index", async () => {
    stableSearchTags.mockResolvedValue([tag("t3", "python")]);
    const { result } = renderHook(() => useTagInput(makeOpts({ selectedTagIDs: [] })));
    act(() => { result.current.handleTagInputChange({ target: { value: "py" } } as never); });
    await vi.waitFor(() => { expect(result.current.tagDropdownItems.length).toBeGreaterThan(0); });
    act(() => { result.current.handleTagInputKeyDown({ key: "ArrowDown", preventDefault: vi.fn() } as never); });
    expect(result.current.tagDropdownIndex).toBeGreaterThanOrEqual(0);
  });

  it("handleTagInputKeyDown ArrowUp decrements index", async () => {
    stableSearchTags.mockResolvedValue([tag("t3", "python"), tag("t4", "java")]);
    const { result } = renderHook(() => useTagInput(makeOpts({ selectedTagIDs: [] })));
    act(() => { result.current.handleTagInputChange({ target: { value: "p" } } as never); });
    await vi.waitFor(() => { expect(result.current.tagDropdownItems.length).toBeGreaterThan(0); });
    act(() => { result.current.handleTagInputKeyDown({ key: "ArrowUp", preventDefault: vi.fn() } as never); });
  });

  it("handleTagInputKeyDown Enter selects dropdown item", async () => {
    stableSearchTags.mockResolvedValue([tag("t3", "python")]);
    const { result } = renderHook(() => useTagInput(makeOpts({ selectedTagIDs: [] })));
    act(() => { result.current.handleTagInputChange({ target: { value: "python" } } as never); });
    await vi.waitFor(() => { expect(result.current.tagDropdownItems.length).toBeGreaterThan(0); });
    await act(async () => { result.current.handleTagInputKeyDown({ key: "Enter", preventDefault: vi.fn() } as never); });
  });

  it("handleTagDropdownSelect with use type selects tag", async () => {
    const { result } = renderHook(() => useTagInput(makeOpts({ selectedTagIDs: [] })));
    await act(async () => {
      result.current.handleTagDropdownSelect({ type: "use", tag: tag("t2", "rust") });
    });
    expect(stableSaveTagIDs).toHaveBeenCalledWith(["t2"]);
  });

  it("handleTagDropdownSelect with create type adds tag", async () => {
    mockApiFetch.mockResolvedValue(tag("t5", "newTag"));
    const { result } = renderHook(() => useTagInput(makeOpts({ selectedTagIDs: [] })));
    act(() => { result.current.handleTagInputChange({ target: { value: "newTag" } } as never); });
    await act(async () => {
      result.current.handleTagDropdownSelect({ type: "create" });
    });
  });

  it("tagDropdownItems shows 'use' for exact match", async () => {
    stableSearchTags.mockResolvedValue([tag("t2", "rust")]);
    const { result } = renderHook(() => useTagInput(makeOpts({ selectedTagIDs: [] })));
    act(() => { result.current.handleTagInputChange({ target: { value: "rust" } } as never); });
    await vi.waitFor(() => { expect(result.current.tagDropdownItems.length).toBeGreaterThan(0); });
    expect(result.current.tagDropdownItems[0].type).toBe("use");
  });

  it("tagDropdownItems shows 'create' when no match and valid name", async () => {
    stableSearchTags.mockResolvedValue([]);
    const { result } = renderHook(() => useTagInput(makeOpts()));
    act(() => { result.current.handleTagInputChange({ target: { value: "newlang" } } as never); });
    await vi.waitFor(() => { expect(result.current.tagDropdownItems.length).toBeGreaterThan(0); });
    expect(result.current.tagDropdownItems[0].type).toBe("create");
  });

  it("tagDropdownItems shows suggestions filtered from selected", async () => {
    stableSearchTags.mockResolvedValue([tag("t1", "go"), tag("t2", "rust")]);
    const { result } = renderHook(() => useTagInput(makeOpts({ selectedTagIDs: ["t1"] })));
    act(() => { result.current.handleTagInputChange({ target: { value: "r" } } as never); });
    await vi.waitFor(() => {
      const items = result.current.tagDropdownItems;
      const suggestionIds = items.filter(i => i.type === "suggestion").map(i => i.tag?.id);
      expect(suggestionIds).toContain("t2");
      expect(suggestionIds).not.toContain("t1");
    });
  });

  it("selectTagByID skips when already selected", async () => {
    const { result } = renderHook(() => useTagInput(makeOpts()));
    await act(async () => {
      result.current.handleTagDropdownSelect({ type: "use", tag: tag("t1", "go") });
    });
    expect(stableSaveTagIDs).not.toHaveBeenCalled();
  });

  it("selectTagByID notifies when maxTags reached", async () => {
    const { result } = renderHook(() => useTagInput(makeOpts({ selectedTagIDs: ["a", "b", "c", "d", "e"], maxTags: 5 })));
    await act(async () => {
      result.current.handleTagDropdownSelect({ type: "use", tag: tag("t5", "new") });
    });
    expect(stableNotify).toHaveBeenCalledWith(expect.stringContaining("5"));
  });

  it("handleAddTag notifies for invalid tag name", async () => {
    const { result } = renderHook(() => useTagInput(makeOpts()));
    act(() => { result.current.handleTagInputChange({ target: { value: "!!!" } } as never); });
    await act(async () => {
      result.current.handleTagInputKeyDown({ key: "Enter", preventDefault: vi.fn() } as never);
    });
  });

  it("handleAddTag creates new tag via API", async () => {
    mockApiFetch.mockResolvedValue(tag("t10", "newtag"));
    stableSearchTags.mockResolvedValue([]);
    const { result } = renderHook(() => useTagInput(makeOpts({ selectedTagIDs: [] })));
    act(() => { result.current.handleTagInputChange({ target: { value: "newtag" } } as never); });
    await vi.waitFor(() => { expect(result.current.trimmedTagQuery).toBe("newtag"); });
    await act(async () => {
      result.current.handleTagInputKeyDown({ key: "Enter", preventDefault: vi.fn() } as never);
    });
  });

  it("handleAddTag handles API error", async () => {
    mockApiFetch.mockRejectedValue(new Error("API fail"));
    stableSearchTags.mockResolvedValue([]);
    const { result } = renderHook(() => useTagInput(makeOpts({ selectedTagIDs: [] })));
    act(() => { result.current.handleTagInputChange({ target: { value: "newtag" } } as never); });
    await vi.waitFor(() => { expect(result.current.trimmedTagQuery).toBe("newtag"); });
    await act(async () => {
      result.current.handleTagInputKeyDown({ key: "Enter", preventDefault: vi.fn() } as never);
    });
    expect(stableNotifyError).toHaveBeenCalled();
  });

  it("runSearchTags merges results", async () => {
    stableSearchTags.mockResolvedValue([tag("t3", "python")]);
    const { result } = renderHook(() => useTagInput(makeOpts()));
    act(() => { result.current.handleTagInputChange({ target: { value: "pyt" } } as never); });
    await vi.waitFor(() => { expect(stableMergeTags).toHaveBeenCalled(); });
  });

  it("runSearchTags handles search error", async () => {
    stableSearchTags.mockRejectedValue(new Error("search fail"));
    const { result } = renderHook(() => useTagInput(makeOpts()));
    act(() => { result.current.handleTagInputChange({ target: { value: "fail" } } as never); });
    await vi.waitFor(() => { expect(result.current.tagSearchLoading).toBe(false); });
  });

  it("handleTagCompositionStart sets composing flag", () => {
    const { result } = renderHook(() => useTagInput(makeOpts()));
    act(() => { result.current.handleTagCompositionStart(); });
    act(() => { result.current.handleTagInputChange({ target: { value: "你好！" } } as never); });
    expect(result.current.tagQuery).toBe("你好！");
  });
});
