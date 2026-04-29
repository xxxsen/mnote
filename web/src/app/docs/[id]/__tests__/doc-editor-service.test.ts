import { describe, it, expect, vi, beforeEach } from "vitest";
import { docEditorService } from "../services/doc-editor.service";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api";
const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("docEditorService", () => {
  it("getDocument fetches with include=tags", async () => {
    mockApiFetch.mockResolvedValue({ id: "d1", title: "Test" });
    const result = await docEditorService.getDocument("d1");
    expect(mockApiFetch).toHaveBeenCalledWith("/documents/d1?include=tags");
    expect(result).toEqual({ id: "d1", title: "Test" });
  });

  it("saveDocument sends PUT with payload", async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await docEditorService.saveDocument("d1", { title: "New", content: "body" });
    expect(mockApiFetch).toHaveBeenCalledWith("/documents/d1", {
      method: "PUT",
      body: JSON.stringify({ title: "New", content: "body" }),
    });
  });

  it("deleteDocument sends DELETE", async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await docEditorService.deleteDocument("d1");
    expect(mockApiFetch).toHaveBeenCalledWith("/documents/d1", { method: "DELETE" });
  });

  it("listVersions fetches versions", async () => {
    mockApiFetch.mockResolvedValue([{ id: "v1", version: 1 }]);
    const result = await docEditorService.listVersions("d1");
    expect(mockApiFetch).toHaveBeenCalledWith("/documents/d1/versions");
    expect(result).toHaveLength(1);
  });

  it("createShare sends POST", async () => {
    mockApiFetch.mockResolvedValue({ id: "s1", token: "tok" });
    const result = await docEditorService.createShare("d1");
    expect(mockApiFetch).toHaveBeenCalledWith("/documents/d1/share", { method: "POST" });
    expect(result).toHaveProperty("token", "tok");
  });

  it("getShare fetches share info", async () => {
    mockApiFetch.mockResolvedValue({ share: null });
    const result = await docEditorService.getShare("d1");
    expect(mockApiFetch).toHaveBeenCalledWith("/documents/d1/share");
    expect(result).toEqual({ share: null });
  });

  it("updateShareConfig sends PUT with config", async () => {
    const cfg = { expires_at: 0, permission: "view" as const, allow_download: true };
    mockApiFetch.mockResolvedValue({ id: "s1" });
    await docEditorService.updateShareConfig("d1", cfg);
    expect(mockApiFetch).toHaveBeenCalledWith("/documents/d1/share", {
      method: "PUT",
      body: JSON.stringify(cfg),
    });
  });

  it("revokeShare sends DELETE", async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await docEditorService.revokeShare("d1");
    expect(mockApiFetch).toHaveBeenCalledWith("/documents/d1/share", { method: "DELETE" });
  });

  it("searchTags sends query params", async () => {
    mockApiFetch.mockResolvedValue([{ id: "t1", name: "go" }]);
    const result = await docEditorService.searchTags("go");
    expect(mockApiFetch).toHaveBeenCalledWith(expect.stringContaining("/tags?"));
    expect(mockApiFetch).toHaveBeenCalledWith(expect.stringContaining("q=go"));
    expect(result).toHaveLength(1);
  });

  it("saveTags sends PUT with tag IDs", async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await docEditorService.saveTags("d1", ["t1", "t2"]);
    expect(mockApiFetch).toHaveBeenCalledWith("/documents/d1/tags", {
      method: "PUT",
      body: JSON.stringify({ tag_ids: ["t1", "t2"] }),
    });
  });
});
