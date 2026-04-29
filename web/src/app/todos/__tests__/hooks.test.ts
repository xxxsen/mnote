import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn(), getAuthToken: vi.fn().mockReturnValue("tok") }));
vi.mock("@/lib/todo.service", () => ({
  todoService: {
    create: vi.fn(),
    listByDateRange: vi.fn(),
    toggleDone: vi.fn(),
    updateContent: vi.fn(),
    delete: vi.fn(),
  },
}));
const stableToast = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: stableToast }),
}));
const stablePush = vi.fn();
const stableReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: stablePush, replace: stableReplace }),
}));

import { todoService } from "@/lib/todo.service";
import { useTodoCalendar } from "../hooks/useTodoCalendar";
import type { Todo } from "@/types";

const mockTodoService = vi.mocked(todoService);

beforeEach(() => { vi.clearAllMocks(); });

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: "t1", content: "Task", due_date: "2025-01-15", done: 0,
  ctime: 0, mtime: 0, user_id: "u1",
  ...overrides,
});

describe("useTodoCalendar", () => {
  it("initializes with current month and months array", () => {
    mockTodoService.listByDateRange.mockResolvedValue([]);
    const { result } = renderHook(() => useTodoCalendar());
    expect(result.current.months.length).toBeGreaterThan(0);
    expect(result.current.loading).toBe(true);
  });

  it("fetches todos on mount", async () => {
    mockTodoService.listByDateRange.mockResolvedValue([makeTodo()]);
    const { result } = renderHook(() => useTodoCalendar());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    expect(mockTodoService.listByDateRange).toHaveBeenCalled();
  });

  it("handleCreateTodo creates a todo", async () => {
    mockTodoService.listByDateRange.mockResolvedValue([]);
    mockTodoService.create.mockResolvedValue(makeTodo({ id: "new1", content: "New" }));
    const { result } = renderHook(() => useTodoCalendar());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.openCreatePanel(new Date(2025, 0, 15)); });
    expect(result.current.createOpen).toBe(true);
    act(() => { result.current.setNewTodoContent("New"); });
    await act(async () => { await result.current.handleCreateTodo(); });
    expect(mockTodoService.create).toHaveBeenCalledWith("New", "2025-01-15", false);
  });

  it("handleToggleDone toggles done state", async () => {
    const todo = makeTodo();
    mockTodoService.listByDateRange.mockResolvedValue([todo]);
    mockTodoService.toggleDone.mockResolvedValue(undefined);
    const { result } = renderHook(() => useTodoCalendar());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    await act(async () => { await result.current.handleToggleDone(todo); });
    expect(mockTodoService.toggleDone).toHaveBeenCalledWith("t1", true);
  });

  it("handleUpdateTodoContent updates content", async () => {
    const todo = makeTodo();
    mockTodoService.listByDateRange.mockResolvedValue([todo]);
    mockTodoService.updateContent.mockResolvedValue({ ...todo, content: "Updated", mtime: 1 });
    const { result } = renderHook(() => useTodoCalendar());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.openEditPanel(todo); });
    expect(result.current.editOpen).toBe(true);
    act(() => { result.current.setEditTodoContent("Updated"); });
    await act(async () => { await result.current.handleUpdateTodoContent(); });
    expect(mockTodoService.updateContent).toHaveBeenCalledWith("t1", "Updated");
  });

  it("closeCreatePanel closes create dialog", async () => {
    mockTodoService.listByDateRange.mockResolvedValue([]);
    const { result } = renderHook(() => useTodoCalendar());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.openCreatePanel(new Date(2025, 0, 1)); });
    expect(result.current.createOpen).toBe(true);
    act(() => { result.current.closeCreatePanel(); });
    expect(result.current.createOpen).toBe(false);
  });

  it("openDayView and closeDayView work", async () => {
    mockTodoService.listByDateRange.mockResolvedValue([]);
    const { result } = renderHook(() => useTodoCalendar());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.openDayView("2025-01-15"); });
    expect(result.current.dayViewOpen).toBe(true);
    expect(result.current.dayViewDate).toBe("2025-01-15");
    act(() => { result.current.closeDayView(); });
    expect(result.current.dayViewOpen).toBe(false);
  });

  it("visibleMonth is a date", () => {
    mockTodoService.listByDateRange.mockResolvedValue([]);
    const { result } = renderHook(() => useTodoCalendar());
    expect(result.current.visibleMonth).toBeInstanceOf(Date);
  });
});
