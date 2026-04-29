import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

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

  it("handleApplyAiTags with no selected and no removed closes modal", async () => {
    mockApiFetch.mockResolvedValue({ tags: [], existing_tags: [{ id: "e1", name: "tag1" }] });
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    await act(async () => { await result.current.handleAiTags("content"); });
    expect(result.current.aiSelectedTags).toHaveLength(0);
    expect(result.current.aiRemovedTagIDs).toHaveLength(0);
    const saveTagIDs = vi.fn();
    await act(async () => {
      await result.current.handleApplyAiTags({
        findExistingTagByName: vi.fn(), mergeTags: vi.fn(), saveTagIDs, onError: vi.fn(),
      });
    });
    expect(saveTagIDs).not.toHaveBeenCalled();
    expect(result.current.aiModalOpen).toBe(false);
  });

  it("handleApplyAiTags with only removed tags applies without creating", async () => {
    mockApiFetch.mockResolvedValue({
      tags: [],
      existing_tags: [{ id: "e1", name: "old1" }, { id: "e2", name: "old2" }],
    });
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    await act(async () => { await result.current.handleAiTags("content"); });
    act(() => { result.current.toggleExistingTag("e1"); });
    expect(result.current.aiSelectedTags).toHaveLength(0);
    expect(result.current.aiRemovedTagIDs).toContain("e1");

    const saveTagIDs = vi.fn().mockResolvedValue(undefined);
    await act(async () => {
      await result.current.handleApplyAiTags({
        findExistingTagByName: vi.fn(), mergeTags: vi.fn(), saveTagIDs, onError: vi.fn(),
      });
    });
    expect(saveTagIDs).toHaveBeenCalledWith(["e2"]);
  });

  it("handleApplyAiTags with removed existing tags and matched tags", async () => {
    mockApiFetch.mockResolvedValue({
      tags: ["newtag"],
      existing_tags: [{ id: "e1", name: "old1" }, { id: "e2", name: "old2" }],
    });
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    await act(async () => { await result.current.handleAiTags("content"); });
    act(() => { result.current.toggleExistingTag("e1"); });
    expect(result.current.aiRemovedTagIDs).toContain("e1");

    const matchedTag = { id: "m1", name: "newtag" };
    const findExistingTagByName = vi.fn().mockResolvedValue(matchedTag);
    const saveTagIDs = vi.fn().mockResolvedValue(undefined);
    await act(async () => {
      await result.current.handleApplyAiTags({
        findExistingTagByName, mergeTags: vi.fn(), saveTagIDs, onError: vi.fn(),
      });
    });
    expect(saveTagIDs).toHaveBeenCalledWith(expect.arrayContaining(["e2", "m1"]));
    expect(saveTagIDs).toHaveBeenCalledWith(expect.not.arrayContaining(["e1"]));
  });

  it("toggleAiTag ignores existing tag names", async () => {
    mockApiFetch.mockResolvedValue({ tags: [], existing_tags: [{ id: "e1", name: "existing" }] });
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    await act(async () => { await result.current.handleAiTags("content"); });
    act(() => { result.current.toggleAiTag("existing"); });
    expect(result.current.aiSelectedTags).toHaveLength(0);
  });

  it("runAiTextAction handles non-Error thrown", async () => {
    mockApiFetch.mockRejectedValue("string error");
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    await act(async () => { await result.current.handleAiPolish("text"); });
    expect(result.current.aiError).toBe("AI request failed");
  });

  it("handleAiGenerate handles non-Error thrown", async () => {
    mockApiFetch.mockRejectedValue("string error");
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    act(() => { result.current.handleAiGenerateOpen(); });
    act(() => { result.current.setAiPrompt("something"); });
    await act(async () => { await result.current.handleAiGenerate(); });
    expect(result.current.aiError).toBe("AI request failed");
  });

  it("handleApplyAiSummary handles non-Error thrown", async () => {
    mockApiFetch.mockResolvedValue({ summary: "short" });
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    await act(async () => { await result.current.handleAiSummary("long text"); });
    mockApiFetch.mockRejectedValue("non-error");
    const onError = vi.fn();
    await act(async () => { await result.current.handleApplyAiSummary({ onApplied: vi.fn(), onError }); });
    expect(onError).toHaveBeenCalledWith("Failed to apply summary");
  });

  it("handleAiTags handles non-Error thrown", async () => {
    mockApiFetch.mockRejectedValue("string error");
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    await act(async () => { await result.current.handleAiTags("content"); });
    expect(result.current.aiError).toBe("AI request failed");
  });

  it("handleAiTags deduplicates and filters invalid suggested tags", async () => {
    mockApiFetch.mockResolvedValue({
      tags: ["Go", "go", "Invalid!!!"],
      existing_tags: [],
    });
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    await act(async () => { await result.current.handleAiTags("content"); });
    expect(result.current.aiSuggestedTags).toEqual(["go"]);
  });

  it("aiTitle falls back to AI Tags for unknown action", () => {
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    expect(result.current.aiTitle).toBe("AI Tags");
  });

  it("aiDiffLines shows remove/add for different lines", async () => {
    mockApiFetch.mockResolvedValue({ text: "new line" });
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    await act(async () => { await result.current.handleAiPolish("old line"); });
    expect(result.current.aiDiffLines.length).toBeGreaterThan(0);
    expect(result.current.aiDiffLines.some(l => l.type === "remove")).toBe(true);
    expect(result.current.aiDiffLines.some(l => l.type === "add")).toBe(true);
  });

  it("aiDiffLines shows equal for identical lines", async () => {
    mockApiFetch.mockResolvedValue({ text: "same\nline" });
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    await act(async () => { await result.current.handleAiPolish("same\nline"); });
    expect(result.current.aiDiffLines.every(l => l.type === "equal")).toBe(true);
  });

  it("aiDiffLines handles longer old text than new text", async () => {
    mockApiFetch.mockResolvedValue({ text: "A" });
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    await act(async () => { await result.current.handleAiPolish("A\nB\nC"); });
    expect(result.current.aiDiffLines.some(l => l.type === "remove")).toBe(true);
    expect(result.current.aiDiffLines.some(l => l.type === "equal")).toBe(true);
  });

  it("aiDiffLines handles longer new text than old text", async () => {
    mockApiFetch.mockResolvedValue({ text: "A\nB\nC" });
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    await act(async () => { await result.current.handleAiPolish("A"); });
    expect(result.current.aiDiffLines.some(l => l.type === "add")).toBe(true);
    expect(result.current.aiDiffLines.some(l => l.type === "equal")).toBe(true);
  });

  it("runAiTextAction non-Error shows generic message", async () => {
    mockApiFetch.mockRejectedValue("string error");
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    await act(async () => { await result.current.handleAiPolish("content"); });
    expect(result.current.aiError).toBe("AI request failed");
  });

  it("handleAiGenerate non-Error shows generic message", async () => {
    const { result } = renderHook(() => useAiAssistant(makeOpts()));
    act(() => { result.current.handleAiGenerateOpen(); });
    mockApiFetch.mockRejectedValue("string error");
    act(() => { result.current.setAiPrompt("test prompt"); });
    await act(async () => { await result.current.handleAiGenerate(); });
    expect(result.current.aiError).toBe("AI request failed");
  });
});
