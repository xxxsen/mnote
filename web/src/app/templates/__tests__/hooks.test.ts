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
});
