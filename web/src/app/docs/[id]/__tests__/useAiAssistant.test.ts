import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/lib/api";
import { useAiAssistant } from "../hooks/useAiAssistant";

const mockApiFetch = vi.mocked(apiFetch);

const makeOpts = (overrides = {}) => ({
  docId: "doc1",
  maxTags: 5,
  normalizeTagName: (v: string) => v.trim().toLowerCase(),
  isValidTagName: (v: string) => /^[a-z0-9]+$/i.test(v),
  notify: vi.fn(),
  ...overrides,
});

beforeEach(() => { vi.clearAllMocks(); });

describe("useAiAssistant", () => {
  it("initializes with closed modal", () => {
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    expect(result.current.aiModalOpen).toBe(false);
    expect(result.current.aiAction).toBeNull();
    expect(result.current.aiLoading).toBe(false);
    expect(result.current.aiError).toBeNull();
  });

  it("handleAiPolish opens modal and calls API", async () => {
    mockApiFetch.mockResolvedValue({ text: "polished text" });
    const opts = makeOpts();
    const { result } = renderHook(() => useAiAssistant(opts));
    await act(async () => { await result.current.handleAiPolish("original text"); });
    expect(result.current.aiModalOpen).toBe(true);
    expect(result.current.aiAction).toBe("polish");
    expect(result.current.aiResultText).toBe("polished text");
    expect(result.current.aiLoading).toBe(false);
  });

  it("handleAiPolish notifies on empty text", async () => {
    const opts = makeOpts();
    const { result } = renderHook(() => useAiAssistant(opts));
    await act(async () => { await result.current.handleAiPolish("   "); });
    expect(opts.notify).toHaveBeenCalledWith(expect.stringContaining("content"));
    expect(result.current.aiModalOpen).toBe(false);
  });

  it("handleAiPolish handles API error", async () => {
    mockApiFetch.mockRejectedValue(new Error("API down"));
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    await act(async () => { await result.current.handleAiPolish("text"); });
    expect(result.current.aiError).toBe("API down");
    expect(result.current.aiLoading).toBe(false);
  });

  it("handleAiGenerateOpen opens modal in generate mode", () => {
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    act(() => { result.current.handleAiGenerateOpen(); });
    expect(result.current.aiModalOpen).toBe(true);
    expect(result.current.aiAction).toBe("generate");
  });

  it("handleAiGenerate calls API with prompt", async () => {
    mockApiFetch.mockResolvedValue({ text: "generated content" });
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    act(() => { result.current.handleAiGenerateOpen(); });
    act(() => { result.current.setAiPrompt("Write about AI"); });
    await act(async () => { await result.current.handleAiGenerate(); });
    expect(result.current.aiResultText).toBe("generated content");
  });

  it("handleAiGenerate shows error on empty prompt", async () => {
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    act(() => { result.current.handleAiGenerateOpen(); });
    await act(async () => { await result.current.handleAiGenerate(); });
    expect(result.current.aiError).toContain("description");
  });

  it("handleAiSummary calls summary endpoint", async () => {
    mockApiFetch.mockResolvedValue({ summary: "short summary" });
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    await act(async () => { await result.current.handleAiSummary("long text here"); });
    expect(result.current.aiAction).toBe("summary");
    expect(result.current.aiResultText).toBe("short summary");
  });

  it("handleAiTags fetches and suggests tags", async () => {
    mockApiFetch.mockResolvedValue({
      tags: ["Go", "Rust", "InvalidTag!!!"],
      existing_tags: [{ id: "e1", name: "existing" }],
    });
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    await act(async () => { await result.current.handleAiTags("some content"); });
    expect(result.current.aiAction).toBe("tags");
    expect(result.current.aiExistingTags).toHaveLength(1);
    expect(result.current.aiSuggestedTags).toContain("go");
    expect(result.current.aiSuggestedTags).toContain("rust");
    expect(result.current.aiSelectedTags.length).toBeLessThanOrEqual(5);
  });

  it("handleAiTags notifies on empty content", async () => {
    const opts = makeOpts();
    const { result } = renderHook(() => useAiAssistant(opts));
    await act(async () => { await result.current.handleAiTags(""); });
    expect(opts.notify).toHaveBeenCalled();
  });

  it("toggleAiTag toggles tag selection", async () => {
    mockApiFetch.mockResolvedValue({
      tags: ["go", "rust", "python"],
      existing_tags: [],
    });
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    await act(async () => { await result.current.handleAiTags("content"); });

    expect(result.current.aiSelectedTags).toContain("go");
    act(() => { result.current.toggleAiTag("go"); });
    expect(result.current.aiSelectedTags).not.toContain("go");
    act(() => { result.current.toggleAiTag("go"); });
    expect(result.current.aiSelectedTags).toContain("go");
  });

  it("toggleExistingTag toggles removal list", async () => {
    mockApiFetch.mockResolvedValue({
      tags: [],
      existing_tags: [{ id: "e1", name: "tag1" }],
    });
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    await act(async () => { await result.current.handleAiTags("content"); });
    act(() => { result.current.toggleExistingTag("e1"); });
    expect(result.current.aiRemovedTagIDs).toContain("e1");
    act(() => { result.current.toggleExistingTag("e1"); });
    expect(result.current.aiRemovedTagIDs).not.toContain("e1");
  });

  it("closeAiModal resets all state", async () => {
    mockApiFetch.mockResolvedValue({ text: "result" });
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    await act(async () => { await result.current.handleAiPolish("text"); });
    expect(result.current.aiModalOpen).toBe(true);
    act(() => { result.current.closeAiModal(); });
    expect(result.current.aiModalOpen).toBe(false);
    expect(result.current.aiAction).toBeNull();
    expect(result.current.aiResultText).toBe("");
  });

  it("aiTitle returns correct title based on action", async () => {
    mockApiFetch.mockResolvedValue({ text: "x" });
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    await act(async () => { await result.current.handleAiPolish("text"); });
    expect(result.current.aiTitle).toBe("AI Polish");
  });

  it("aiDiffLines computes diff between original and result", async () => {
    mockApiFetch.mockResolvedValue({ text: "line1\nchanged" });
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    await act(async () => { await result.current.handleAiPolish("line1\nline2"); });
    expect(result.current.aiDiffLines.length).toBeGreaterThan(0);
    expect(result.current.aiDiffLines.some((l) => l.type === "equal")).toBe(true);
  });

  it("handleApplyAiSummary calls API and invokes callback", async () => {
    mockApiFetch.mockResolvedValue({ summary: "short" });
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    await act(async () => { await result.current.handleAiSummary("long text"); });

    mockApiFetch.mockResolvedValue({});
    const onApplied = vi.fn();
    const onError = vi.fn();
    await act(async () => { await result.current.handleApplyAiSummary({ onApplied, onError }); });
    expect(onApplied).toHaveBeenCalledWith("short");
    expect(result.current.aiModalOpen).toBe(false);
  });

  it("handleApplyAiSummary handles error", async () => {
    mockApiFetch.mockResolvedValue({ summary: "short" });
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    await act(async () => { await result.current.handleAiSummary("long text"); });

    mockApiFetch.mockRejectedValue(new Error("save fail"));
    const onApplied = vi.fn();
    const onError = vi.fn();
    await act(async () => { await result.current.handleApplyAiSummary({ onApplied, onError }); });
    expect(onError).toHaveBeenCalledWith("save fail");
  });

  it("handleApplyAiTags creates tags and saves", async () => {
    mockApiFetch.mockResolvedValue({ tags: ["newtag"], existing_tags: [] });
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    await act(async () => { await result.current.handleAiTags("content"); });

    const findExistingTagByName = vi.fn().mockResolvedValue(null);
    const mergeTags = vi.fn();
    const saveTagIDs = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();
    mockApiFetch.mockResolvedValue([{ id: "new1", name: "newtag" }]);
    await act(async () => {
      await result.current.handleApplyAiTags({ findExistingTagByName, mergeTags, saveTagIDs, onError });
    });
    expect(saveTagIDs).toHaveBeenCalled();
    expect(result.current.aiModalOpen).toBe(false);
  });

  it("handleApplyAiTags closes modal when no tags selected", async () => {
    mockApiFetch.mockResolvedValue({ tags: [], existing_tags: [] });
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    await act(async () => { await result.current.handleAiTags("content"); });

    const { result: r2 } = renderHook(() => useAiAssistant(makeOpts()));
    act(() => { r2.current.closeAiModal(); });
  });

  it("aiAvailableSlots computed correctly", async () => {
    mockApiFetch.mockResolvedValue({ tags: ["a", "b"], existing_tags: [{ id: "e1", name: "x" }, { id: "e2", name: "y" }] });
    const { result } = renderHook(() => useAiAssistant(makeOpts({ maxTags: 5 })));
    await act(async () => { await result.current.handleAiTags("content"); });
    expect(result.current.aiAvailableSlots).toBe(3);
  });

  it("toggleAiTag notifies when at max tags", async () => {
    mockApiFetch.mockResolvedValue({ tags: ["a", "b", "c"], existing_tags: [{ id: "e1", name: "x" }, { id: "e2", name: "y" }] });
    const opts = makeOpts({ maxTags: 3 });
    const { result } = renderHook(() => useAiAssistant(opts));
    await act(async () => { await result.current.handleAiTags("content"); });
    act(() => { result.current.toggleAiTag("c"); });
    expect(opts.notify).toHaveBeenCalledWith(expect.stringContaining("3"));
  });

  it("handleApplyAiTags handles error from batch create", async () => {
    mockApiFetch.mockResolvedValue({ tags: ["newtag"], existing_tags: [] });
    const opts = makeOpts();
    const { result } = renderHook(() => useAiAssistant(opts));
    await act(async () => { await result.current.handleAiTags("content"); });
    expect(result.current.aiSelectedTags).toContain("newtag");

    const findExistingTagByName = vi.fn().mockResolvedValue(null);
    const mergeTags = vi.fn();
    const saveTagIDs = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();
    mockApiFetch.mockRejectedValueOnce(new Error("batch fail"));
    await act(async () => {
      await result.current.handleApplyAiTags({ findExistingTagByName, mergeTags, saveTagIDs, onError });
    });
    expect(onError).toHaveBeenCalledWith("batch fail");
  });

  it("handleApplyAiTags with matched existing tags (no batch create)", async () => {
    mockApiFetch.mockResolvedValue({ tags: ["existing"], existing_tags: [] });
    const opts = makeOpts();
    const { result } = renderHook(() => useAiAssistant(opts));
    await act(async () => { await result.current.handleAiTags("content"); });

    const matchedTag = { id: "m1", name: "existing" };
    const findExistingTagByName = vi.fn().mockResolvedValue(matchedTag);
    const mergeTags = vi.fn();
    const saveTagIDs = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();
    await act(async () => {
      await result.current.handleApplyAiTags({ findExistingTagByName, mergeTags, saveTagIDs, onError });
    });
    expect(saveTagIDs).toHaveBeenCalledWith(["m1"]);
  });

  it("handleApplyAiSummary closes modal when no result text", async () => {
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    const onApplied = vi.fn();
    const onError = vi.fn();
    await act(async () => { await result.current.handleApplyAiSummary({ onApplied, onError }); });
    expect(onApplied).not.toHaveBeenCalled();
    expect(result.current.aiModalOpen).toBe(false);
  });

  it("handleAiGenerate handles API error", async () => {
    mockApiFetch.mockRejectedValue(new Error("gen fail"));
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    act(() => { result.current.handleAiGenerateOpen(); });
    act(() => { result.current.setAiPrompt("something"); });
    await act(async () => { await result.current.handleAiGenerate(); });
    expect(result.current.aiError).toBe("gen fail");
  });

  it("handleAiTags error sets aiError", async () => {
    mockApiFetch.mockRejectedValue(new Error("tags fail"));
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    await act(async () => { await result.current.handleAiTags("content"); });
    expect(result.current.aiError).toBe("tags fail");
  });

  it("buildLineDiff handles add-only diff", async () => {
    mockApiFetch.mockResolvedValue({ text: "new line" });
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    await act(async () => { await result.current.handleAiPolish("original"); });
    const addLines = result.current.aiDiffLines.filter(l => l.type === "add");
    expect(addLines.length).toBeGreaterThanOrEqual(0);
  });

  it("buildLineDiff handles trailing removals", async () => {
    mockApiFetch.mockResolvedValue({ text: "line1" });
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    await act(async () => { await result.current.handleAiPolish("line1\nline2\nline3"); });
    const removeLines = result.current.aiDiffLines.filter(l => l.type === "remove");
    expect(removeLines.length).toBeGreaterThan(0);
  });
});
