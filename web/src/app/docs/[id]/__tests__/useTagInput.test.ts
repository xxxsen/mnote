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
});
