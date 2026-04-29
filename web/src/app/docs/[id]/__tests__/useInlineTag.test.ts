import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/lib/api";
import { useInlineTag } from "../hooks/useInlineTag";
import type { Tag } from "@/types";

const mockApiFetch = vi.mocked(apiFetch);
const tag = (id: string, name: string): Tag => ({ id, name } as Tag);

const stableMergeTags = vi.fn();
const stableSearchTags = vi.fn().mockResolvedValue([]);
const stableSaveTagIDs = vi.fn().mockResolvedValue(undefined);
const stableFindExisting = vi.fn().mockResolvedValue(null);
const stableToast = vi.fn();
const stableTagActions = { searchTags: stableSearchTags };

const makeOpts = (overrides = {}) => ({
  allTags: [tag("t1", "go"), tag("t2", "rust")],
  selectedTagIDs: ["t1"],
  tagActions: stableTagActions,
  mergeTags: stableMergeTags,
  saveTagIDs: stableSaveTagIDs,
  findExistingTagByName: stableFindExisting,
  toast: stableToast,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  stableSearchTags.mockResolvedValue([]);
  stableSaveTagIDs.mockResolvedValue(undefined);
  stableFindExisting.mockResolvedValue(null);
});

describe("useInlineTag", () => {
  it("initializes in closed mode", () => {
    const { result } = renderHook(() => useInlineTag(makeOpts()));
    expect(result.current.inlineTagMode).toBe(false);
    expect(result.current.inlineTagValue).toBe("");
    expect(result.current.inlineTagLoading).toBe(false);
  });

  it("setInlineTagMode toggles mode", () => {
    const { result } = renderHook(() => useInlineTag(makeOpts()));
    act(() => { result.current.setInlineTagMode(true); });
    expect(result.current.inlineTagMode).toBe(true);
    act(() => { result.current.setInlineTagMode(false); });
    expect(result.current.inlineTagMode).toBe(false);
  });

  it("setInlineTagValue updates value", () => {
    const { result } = renderHook(() => useInlineTag(makeOpts()));
    act(() => { result.current.setInlineTagValue("python"); });
    expect(result.current.inlineTagValue).toBe("python");
  });

  it("handleInlineAddTag adds existing tag from allTags", async () => {
    const { result } = renderHook(() => useInlineTag(makeOpts()));
    await act(async () => { await result.current.handleInlineAddTag("rust"); });
    expect(stableSaveTagIDs).toHaveBeenCalledWith(["t1", "t2"]);
  });

  it("handleInlineAddTag creates new tag via API", async () => {
    mockApiFetch.mockResolvedValue(tag("t3", "python"));
    const { result } = renderHook(() => useInlineTag(makeOpts()));
    await act(async () => { await result.current.handleInlineAddTag("python"); });
    expect(stableMergeTags).toHaveBeenCalledWith([tag("t3", "python")]);
    expect(stableSaveTagIDs).toHaveBeenCalled();
  });

  it("handleInlineAddTag closes on empty value", async () => {
    const { result } = renderHook(() => useInlineTag(makeOpts()));
    act(() => { result.current.setInlineTagMode(true); });
    await act(async () => { await result.current.handleInlineAddTag(""); });
    expect(result.current.inlineTagMode).toBe(false);
  });

  it("handleInlineAddTag rejects invalid tag name", async () => {
    const { result } = renderHook(() => useInlineTag(makeOpts()));
    await act(async () => { await result.current.handleInlineAddTag("!!!"); });
    expect(stableToast).toHaveBeenCalled();
  });

  it("handleInlineAddTag respects max tags", async () => {
    const { result } = renderHook(() => useInlineTag(makeOpts({
      selectedTagIDs: Array.from({ length: 7 }, (_, i) => `t${i}`),
    })));
    await act(async () => { await result.current.handleInlineAddTag("newtag"); });
    expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining("7") }));
  });

  it("handleInlineTagSelect selects existing tag", async () => {
    const { result } = renderHook(() => useInlineTag(makeOpts()));
    await act(async () => {
      await result.current.handleInlineTagSelect({ key: "use-t2", type: "use", tag: tag("t2", "rust") });
    });
    expect(stableSaveTagIDs).toHaveBeenCalledWith(["t1", "t2"]);
  });

  it("handleInlineTagSelect skips already selected", async () => {
    const { result } = renderHook(() => useInlineTag(makeOpts()));
    await act(async () => {
      await result.current.handleInlineTagSelect({ key: "use-t1", type: "use", tag: tag("t1", "go") });
    });
    expect(stableSaveTagIDs).not.toHaveBeenCalled();
  });

  it("handles API error in handleInlineAddTag", async () => {
    mockApiFetch.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useInlineTag(makeOpts()));
    await act(async () => { await result.current.handleInlineAddTag("newtag"); });
    expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
  });

  it("refs exist", () => {
    const { result } = renderHook(() => useInlineTag(makeOpts()));
    expect(result.current.inlineTagInputRef).toBeDefined();
    expect(result.current.inlineTagComposeRef).toBeDefined();
  });
});
