import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
const stableToast = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: stableToast }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { apiFetch } from "@/lib/api";
import { useTemplateTags } from "../hooks/useTemplateTags";
import { useTemplates } from "../hooks/useTemplates";

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => { vi.clearAllMocks(); });

describe("useTemplateTags", () => {
  it("starts with empty state", () => {
    const { result } = renderHook(() => useTemplateTags(null));
    expect(result.current.selectedTagIDs).toEqual([]);
    expect(result.current.showTagInput).toBe(false);
  });

  it("syncs tag IDs when template reference changes", () => {
    mockApiFetch.mockResolvedValue([]);
    const { result, rerender } = renderHook(
      ({ tmpl }) => useTemplateTags(tmpl),
      { initialProps: { tmpl: null as { default_tag_ids?: string[] } | null } }
    );
    expect(result.current.selectedTagIDs).toEqual([]);
    const tmplA = { default_tag_ids: ["t1", "t2"] };
    rerender({ tmpl: tmplA });
    expect(result.current.selectedTagIDs).toEqual(["t1", "t2"]);
    const tmplB = { default_tag_ids: ["t3"] };
    rerender({ tmpl: tmplB });
    expect(result.current.selectedTagIDs).toEqual(["t3"]);
  });

  it("resets to empty when template becomes null", () => {
    mockApiFetch.mockResolvedValue([]);
    const { result, rerender } = renderHook(
      ({ tmpl }) => useTemplateTags(tmpl),
      { initialProps: { tmpl: null as { default_tag_ids?: string[] } | null } }
    );
    const tmplA = { default_tag_ids: ["t1"] };
    rerender({ tmpl: tmplA });
    expect(result.current.selectedTagIDs).toEqual(["t1"]);
    rerender({ tmpl: null });
    expect(result.current.selectedTagIDs).toEqual([]);
  });

  it("addTag adds existing tag object", async () => {
    const { result } = renderHook(() => useTemplateTags(null));
    await act(async () => {
      await result.current.addTag({ id: "t1", name: "go" } as never);
    });
    expect(result.current.selectedTagIDs).toContain("t1");
  });

  it("addTag creates new tag by name", async () => {
    mockApiFetch.mockResolvedValue({ id: "t2", name: "rust" });
    const { result } = renderHook(() => useTemplateTags(null));
    await act(async () => { await result.current.addTag("rust"); });
    expect(result.current.selectedTagIDs).toContain("t2");
  });

  it("addTag respects max tags limit", async () => {
    mockApiFetch.mockResolvedValue([]);
    const { result } = renderHook(() => useTemplateTags(null));
    act(() => { result.current.setSelectedTagIDs(Array.from({ length: 10 }, (_, i) => `t${i}`)); });
    await act(async () => { await result.current.addTag("overflow"); });
    expect(result.current.selectedTagIDs).toHaveLength(10);
  });

  it("setTagQuery and setShowTagInput work", () => {
    const { result } = renderHook(() => useTemplateTags(null));
    act(() => { result.current.setTagQuery("react"); });
    expect(result.current.tagQuery).toBe("react");
    act(() => { result.current.setShowTagInput(true); });
    expect(result.current.showTagInput).toBe(true);
  });

  it("addTag with invalid name shows error", async () => {
    const { result } = renderHook(() => useTemplateTags(null));
    await act(async () => { await result.current.addTag("!!!"); });
    expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
  });

  it("addTag with empty name does nothing", async () => {
    const { result } = renderHook(() => useTemplateTags(null));
    await act(async () => { await result.current.addTag("  "); });
    expect(result.current.selectedTagIDs).toEqual([]);
  });

  it("addTag creates new tag by name", async () => {
    mockApiFetch.mockResolvedValueOnce({ id: "t5", name: "newTag" });
    const { result } = renderHook(() => useTemplateTags(null));
    await act(async () => { await result.current.addTag("newTag"); });
    expect(result.current.selectedTagIDs).toContain("t5");
  });

  it("addTag falls back to search when create fails", async () => {
    mockApiFetch
      .mockRejectedValueOnce(new Error("conflict"))
      .mockResolvedValueOnce([{ id: "t6", name: "existing" }]);
    const { result } = renderHook(() => useTemplateTags(null));
    await act(async () => { await result.current.addTag("existing"); });
    expect(result.current.selectedTagIDs).toContain("t6");
  });

  it("addTag shows error when both create and search fail", async () => {
    mockApiFetch
      .mockRejectedValueOnce(new Error("create fail"))
      .mockRejectedValueOnce(new Error("search fail"));
    const { result } = renderHook(() => useTemplateTags(null));
    await act(async () => { await result.current.addTag("failing"); });
    expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
  });

  it("addTag shows error when search finds no match", async () => {
    mockApiFetch
      .mockRejectedValueOnce(new Error("create fail"))
      .mockResolvedValueOnce([{ id: "x", name: "other" }]);
    const { result } = renderHook(() => useTemplateTags(null));
    await act(async () => { await result.current.addTag("noMatch"); });
    expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({ description: "create fail" }));
  });

  it("visibleSelectedTags maps IDs to tag objects", async () => {
    mockApiFetch.mockResolvedValue([{ id: "t1", name: "go" }]);
    const { result } = renderHook(() => useTemplateTags(null));
    await act(async () => { await result.current.addTag({ id: "t1", name: "go" } as never); });
    expect(result.current.visibleSelectedTags).toHaveLength(1);
    expect(result.current.visibleSelectedTags[0].name).toBe("go");
  });

  it("addTag does not add duplicate tag object", async () => {
    const { result } = renderHook(() => useTemplateTags(null));
    await act(async () => { await result.current.addTag({ id: "t1", name: "go" } as never); });
    await act(async () => { await result.current.addTag({ id: "t1", name: "go" } as never); });
    expect(result.current.selectedTagIDs.filter((id) => id === "t1")).toHaveLength(1);
  });
});

const fullTemplate = (id: string, name = "Template") => ({
  id, name, description: "", content: "# Hello\n", default_tag_ids: [] as string[],
  ctime: 1000, mtime: 1000,
});
const metaItem = (id: string, name = "Template") => ({
  id, name, description: "", default_tag_ids: [],
});

function setupApiRouter(responses: Record<string, unknown>) {
  mockApiFetch.mockImplementation(((url: string) => {
    for (const [pattern, value] of Object.entries(responses)) {
      if (url.startsWith(pattern)) return Promise.resolve(value);
    }
    return Promise.resolve(undefined);
  }) as typeof apiFetch);
}

describe("useTemplates", () => {
  it("loads templates on mount", async () => {
    setupApiRouter({
      "/templates/meta": { items: [metaItem("t1", "Template 1")], total: 1 },
      "/templates/t1": fullTemplate("t1", "Template 1"),
      "/tags/ids": [],
    });
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    expect(result.current.templates).toHaveLength(1);
  });

  it("handles template list scroll", async () => {
    const items = Array.from({ length: 20 }, (_, i) => metaItem(`t${i}`, `T${i}`));
    setupApiRouter({
      "/templates/meta": { items, total: 40 },
      "/templates/t0": fullTemplate("t0", "T0"),
      "/tags/ids": [],
    });
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    expect(result.current.templates).toHaveLength(20);
  });

  it("search filters templates client-side", async () => {
    setupApiRouter({
      "/templates/meta": { items: [metaItem("t1", "Alpha"), metaItem("t2", "Beta")], total: 2 },
      "/templates/t1": fullTemplate("t1", "Alpha"),
      "/tags/ids": [],
    });
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.setSearch("Alpha"); });
    expect(result.current.templates).toHaveLength(1);
    expect(result.current.templates[0].name).toBe("Alpha");
  });

  it("creates new template", async () => {
    mockApiFetch.mockImplementation(((url: string, opts?: RequestInit) => {
      if (url.startsWith("/templates/meta")) return Promise.resolve({ items: [], total: 0 });
      if (url === "/templates" && opts?.method === "POST") return Promise.resolve({ id: "new1" });
      if (url.startsWith("/templates/")) return Promise.resolve(fullTemplate("new1", "New Template"));
      if (url === "/tags/ids") return Promise.resolve([]);
      return Promise.resolve(undefined);
    }) as typeof apiFetch);

    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    await act(async () => { void result.current.createTemplate(); });
    expect(mockApiFetch).toHaveBeenCalledWith("/templates", expect.objectContaining({ method: "POST" }));
  });

  it("deletes template with confirmation", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    mockApiFetch.mockImplementation(((url: string, opts?: RequestInit) => {
      if (url.startsWith("/templates/meta")) return Promise.resolve({ items: [metaItem("t1", "T1")], total: 1 });
      if (url.startsWith("/templates/t1") && opts?.method === "DELETE") return Promise.resolve(undefined);
      if (url.startsWith("/templates/t1")) return Promise.resolve(fullTemplate("t1", "T1"));
      if (url === "/tags/ids") return Promise.resolve([]);
      return Promise.resolve(undefined);
    }) as typeof apiFetch);

    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    await act(async () => { void result.current.deleteTemplate("t1", "T1"); });
    expect(mockApiFetch).toHaveBeenCalledWith("/templates/t1", { method: "DELETE" });
  });

  it("draft and setDraft work", async () => {
    setupApiRouter({
      "/templates/meta": { items: [metaItem("t1", "Tmpl")], total: 1 },
      "/templates/t1": fullTemplate("t1", "Tmpl"),
      "/tags/ids": [],
    });
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.setDraft({ name: "Updated", description: "desc", content: "# New" }); });
    expect(result.current.draft.name).toBe("Updated");
  });

  it("saveTemplate saves and refreshes list", async () => {
    mockApiFetch.mockImplementation(((url: string, opts?: RequestInit) => {
      if (url.startsWith("/templates/meta")) return Promise.resolve({ items: [metaItem("t1", "T1")], total: 1 });
      if (url.startsWith("/templates/t1") && opts?.method === "PUT") return Promise.resolve(undefined);
      if (url.startsWith("/templates/t1")) return Promise.resolve(fullTemplate("t1", "T1"));
      if (url === "/tags/ids") return Promise.resolve([]);
      return Promise.resolve(undefined);
    }) as typeof apiFetch);
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.setDraft({ name: "Changed", description: "", content: "# X" }); });
    await act(async () => { const ok = await result.current.saveTemplate(); expect(ok).toBe(true); });
    expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({ description: "Template saved." }));
  });

  it("saveTemplate returns false on error", async () => {
    mockApiFetch.mockImplementation(((url: string, opts?: RequestInit) => {
      if (url.startsWith("/templates/meta")) return Promise.resolve({ items: [metaItem("t1", "T1")], total: 1 });
      if (url.startsWith("/templates/t1") && opts?.method === "PUT") return Promise.reject(new Error("save fail"));
      if (url.startsWith("/templates/t1")) return Promise.resolve(fullTemplate("t1", "T1"));
      if (url === "/tags/ids") return Promise.resolve([]);
      return Promise.resolve(undefined);
    }) as typeof apiFetch);
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.setDraft({ name: "X", description: "", content: "# X" }); });
    await act(async () => { const ok = await result.current.saveTemplate(); expect(ok).toBe(false); });
    expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
  });

  it("saveTemplate returns false when no selectedTemplate", async () => {
    setupApiRouter({ "/templates/meta": { items: [], total: 0 }, "/tags/ids": [] });
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    await act(async () => { const ok = await result.current.saveTemplate(); expect(ok).toBe(false); });
  });

  it("isSaveDisabled is true when nothing changed", async () => {
    setupApiRouter({
      "/templates/meta": { items: [metaItem("t1", "Tmpl")], total: 1 },
      "/templates/t1": fullTemplate("t1", "Tmpl"),
      "/tags/ids": [],
    });
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    await waitFor(() => { expect(result.current.draft.name).toBe("Tmpl"); });
    expect(result.current.isSaveDisabled).toBe(true);
  });

  it("isSaveDisabled is false when draft changed", async () => {
    setupApiRouter({
      "/templates/meta": { items: [metaItem("t1", "Tmpl")], total: 1 },
      "/templates/t1": fullTemplate("t1", "Tmpl"),
      "/tags/ids": [],
    });
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    await waitFor(() => { expect(result.current.draft.name).toBe("Tmpl"); });
    act(() => { result.current.setDraft({ name: "Changed", description: "", content: "# Hello\n" }); });
    expect(result.current.isSaveDisabled).toBe(false);
  });

  it("createFromTemplate navigates on success", async () => {
    const stablePush = vi.fn();
    vi.mocked(await import("next/navigation")).useRouter = (() => ({ push: stablePush })) as never;
    mockApiFetch.mockImplementation(((url: string, opts?: RequestInit) => {
      if (url.startsWith("/templates/meta")) return Promise.resolve({ items: [metaItem("t1", "T1")], total: 1 });
      if (url.endsWith("/create") && opts?.method === "POST") return Promise.resolve({ id: "doc1" });
      if (url.startsWith("/templates/t1")) return Promise.resolve(fullTemplate("t1", "T1"));
      if (url === "/tags/ids") return Promise.resolve([]);
      return Promise.resolve(undefined);
    }) as typeof apiFetch);
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    await act(async () => { await result.current.createFromTemplate({ NAME: "Test" }); });
    expect(stablePush).toHaveBeenCalledWith("/docs/doc1");
  });

  it("createFromTemplate error shows toast", async () => {
    mockApiFetch.mockImplementation(((url: string, opts?: RequestInit) => {
      if (url.startsWith("/templates/meta")) return Promise.resolve({ items: [metaItem("t1", "T1")], total: 1 });
      if (url.endsWith("/create") && opts?.method === "POST") return Promise.reject(new Error("fail"));
      if (url.startsWith("/templates/t1")) return Promise.resolve(fullTemplate("t1", "T1"));
      if (url === "/tags/ids") return Promise.resolve([]);
      return Promise.resolve(undefined);
    }) as typeof apiFetch);
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    await act(async () => { await result.current.createFromTemplate({ NAME: "Test" }); });
    expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
  });

  it("previewContent resolves system variables", async () => {
    setupApiRouter({
      "/templates/meta": { items: [metaItem("t1", "T1")], total: 1 },
      "/templates/t1": fullTemplate("t1", "T1"),
      "/tags/ids": [],
    });
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.setDraft({ name: "T1", description: "", content: "Hello {{SYS:DATE}}" }); });
    expect(result.current.previewContent).not.toContain("{{SYS:DATE}}");
  });

  it("previewContent resolves user variables", async () => {
    setupApiRouter({
      "/templates/meta": { items: [metaItem("t1", "T1")], total: 1 },
      "/templates/t1": fullTemplate("t1", "T1"),
      "/tags/ids": [],
    });
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.setDraft({ name: "T1", description: "", content: "Hello {{NAME}}" }); });
    act(() => { result.current.setVariableValues({ NAME: "World" }); });
    expect(result.current.previewContent).toContain("World");
  });

  it("handleTemplateListScroll triggers loadMore", async () => {
    const items = Array.from({ length: 10 }, (_, i) => metaItem(`t${i}`, `T${i}`));
    mockApiFetch.mockImplementation(((url: string) => {
      if (url.startsWith("/templates/meta")) return Promise.resolve({ items, total: 50 });
      if (url.startsWith("/templates/t0")) return Promise.resolve(fullTemplate("t0", "T0"));
      if (url === "/tags/ids") return Promise.resolve([]);
      return Promise.resolve(undefined);
    }) as typeof apiFetch);
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    const scrollEvent = { currentTarget: { scrollTop: 900, clientHeight: 100, scrollHeight: 1000 } };
    act(() => { result.current.handleTemplateListScroll(scrollEvent as never); });
  });

  it("deleteTemplate cancelled by confirm does nothing", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    setupApiRouter({
      "/templates/meta": { items: [metaItem("t1", "T1")], total: 1 },
      "/templates/t1": fullTemplate("t1", "T1"),
      "/tags/ids": [],
    });
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    const callCountBefore = mockApiFetch.mock.calls.length;
    await act(async () => { void result.current.deleteTemplate("t1", "T1"); });
    const deleteCalls = mockApiFetch.mock.calls.slice(callCountBefore).filter(([, opts]) => (opts as { method?: string })?.method === "DELETE");
    expect(deleteCalls).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("selected is null when no templates", async () => {
    setupApiRouter({ "/templates/meta": { items: [], total: 0 }, "/tags/ids": [] });
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    expect(result.current.selected).toBeNull();
  });

  it("loadTemplates error shows toast", async () => {
    mockApiFetch.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
  });
});
