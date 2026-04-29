import { describe, it, expect, vi, beforeEach } from "vitest";
import { todoService } from "../todo.service";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api";
const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("todoService", () => {
  it("create calls POST with correct body", async () => {
    mockApiFetch.mockResolvedValue({ id: "1", content: "task", due_date: "2025-01-01", done: 0 });
    const result = await todoService.create("task", "2025-01-01");
    expect(mockApiFetch).toHaveBeenCalledWith("/todos", {
      method: "POST",
      body: JSON.stringify({ content: "task", due_date: "2025-01-01", done: false }),
    });
    expect(result).toEqual({ id: "1", content: "task", due_date: "2025-01-01", done: 0 });
  });

  it("create passes done=true", async () => {
    mockApiFetch.mockResolvedValue({ id: "2" });
    await todoService.create("done task", "2025-06-01", true);
    expect(mockApiFetch).toHaveBeenCalledWith("/todos", {
      method: "POST",
      body: JSON.stringify({ content: "done task", due_date: "2025-06-01", done: true }),
    });
  });

  it("listByDateRange calls GET with date params", async () => {
    mockApiFetch.mockResolvedValue([]);
    const result = await todoService.listByDateRange("2025-01-01", "2025-01-31");
    expect(mockApiFetch).toHaveBeenCalledWith("/todos?start=2025-01-01&end=2025-01-31");
    expect(result).toEqual([]);
  });

  it("toggleDone calls PUT", async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await todoService.toggleDone("id1", true);
    expect(mockApiFetch).toHaveBeenCalledWith("/todos/id1/done", {
      method: "PUT",
      body: JSON.stringify({ done: true }),
    });
  });

  it("updateContent calls PUT", async () => {
    mockApiFetch.mockResolvedValue({ id: "id1", content: "updated" });
    const result = await todoService.updateContent("id1", "updated");
    expect(mockApiFetch).toHaveBeenCalledWith("/todos/id1", {
      method: "PUT",
      body: JSON.stringify({ content: "updated" }),
    });
    expect(result).toHaveProperty("content", "updated");
  });

  it("delete calls DELETE", async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await todoService.delete("id1");
    expect(mockApiFetch).toHaveBeenCalledWith("/todos/id1", { method: "DELETE" });
  });
});
