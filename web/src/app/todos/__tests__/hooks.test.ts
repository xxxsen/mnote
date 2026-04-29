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

  it("handleCreateTodo shows error when content empty", async () => {
    mockTodoService.listByDateRange.mockResolvedValue([]);
    const { result } = renderHook(() => useTodoCalendar());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.openCreatePanel(new Date(2025, 0, 15)); });
    act(() => { result.current.setNewTodoContent(""); });
    await act(async () => { await result.current.handleCreateTodo(); });
    expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
  });

  it("handleCreateTodo error shows toast", async () => {
    mockTodoService.listByDateRange.mockResolvedValue([]);
    mockTodoService.create.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useTodoCalendar());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.openCreatePanel(new Date(2025, 0, 15)); });
    act(() => { result.current.setNewTodoContent("Task"); });
    await act(async () => { await result.current.handleCreateTodo(); });
    expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
  });

  it("handleToggleDone error shows toast", async () => {
    mockTodoService.listByDateRange.mockResolvedValue([makeTodo()]);
    mockTodoService.toggleDone.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useTodoCalendar());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    await act(async () => { await result.current.handleToggleDone(makeTodo()); });
    expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
  });

  it("handleUpdateTodoContent error shows toast", async () => {
    mockTodoService.listByDateRange.mockResolvedValue([makeTodo()]);
    mockTodoService.updateContent.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useTodoCalendar());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.openEditPanel(makeTodo()); });
    act(() => { result.current.setEditTodoContent("Updated"); });
    await act(async () => { await result.current.handleUpdateTodoContent(); });
    expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
  });

  it("handleUpdateTodoContent empty content shows error", async () => {
    mockTodoService.listByDateRange.mockResolvedValue([makeTodo()]);
    const { result } = renderHook(() => useTodoCalendar());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.openEditPanel(makeTodo()); });
    act(() => { result.current.setEditTodoContent("  "); });
    await act(async () => { await result.current.handleUpdateTodoContent(); });
    expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
  });

  it("Escape key closes create panel", async () => {
    mockTodoService.listByDateRange.mockResolvedValue([]);
    const { result } = renderHook(() => useTodoCalendar());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.openCreatePanel(new Date(2025, 0, 1)); });
    expect(result.current.createOpen).toBe(true);
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(result.current.createOpen).toBe(false);
  });

  it("Escape key closes day view", async () => {
    mockTodoService.listByDateRange.mockResolvedValue([]);
    const { result } = renderHook(() => useTodoCalendar());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.openDayView("2025-01-15"); });
    expect(result.current.dayViewOpen).toBe(true);
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(result.current.dayViewOpen).toBe(false);
  });

  it("closeEditPanel closes edit dialog", async () => {
    mockTodoService.listByDateRange.mockResolvedValue([makeTodo()]);
    const { result } = renderHook(() => useTodoCalendar());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.openEditPanel(makeTodo()); });
    expect(result.current.editOpen).toBe(true);
    act(() => { result.current.closeEditPanel(); });
    expect(result.current.editOpen).toBe(false);
  });

  it("todosByDate returns todos for a given date", async () => {
    mockTodoService.listByDateRange.mockResolvedValue([makeTodo({ due_date: "2025-01-15" })]);
    const { result } = renderHook(() => useTodoCalendar());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    const todos = result.current.todosByDate("2025-01-15");
    expect(todos).toHaveLength(1);
  });

  it("todosByDate returns empty for date with no todos", async () => {
    mockTodoService.listByDateRange.mockResolvedValue([makeTodo({ due_date: "2025-01-15" })]);
    const { result } = renderHook(() => useTodoCalendar());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    const todos = result.current.todosByDate("2025-01-20");
    expect(todos).toHaveLength(0);
  });

  it("handleCalendarScroll updates visibleMonth from nearest section", async () => {
    mockTodoService.listByDateRange.mockResolvedValue([]);
    const { result } = renderHook(() => useTodoCalendar());
    await waitFor(() => { expect(result.current.loading).toBe(false); });

    const section = document.createElement("div");
    section.setAttribute("data-month-index", "0");
    Object.defineProperty(section, "offsetTop", { value: 0 });
    Object.defineProperty(section, "offsetHeight", { value: 200 });

    const container = document.createElement("div");
    container.appendChild(section);
    Object.defineProperty(container, "scrollTop", { value: 0, writable: true });
    Object.defineProperty(container, "clientHeight", { value: 600 });
    Object.defineProperty(container, "scrollHeight", { value: 2000 });

    const event = { currentTarget: container } as unknown as React.UIEvent<HTMLDivElement>;
    act(() => { result.current.handleCalendarScroll(event); });
  });

  it("handleCalendarScroll prepends months when near top", async () => {
    mockTodoService.listByDateRange.mockResolvedValue([]);
    const { result } = renderHook(() => useTodoCalendar());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    const initialCount = result.current.months.length;

    const section = document.createElement("div");
    section.setAttribute("data-month-index", "0");
    Object.defineProperty(section, "offsetTop", { value: 0 });
    Object.defineProperty(section, "offsetHeight", { value: 200 });

    const container = document.createElement("div");
    container.appendChild(section);
    Object.defineProperty(container, "scrollTop", { value: 10, writable: true });
    Object.defineProperty(container, "clientHeight", { value: 600 });
    Object.defineProperty(container, "scrollHeight", { value: 3000 });

    const event = { currentTarget: container } as unknown as React.UIEvent<HTMLDivElement>;
    act(() => { result.current.handleCalendarScroll(event); });
    expect(result.current.months.length).toBeGreaterThan(initialCount);
  });

  it("handleCalendarScroll appends months when near bottom", async () => {
    mockTodoService.listByDateRange.mockResolvedValue([]);
    const { result } = renderHook(() => useTodoCalendar());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    const initialCount = result.current.months.length;

    const section = document.createElement("div");
    section.setAttribute("data-month-index", "0");
    Object.defineProperty(section, "offsetTop", { value: 0 });
    Object.defineProperty(section, "offsetHeight", { value: 200 });

    const container = document.createElement("div");
    container.appendChild(section);
    Object.defineProperty(container, "scrollTop", { value: 2700, writable: true });
    Object.defineProperty(container, "clientHeight", { value: 600 });
    Object.defineProperty(container, "scrollHeight", { value: 3000 });

    const event = { currentTarget: container } as unknown as React.UIEvent<HTMLDivElement>;
    act(() => { result.current.handleCalendarScroll(event); });
    expect(result.current.months.length).toBeGreaterThan(initialCount);
  });

  it("handleCalendarScroll no-op when no sections", async () => {
    mockTodoService.listByDateRange.mockResolvedValue([]);
    const { result } = renderHook(() => useTodoCalendar());
    await waitFor(() => { expect(result.current.loading).toBe(false); });

    const container = document.createElement("div");
    Object.defineProperty(container, "scrollTop", { value: 100, writable: true });
    Object.defineProperty(container, "clientHeight", { value: 600 });
    Object.defineProperty(container, "scrollHeight", { value: 2000 });
    const event = { currentTarget: container } as unknown as React.UIEvent<HTMLDivElement>;
    act(() => { result.current.handleCalendarScroll(event); });
  });

  it("dayViewTodos returns todos for day view date", async () => {
    mockTodoService.listByDateRange.mockResolvedValue([makeTodo({ due_date: "2025-01-15" })]);
    const { result } = renderHook(() => useTodoCalendar());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.openDayView("2025-01-15"); });
    expect(result.current.dayViewTodos).toHaveLength(1);
  });

  it("Escape key closes edit panel", async () => {
    mockTodoService.listByDateRange.mockResolvedValue([makeTodo()]);
    const { result } = renderHook(() => useTodoCalendar());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.openEditPanel(makeTodo()); });
    expect(result.current.editOpen).toBe(true);
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(result.current.editOpen).toBe(false);
  });

  it("handleCreateTodo shows error when no date selected", async () => {
    mockTodoService.listByDateRange.mockResolvedValue([]);
    const { result } = renderHook(() => useTodoCalendar());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.setNewTodoContent("Task"); });
    await act(async () => { await result.current.handleCreateTodo(); });
    expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
  });

  it("multiple todos on same date are grouped", async () => {
    mockTodoService.listByDateRange.mockResolvedValue([
      makeTodo({ id: "t1", due_date: "2025-01-15" }),
      makeTodo({ id: "t2", due_date: "2025-01-15" }),
    ]);
    const { result } = renderHook(() => useTodoCalendar());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    expect(result.current.todosByDate("2025-01-15")).toHaveLength(2);
  });

  it("todos without due_date are not in todosByDate", async () => {
    mockTodoService.listByDateRange.mockResolvedValue([makeTodo({ due_date: "" })]);
    const { result } = renderHook(() => useTodoCalendar());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    expect(result.current.todosByDate("")).toHaveLength(0);
  });
});
