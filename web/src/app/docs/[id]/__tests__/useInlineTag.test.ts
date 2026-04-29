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

  it("handleInlineAddTag creates new tag when not found", async () => {
    stableFindExisting.mockResolvedValue(null);
    mockApiFetch.mockResolvedValue({ id: "t5", name: "newtag" });
    const { result } = renderHook(() => useInlineTag(makeOpts()));
    await act(async () => { await result.current.handleInlineAddTag("newtag"); });
    expect(stableSaveTagIDs).toHaveBeenCalledWith(expect.arrayContaining(["t5"]));
    expect(stableMergeTags).toHaveBeenCalledWith([{ id: "t5", name: "newtag" }]);
  });

  it("handleInlineAddTag with empty name closes mode", async () => {
    const { result } = renderHook(() => useInlineTag(makeOpts()));
    await act(async () => { await result.current.handleInlineAddTag(""); });
    expect(result.current.inlineTagMode).toBe(false);
  });

  it("handleInlineTagSelect with create type delegates to handleInlineAddTag", async () => {
    stableFindExisting.mockResolvedValue(null);
    mockApiFetch.mockResolvedValue({ id: "t5", name: "newtag" });
    const { result } = renderHook(() => useInlineTag(makeOpts()));
    await act(async () => {
      await result.current.handleInlineTagSelect({ key: "create-newtag", type: "create", name: "newtag" });
    });
    expect(stableSaveTagIDs).toHaveBeenCalled();
  });

  it("handleInlineTagSelect respects max tags", async () => {
    const opts = makeOpts();
    opts.selectedTagIDs = Array.from({ length: 7 }, (_, i) => `t${i}`);
    const { result } = renderHook(() => useInlineTag(opts));
    await act(async () => {
      await result.current.handleInlineTagSelect({ key: "use-t99", type: "use", tag: tag("t99", "overflow") });
    });
    expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining("7") }));
  });

  it("search populates dropdown items after debounce", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stableSearchTags.mockResolvedValue([tag("t5", "react")]);
    const { result } = renderHook(() => useInlineTag(makeOpts()));
    act(() => { result.current.setInlineTagMode(true); });
    act(() => { result.current.setInlineTagValue("react"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(result.current.inlineTagDropdownItems.length).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  it("inlineTagDropdownItems shows exact match as 'use' type", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stableSearchTags.mockResolvedValue([tag("t1", "go")]);
    const { result } = renderHook(() => useInlineTag(makeOpts({ selectedTagIDs: [] })));
    act(() => { result.current.setInlineTagMode(true); });
    act(() => { result.current.setInlineTagValue("go"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    const items = result.current.inlineTagDropdownItems;
    expect(items[0]?.type).toBe("use");
    vi.useRealTimers();
  });

  it("inlineTagDropdownItems shows 'create' when no exact match", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stableSearchTags.mockResolvedValue([]);
    const { result } = renderHook(() => useInlineTag(makeOpts()));
    act(() => { result.current.setInlineTagMode(true); });
    act(() => { result.current.setInlineTagValue("newname"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    const items = result.current.inlineTagDropdownItems;
    expect(items.some(i => i.type === "create")).toBe(true);
    vi.useRealTimers();
  });

  it("handleInlineAddTag adds existing tag from allTags", async () => {
    const { result } = renderHook(() => useInlineTag(makeOpts({ selectedTagIDs: [] })));
    await act(async () => { await result.current.handleInlineAddTag("go"); });
    expect(stableSaveTagIDs).toHaveBeenCalledWith(["t1"]);
  });

  it("handleInlineAddTag finds existing tag via findExistingTagByName", async () => {
    stableFindExisting.mockResolvedValue(tag("t3", "python"));
    const { result } = renderHook(() => useInlineTag(makeOpts({ selectedTagIDs: [] })));
    await act(async () => { await result.current.handleInlineAddTag("python"); });
    expect(stableSaveTagIDs).toHaveBeenCalledWith(["t3"]);
  });

  it("handleInlineAddTag skips saving if existing tag already selected", async () => {
    const { result } = renderHook(() => useInlineTag(makeOpts({ selectedTagIDs: ["t1"] })));
    await act(async () => { await result.current.handleInlineAddTag("go"); });
    expect(stableSaveTagIDs).not.toHaveBeenCalled();
    expect(result.current.inlineTagMode).toBe(false);
  });

  it("handleInlineAddTag rejects invalid tag name", async () => {
    const { result } = renderHook(() => useInlineTag(makeOpts()));
    await act(async () => { await result.current.handleInlineAddTag("!!!invalid!!!"); });
    expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining("letters") }));
  });

  it("handleInlineAddTag rejects when at max tags", async () => {
    const opts = makeOpts({ selectedTagIDs: Array.from({ length: 7 }, (_, i) => `t${i}`) });
    const { result } = renderHook(() => useInlineTag(opts));
    await act(async () => { await result.current.handleInlineAddTag("newtag"); });
    expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining("7") }));
  });

  it("search error clears results", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stableSearchTags.mockRejectedValue(new Error("search fail"));
    const { result } = renderHook(() => useInlineTag(makeOpts()));
    act(() => { result.current.setInlineTagMode(true); });
    act(() => { result.current.setInlineTagValue("test"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(result.current.inlineTagLoading).toBe(false);
    vi.useRealTimers();
  });

  it("handleInlineAddTag handles non-Error rejection", async () => {
    mockApiFetch.mockRejectedValue("string error");
    const { result } = renderHook(() => useInlineTag(makeOpts()));
    await act(async () => { await result.current.handleInlineAddTag("newtag"); });
    expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({ description: "Failed to add tag", variant: "error" }));
  });

  it("handleInlineTagSelect with create type but no name is no-op", async () => {
    const { result } = renderHook(() => useInlineTag(makeOpts()));
    await act(async () => {
      await result.current.handleInlineTagSelect({ key: "create-", type: "create", name: "" });
    });
    expect(stableSaveTagIDs).not.toHaveBeenCalled();
  });

  it("inlineTagDropdownItems limits to 8 items", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const manyTags = Array.from({ length: 15 }, (_, i) => tag(`s${i}`, `search${i}`));
    stableSearchTags.mockResolvedValue(manyTags);
    const { result } = renderHook(() => useInlineTag(makeOpts({ selectedTagIDs: [] })));
    act(() => { result.current.setInlineTagMode(true); });
    act(() => { result.current.setInlineTagValue("search"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(result.current.inlineTagDropdownItems.length).toBeLessThanOrEqual(8);
    vi.useRealTimers();
  });
});
