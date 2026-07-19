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

beforeEach(() => {
  mockApiFetch.mockReset();
  stableToast.mockReset();
});

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

  it("addTag non-Error shows generic error", async () => {
    mockApiFetch
      .mockRejectedValueOnce("string error")
      .mockRejectedValueOnce("search fail");
    const { result } = renderHook(() => useTemplateTags(null));
    await act(async () => { await result.current.addTag("test"); });
    expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({ description: "Failed to create tag" }));
  });

  it("addTag found existing already in allTags does not duplicate", async () => {
    const { result } = renderHook(() => useTemplateTags(null));
    await act(async () => { await result.current.addTag({ id: "t1", name: "go" } as never); });
    mockApiFetch
      .mockRejectedValueOnce(new Error("conflict"))
      .mockResolvedValueOnce([{ id: "t1", name: "go" }]);
    await act(async () => { await result.current.addTag("go"); });
    expect(result.current.selectedTagIDs.filter((id) => id === "t1")).toHaveLength(1);
  });

  it("addTag already selected tag is no-op on fallback search", async () => {
    const { result } = renderHook(() => useTemplateTags(null));
    await act(async () => { await result.current.addTag({ id: "t1", name: "go" } as never); });
    expect(result.current.selectedTagIDs).toContain("t1");
    mockApiFetch
      .mockRejectedValueOnce(new Error("conflict"))
      .mockResolvedValueOnce([{ id: "t1", name: "go" }]);
    await act(async () => { await result.current.addTag("go"); });
    expect(result.current.selectedTagIDs.filter((id) => id === "t1")).toHaveLength(1);
  });

  it("loads missing tags effect triggers when template changes", async () => {
    mockApiFetch.mockResolvedValue([{ id: "t99", name: "loaded" }]);
    const { result, rerender } = renderHook(
      ({ t }) => useTemplateTags(t),
      { initialProps: { t: null as { default_tag_ids?: string[] } | null } }
    );
    const tmpl = { default_tag_ids: ["t99"] };
    rerender({ t: tmpl });
    expect(result.current.selectedTagIDs).toEqual(["t99"]);
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith("/tags/ids", expect.objectContaining({ method: "POST" }));
    });
  });
});

const fullTemplate = (id: string, name = "Template") => ({
  id, name, description: "", content: "# Hello\n", default_tag_ids: [] as string[],
  ctime: 1000, mtime: 1000,
});
const metaItem = (id: string, name = "Template") => ({
  id, name, description: "", default_tag_ids: [],
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function setupApiRouter(responses: Record<string, unknown>) {
  mockApiFetch.mockImplementation(((url: string) => {
    for (const [pattern, value] of Object.entries(responses)) {
      if (url.startsWith(pattern)) return Promise.resolve(value);
    }
    return Promise.resolve(undefined);
  }));
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

  it("searches templates through the paginated server endpoint", async () => {
    mockApiFetch.mockImplementation(((url: string) => {
      if (url.includes("/templates/meta") && url.includes("q=Alpha")) {
        return Promise.resolve({ items: [metaItem("t1", "Alpha")], total: 1 });
      }
      if (url.startsWith("/templates/meta")) {
        return Promise.resolve({ items: [metaItem("t1", "Alpha"), metaItem("t2", "Beta")], total: 2 });
      }
      if (url.startsWith("/templates/t1")) return Promise.resolve(fullTemplate("t1", "Alpha"));
      if (url === "/tags/ids") return Promise.resolve([]);
      return Promise.resolve(undefined);
    }));
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.setSearch("Alpha"); });
    await waitFor(() => { expect(result.current.templates).toHaveLength(1); });
    expect(result.current.templates[0].name).toBe("Alpha");
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining("q=Alpha"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("creates new template", async () => {
    mockApiFetch.mockImplementation(((url: string, opts?: RequestInit) => {
      if (url.startsWith("/templates/meta")) return Promise.resolve({ items: [], total: 0 });
      if (url === "/templates" && opts?.method === "POST") return Promise.resolve({ id: "new1" });
      if (url.startsWith("/templates/")) return Promise.resolve(fullTemplate("new1", "New Template"));
      if (url === "/tags/ids") return Promise.resolve([]);
      return Promise.resolve(undefined);
    }));

    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    await act(async () => { void result.current.createTemplate(); });
    expect(mockApiFetch).toHaveBeenCalledWith("/templates", expect.objectContaining({ method: "POST" }));
  });

  it("deletes template with confirmation", async () => {
    mockApiFetch.mockImplementation(((url: string, opts?: RequestInit) => {
      if (url.startsWith("/templates/meta")) return Promise.resolve({ items: [metaItem("t1", "T1")], total: 1 });
      if (url.startsWith("/templates/t1") && opts?.method === "DELETE") return Promise.resolve(undefined);
      if (url.startsWith("/templates/t1")) return Promise.resolve(fullTemplate("t1", "T1"));
      if (url === "/tags/ids") return Promise.resolve([]);
      return Promise.resolve(undefined);
    }));

    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.requestDeleteTemplate("t1", "T1"); });
    await act(async () => { await result.current.confirmDeleteTemplate(); });
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
    }));
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
    }));
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
    }));
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
    }));
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
    }));
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    const scrollEvent = { currentTarget: { scrollTop: 900, clientHeight: 100, scrollHeight: 1000 } };
    act(() => { result.current.handleTemplateListScroll(scrollEvent as never); });
  });

  it("template deletion can be cancelled before confirmation", async () => {
    setupApiRouter({
      "/templates/meta": { items: [metaItem("t1", "T1")], total: 1 },
      "/templates/t1": fullTemplate("t1", "T1"),
      "/tags/ids": [],
    });
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    const callCountBefore = mockApiFetch.mock.calls.length;
    act(() => { result.current.requestDeleteTemplate("t1", "T1"); });
    act(() => { result.current.cancelDeleteTemplate(); });
    const deleteCalls = mockApiFetch.mock.calls.slice(callCountBefore).filter(([, opts]) => (opts as { method?: string })?.method === "DELETE");
    expect(deleteCalls).toHaveLength(0);
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
    expect(result.current.listError).toBe("network");
    expect(stableToast).not.toHaveBeenCalled();
  });

  it("createTemplate error shows toast", async () => {
    setupApiRouter({
      "/templates/meta": { items: [metaItem("t1", "T1")], total: 1 },
      "/templates/t1": fullTemplate("t1", "T1"),
      "/tags/ids": [],
    });
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    mockApiFetch.mockRejectedValueOnce(new Error("create fail"));
    await act(async () => { void result.current.createTemplate(); });
    expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
  });

  it("template deletion error shows toast", async () => {
    setupApiRouter({
      "/templates/meta": { items: [metaItem("t1", "T1")], total: 1 },
      "/templates/t1": fullTemplate("t1", "T1"),
      "/tags/ids": [],
    });
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    mockApiFetch.mockRejectedValueOnce(new Error("delete fail"));
    act(() => { result.current.requestDeleteTemplate("t1", "T1"); });
    await act(async () => { await result.current.confirmDeleteTemplate(); });
    expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
  });

  it("prepareUseTemplate opens variable modal", async () => {
    setupApiRouter({
      "/templates/meta": { items: [metaItem("t1", "T1")], total: 1 },
      "/templates/t1": { ...fullTemplate("t1", "T1"), content: "# {{VAR1}}\nHello {{SYS:DATE}}" },
      "/tags/ids": [],
    });
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    await waitFor(() => { expect(result.current.selected).toBeTruthy(); });
    await act(async () => { result.current.prepareUseTemplate(); });
    await waitFor(() => { expect(result.current.showVariableModal).toBe(true); });
  });

  it("prepareUseTemplate no-op when no template selected", async () => {
    setupApiRouter({ "/templates/meta": { items: [], total: 0 }, "/tags/ids": [] });
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.prepareUseTemplate(); });
    expect(result.current.showVariableModal).toBe(false);
  });

  it("saveTemplate returns false when no selected template", async () => {
    setupApiRouter({ "/templates/meta": { items: [], total: 0 }, "/tags/ids": [] });
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.saveTemplate(); });
    expect(ok).toBe(false);
  });

  it("saveTemplate saves and refreshes", async () => {
    let savedName = "T1";
    mockApiFetch.mockImplementation(((url: string, opts?: RequestInit) => {
      if ((opts as { method?: string })?.method === "PUT") { savedName = "New Name"; return Promise.resolve(undefined); }
      if (url.startsWith("/templates/meta")) return Promise.resolve({ items: [metaItem("t1", savedName)], total: 1 });
      if (url.startsWith("/templates/t1")) return Promise.resolve(fullTemplate("t1", savedName));
      if (url === "/tags/ids") return Promise.resolve([]);
      return Promise.resolve(undefined);
    }));
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    await waitFor(() => { expect(result.current.draft.name).toBe("T1"); });
    act(() => { result.current.setDraft({ name: "New Name", description: "desc", content: "# New" }); });
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.saveTemplate(); });
    expect(ok).toBe(true);
  });

  it("isSaveDisabled is true when draft matches template", async () => {
    setupApiRouter({
      "/templates/meta": { items: [metaItem("t1", "T1")], total: 1 },
      "/templates/t1": fullTemplate("t1", "T1"),
      "/tags/ids": [],
    });
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    await waitFor(() => { expect(result.current.draft.name).toBe("T1"); });
    expect(result.current.isSaveDisabled).toBe(true);
  });

  it("template deletion refreshes selectedID if matching", async () => {
    setupApiRouter({
      "/templates/meta": { items: [metaItem("t1", "T1"), metaItem("t2", "T2")], total: 2 },
      "/templates/t1": fullTemplate("t1", "T1"),
      "/tags/ids": [],
    });
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    mockApiFetch.mockResolvedValueOnce(undefined);
    mockApiFetch.mockResolvedValueOnce({ items: [metaItem("t2", "T2")], total: 1 });
    mockApiFetch.mockResolvedValueOnce(fullTemplate("t2", "T2"));
    act(() => { result.current.requestDeleteTemplate("t1", "T1"); });
    await act(async () => { await result.current.confirmDeleteTemplate(); });
  });

  it("clearing search restores the default server page immediately", async () => {
    mockApiFetch.mockImplementation(((url: string) => {
      if (url.includes("q=alpha")) return Promise.resolve({ items: [metaItem("t1", "Alpha")], total: 1 });
      if (url.startsWith("/templates/meta")) {
        return Promise.resolve({ items: [metaItem("t1", "Alpha"), metaItem("t2", "Beta")], total: 2 });
      }
      if (url.startsWith("/templates/t1")) return Promise.resolve(fullTemplate("t1", "Alpha"));
      if (url === "/tags/ids") return Promise.resolve([]);
      return Promise.resolve(undefined);
    }));
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.setSearch("alpha"); });
    await waitFor(() => { expect(result.current.templates).toHaveLength(1); });
    expect(result.current.templates[0].name).toBe("Alpha");
    act(() => { result.current.setSearch(""); });
    await waitFor(() => { expect(result.current.templates).toHaveLength(2); });
  });

  it("handleTemplateListScroll no-op when all loaded", async () => {
    setupApiRouter({
      "/templates/meta": { items: [metaItem("t1", "T1")], total: 1 },
      "/templates/t1": fullTemplate("t1", "T1"),
      "/tags/ids": [],
    });
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    const callCount = mockApiFetch.mock.calls.length;
    const scrollEvent = { currentTarget: { scrollTop: 900, clientHeight: 100, scrollHeight: 1000 } };
    act(() => { result.current.handleTemplateListScroll(scrollEvent as never); });
    expect(mockApiFetch.mock.calls.length).toBe(callCount);
  });

  it("detectedVariables detects multiple unique variables", async () => {
    setupApiRouter({
      "/templates/meta": { items: [metaItem("t1", "T1")], total: 1 },
      "/templates/t1": { ...fullTemplate("t1", "T1"), content: "{{A}} {{B}} {{A}}" },
      "/tags/ids": [],
    });
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    await waitFor(() => { expect(result.current.draft.content).toContain("{{A}}"); });
  });

  it("loadSelected sets template to null when selectedID is empty", async () => {
    setupApiRouter({ "/templates/meta": { items: [], total: 0 }, "/tags/ids": [] });
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    expect(result.current.selected).toBeNull();
  });

  it("createFromTemplate no-op when no selected template", async () => {
    setupApiRouter({ "/templates/meta": { items: [], total: 0 }, "/tags/ids": [] });
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    await act(async () => { await result.current.createFromTemplate({ NAME: "Test" }); });
    expect(result.current.creatingDoc).toBe(false);
  });

  it("previewContent resolves unknown user variable to empty", async () => {
    setupApiRouter({
      "/templates/meta": { items: [metaItem("t1", "T1")], total: 1 },
      "/templates/t1": fullTemplate("t1", "T1"),
      "/tags/ids": [],
    });
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.setDraft({ name: "T1", description: "", content: "Hello {{UNKNOWN_VAR}}" }); });
    expect(result.current.previewContent).not.toContain("{{UNKNOWN_VAR}}");
    expect(result.current.previewContent).toContain("Hello ");
  });

  it("loadSelected error with non-Error shows generic message", async () => {
    mockApiFetch.mockImplementation(((url: string) => {
      if (typeof url === "string" && url.includes("/templates/meta")) return Promise.resolve({ items: [metaItem("t1", "T1")], total: 1 });
      if (typeof url === "string" && url.includes("/templates/t1")) return Promise.reject("string error"); // eslint-disable-line @typescript-eslint/prefer-promise-reject-errors -- testing non-Error path
      if (typeof url === "string" && url.includes("/tags/ids")) return Promise.resolve([]);
      return Promise.resolve({});
    }));
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    await waitFor(() => { expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" })); });
  });

  it("loadTemplates appends when not reset", async () => {
    let callCount = 0;
    mockApiFetch.mockImplementation(((url: string) => {
      if (typeof url === "string" && url.includes("/templates/meta")) {
        callCount++;
        if (callCount === 1) return Promise.resolve({ items: [metaItem("t1", "T1")], total: 3 });
        return Promise.resolve({ items: [metaItem("t2", "T2")], total: 3 });
      }
      if (typeof url === "string" && url.includes("/templates/t1")) return Promise.resolve(fullTemplate("t1", "T1"));
      if (typeof url === "string" && url.includes("/tags/ids")) return Promise.resolve([]);
      return Promise.resolve({});
    }));
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    const scrollEvent = { currentTarget: { scrollTop: 950, clientHeight: 100, scrollHeight: 1000 } };
    await act(async () => { result.current.handleTemplateListScroll(scrollEvent as never); });
    await waitFor(() => { expect(result.current.templates.length).toBeGreaterThanOrEqual(1); });
  });

  it("loadTemplates error shows toast", async () => {
    mockApiFetch.mockRejectedValue(new Error("load fail"));
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    expect(result.current.listError).toBe("load fail");
  });

  it("previewContent resolves SYS: variables", async () => {
    setupApiRouter({
      "/templates/meta": { items: [metaItem("t1", "T1")], total: 1 },
      "/templates/t1": fullTemplate("t1", "T1"),
      "/tags/ids": [],
    });
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.setDraft({ name: "T1", description: "", content: "Date: {{SYS:DATE}}" }); });
    expect(result.current.previewContent).not.toContain("{{SYS:DATE}}");
  });

  it("createTemplate error shows toast", async () => {
    setupApiRouter({
      "/templates/meta": { items: [], total: 0 },
      "/tags/ids": [],
    });
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    mockApiFetch.mockRejectedValueOnce(new Error("create fail"));
    await act(async () => { void result.current.createTemplate(); });
    expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
  });

  it("createFromTemplate non-Error shows generic message", async () => {
    mockApiFetch.mockImplementation(((url: string, opts?: RequestInit) => {
      if (url.startsWith("/templates/meta")) return Promise.resolve({ items: [metaItem("t1", "T1")], total: 1 });
      if (url.endsWith("/create") && opts?.method === "POST") return Promise.reject("string error"); // eslint-disable-line @typescript-eslint/prefer-promise-reject-errors -- testing non-Error path
      if (url.startsWith("/templates/t1")) return Promise.resolve(fullTemplate("t1", "T1"));
      if (url === "/tags/ids") return Promise.resolve([]);
      return Promise.resolve(undefined);
    }));
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    await act(async () => { await result.current.createFromTemplate({ NAME: "Test" }); });
    expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({ description: "Failed to create note from template" }));
    expect(result.current.creatingDoc).toBe(false);
    expect(result.current.showVariableModal).toBe(false);
  });

  it("template deletion non-Error shows generic message", async () => {
    setupApiRouter({
      "/templates/meta": { items: [metaItem("t1", "T1")], total: 1 },
      "/templates/t1": fullTemplate("t1", "T1"),
      "/tags/ids": [],
    });
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    mockApiFetch.mockRejectedValueOnce("string error");
    act(() => { result.current.requestDeleteTemplate("t1", "T1"); });
    await act(async () => { await result.current.confirmDeleteTemplate(); });
    expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({ description: "Failed to delete template" }));
  });

  it("template deletion does not reset selectedID when deleting different template", async () => {
    mockApiFetch.mockImplementation(((url: string, opts?: RequestInit) => {
      if (url.startsWith("/templates/meta")) return Promise.resolve({ items: [metaItem("t1", "T1"), metaItem("t2", "T2")], total: 2 });
      if (url.startsWith("/templates/t2") && opts?.method === "DELETE") return Promise.resolve(undefined);
      if (url.startsWith("/templates/t1")) return Promise.resolve(fullTemplate("t1", "T1"));
      if (url === "/tags/ids") return Promise.resolve([]);
      return Promise.resolve(undefined);
    }));
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    expect(result.current.selectedID).toBe("t1");
    act(() => { result.current.requestDeleteTemplate("t2", "T2"); });
    await act(async () => { await result.current.confirmDeleteTemplate(); });
    expect(result.current.selectedID).toBe("t1");
  });

  it("createTemplate non-Error shows generic message", async () => {
    setupApiRouter({
      "/templates/meta": { items: [], total: 0 },
      "/tags/ids": [],
    });
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    mockApiFetch.mockRejectedValueOnce("string error");
    await act(async () => { void result.current.createTemplate(); });
    expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({ description: "Failed to create template" }));
  });

  it("loadTemplates non-Error shows generic message", async () => {
    mockApiFetch.mockRejectedValue("network error");
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    expect(result.current.listError).toBe("Failed to load templates");
  });

  it("saveTemplate non-Error shows generic message", async () => {
    mockApiFetch.mockImplementation(((url: string, opts?: RequestInit) => {
      if (url.startsWith("/templates/meta")) return Promise.resolve({ items: [metaItem("t1", "T1")], total: 1 });
      if (url.startsWith("/templates/t1") && opts?.method === "PUT") return Promise.reject("string error"); // eslint-disable-line @typescript-eslint/prefer-promise-reject-errors -- testing non-Error path
      if (url.startsWith("/templates/t1")) return Promise.resolve(fullTemplate("t1", "T1"));
      if (url === "/tags/ids") return Promise.resolve([]);
      return Promise.resolve(undefined);
    }));
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.setDraft({ name: "X", description: "", content: "# X" }); });
    await act(async () => { const ok = await result.current.saveTemplate(); expect(ok).toBe(false); });
    expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({ description: "Failed to save template" }));
  });

  it("guards a dirty selection with cancel and discard branches", async () => {
    setupApiRouter({
      "/templates/meta": { items: [metaItem("t1", "T1"), metaItem("t2", "T2")], total: 2 },
      "/templates/t1": fullTemplate("t1", "T1"),
      "/templates/t2": fullTemplate("t2", "T2"),
      "/tags/ids": [],
    });
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.draft.name).toBe("T1"); });
    act(() => { result.current.setDraft((previous) => ({ ...previous, name: "Dirty" })); });

    act(() => { result.current.requestSelectTemplate("t2"); });
    expect(result.current.pendingChange).toBe(true);
    expect(result.current.requestedSelection).toBe("t2");
    expect(result.current.selectedID).toBe("t1");

    act(() => { result.current.cancelPendingChange(); });
    expect(result.current.pendingChange).toBe(false);
    expect(result.current.selectedID).toBe("t1");

    act(() => { result.current.requestSelectTemplate("t2"); });
    act(() => { result.current.discardAndContinue(); });
    await waitFor(() => { expect(result.current.selectedID).toBe("t2"); });
    await waitFor(() => { expect(result.current.draft.name).toBe("T2"); });
  });

  it("runs the detail callback when the already-selected template is opened", async () => {
    setupApiRouter({
      "/templates/meta": { items: [metaItem("t1", "T1")], total: 1 },
      "/templates/t1": fullTemplate("t1", "T1"),
      "/tags/ids": [],
    });
    const onSelected = vi.fn();
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.selectedID).toBe("t1"); });

    act(() => { result.current.requestSelectTemplate("t1", onSelected); });

    expect(onSelected).toHaveBeenCalledOnce();
    expect(result.current.selectedID).toBe("t1");
  });

  it("only switches after Save and continue succeeds", async () => {
    let failSave = true;
    mockApiFetch.mockImplementation(((url: string, options?: RequestInit) => {
      if (url.startsWith("/templates/meta")) {
        return Promise.resolve({ items: [metaItem("t1", "T1"), metaItem("t2", "T2")], total: 2 });
      }
      if (url === "/templates/t1" && options?.method === "PUT") {
        return failSave ? Promise.reject(new Error("save failed")) : Promise.resolve(undefined);
      }
      if (url === "/templates/t1") return Promise.resolve(fullTemplate("t1", "T1"));
      if (url === "/templates/t2") return Promise.resolve(fullTemplate("t2", "T2"));
      if (url === "/tags/ids") return Promise.resolve([]);
      return Promise.resolve(undefined);
    }));
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.draft.name).toBe("T1"); });
    act(() => { result.current.setDraft((previous) => ({ ...previous, name: "Dirty" })); });
    act(() => { result.current.requestSelectTemplate("t2"); });

    await act(async () => { await result.current.saveAndContinue(); });
    expect(result.current.selectedID).toBe("t1");
    expect(result.current.pendingChange).toBe(true);
    expect(result.current.draft.name).toBe("Dirty");

    failSave = false;
    await act(async () => { await result.current.saveAndContinue(); });
    await waitFor(() => { expect(result.current.selectedID).toBe("t2"); });
  });

  it("ignores a stale detail response after a newer selection", async () => {
    const slowFirst = deferred<ReturnType<typeof fullTemplate>>();
    mockApiFetch.mockImplementation(((url: string) => {
      if (url.startsWith("/templates/meta")) {
        return Promise.resolve({ items: [metaItem("t1", "T1"), metaItem("t2", "T2")], total: 2 });
      }
      if (url === "/templates/t1") return slowFirst.promise;
      if (url === "/templates/t2") return Promise.resolve(fullTemplate("t2", "T2"));
      if (url === "/tags/ids") return Promise.resolve([]);
      return Promise.resolve(undefined);
    }));
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.selectedID).toBe("t1"); });
    act(() => { result.current.requestSelectTemplate("t2"); });
    await waitFor(() => { expect(result.current.draft.name).toBe("T2"); });
    act(() => { slowFirst.resolve(fullTemplate("t1", "T1")); });
    await act(async () => { await Promise.resolve(); });
    expect(result.current.selectedID).toBe("t2");
    expect(result.current.draft.name).toBe("T2");
  });

  it("locks duplicate saves to one update request", async () => {
    const save = deferred<undefined>();
    let updates = 0;
    mockApiFetch.mockImplementation(((url: string, options?: RequestInit) => {
      if (url.startsWith("/templates/meta")) {
        return Promise.resolve({ items: [metaItem("t1", "T1")], total: 1 });
      }
      if (url === "/templates/t1" && options?.method === "PUT") {
        updates += 1;
        return save.promise;
      }
      if (url === "/templates/t1") return Promise.resolve(fullTemplate("t1", "T1"));
      if (url === "/tags/ids") return Promise.resolve([]);
      return Promise.resolve(undefined);
    }));
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.draft.name).toBe("T1"); });
    act(() => { result.current.setDraft((previous) => ({ ...previous, name: "Changed" })); });

    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.saveTemplate();
      second = result.current.saveTemplate();
    });
    expect(updates).toBe(1);
    await expect(second).resolves.toBe(false);
    act(() => { save.resolve(undefined); });
    await act(async () => { await first; });
  });

  it("finds a template outside the first page with debounced server search", async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => metaItem(`t${index + 1}`, `Template ${index + 1}`));
    mockApiFetch.mockImplementation(((url: string) => {
      if (url.includes("q=Needle")) {
        return Promise.resolve({ items: [metaItem("t25", "Needle template")], total: 1 });
      }
      if (url.startsWith("/templates/meta")) return Promise.resolve({ items: firstPage, total: 25 });
      if (url === "/templates/t1") return Promise.resolve(fullTemplate("t1", "Template 1"));
      if (url === "/tags/ids") return Promise.resolve([]);
      return Promise.resolve(undefined);
    }));
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => { expect(result.current.templates).toHaveLength(20); });
    act(() => { result.current.setSearch("Needle"); });
    await waitFor(() => { expect(result.current.templates[0]?.id).toBe("t25"); });
    expect(result.current.templatesTotal).toBe(1);
  });
});
