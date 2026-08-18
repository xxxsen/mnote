import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Todo } from "@/types";

import { CalendarCell } from "../components/CalendarCell";
import { MobileSchedule } from "../components/MobileSchedule";
import { CreateTodoModal, DayViewModal } from "../components/TodoModals";

afterEach(cleanup);

const todo: Todo = {
  id: "todo-1",
  user_id: "user-1",
  content: "A deliberately long task title that should remain readable without moving text",
  due_date: "2025-01-15",
  done: 0,
  ctime: 0,
  mtime: 0,
};

describe("todo responsive views", () => {
  it("uses independent native actions in a desktop calendar cell", () => {
    const onCreate = vi.fn();
    const onView = vi.fn();
    const onToggle = vi.fn().mockResolvedValue(undefined);
    const onEdit = vi.fn();

    render(
      <CalendarCell
        day={new Date(2025, 0, 15)}
        dayIndex={2}
        todosByDate={() => [
          todo,
          { ...todo, id: "todo-2", content: "Second task" },
          { ...todo, id: "todo-3", content: "Third task" },
          { ...todo, id: "todo-4", content: "Fourth task" },
        ]}
        pendingToggleIDs={new Set()}
        onCreatePanel={onCreate}
        onDayView={onView}
        onToggleDone={onToggle}
        onEditPanel={onEdit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Add todo for Wednesday, January 15/i }));
    fireEvent.click(screen.getByRole("button", { name: /View all todos for Wednesday, January 15/i }));
    fireEvent.click(screen.getAllByRole("checkbox", { name: /Mark .* complete/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${todo.content}` }));

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onView).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(todo);
    expect(onEdit).toHaveBeenCalledWith(todo);
    expect(screen.getByRole("button", { name: "View 1 more" })).toBeTruthy();
    expect(screen.queryByText(/^(Open|Completed)$/)).toBeNull();
  });

  it("prepares hover scrolling only when desktop todo content overflows", () => {
    render(
      <CalendarCell
        day={new Date(2025, 0, 15)}
        dayIndex={2}
        todosByDate={() => [todo, { ...todo, id: "todo-2", content: "Short task" }]}
        pendingToggleIDs={new Set()}
        onCreatePanel={vi.fn()}
        onDayView={vi.fn()}
        onToggleDone={vi.fn().mockResolvedValue(undefined)}
        onEditPanel={vi.fn()}
      />,
    );

    const longContent = screen.getByText(todo.content);
    const longViewport = longContent.parentElement as HTMLElement;
    Object.defineProperty(longViewport, "clientWidth", { value: 80 });
    Object.defineProperty(longContent, "scrollWidth", { value: 240 });
    fireEvent.mouseEnter(longContent.closest(".todo-calendar-item") as HTMLElement);

    expect(longViewport.dataset.scrollable).toBe("true");
    expect(longViewport.style.getPropertyValue("--todo-scroll-distance")).toBe("-160px");
    expect(longViewport.style.getPropertyValue("--todo-scroll-duration")).toBe("6.00s");

    const shortContent = screen.getByText("Short task");
    const shortViewport = shortContent.parentElement as HTMLElement;
    Object.defineProperty(shortViewport, "clientWidth", { value: 120 });
    Object.defineProperty(shortContent, "scrollWidth", { value: 80 });
    fireEvent.mouseEnter(shortContent.closest(".todo-calendar-item") as HTMLElement);

    expect(shortViewport.dataset.scrollable).toBe("false");
  });

  it("renders a complete mobile month schedule with discoverable day actions", () => {
    const onCreate = vi.fn();
    const onView = vi.fn();
    const onEdit = vi.fn();

    render(
      <MobileSchedule
        month={new Date(2025, 0, 1)}
        todosByDate={(key) => key === todo.due_date ? [todo] : []}
        pendingToggleIDs={new Set(["todo-1"])}
        onCreatePanel={onCreate}
        onDayView={onView}
        onToggleDone={vi.fn().mockResolvedValue(undefined)}
        onEditPanel={onEdit}
      />,
    );

    expect(screen.getAllByRole("button", { name: "Add task" })).toHaveLength(31);
    expect(screen.getByRole("button", { name: "Details" })).toBeTruthy();
    expect(screen.getByRole("button", { name: `Edit ${todo.content}` })).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>("checkbox", { name: /Mark .* complete/i }).disabled).toBe(true);
    expect(screen.queryByText(/^(Open|Completed)$/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    fireEvent.click(screen.getByRole("button", { name: `Edit ${todo.content}` }));
    expect(onView).toHaveBeenCalledWith("2025-01-15");
    expect(onEdit).toHaveBeenCalledWith(todo);
  });

  it("opens a todo from the day view without a redundant status action", () => {
    const onEdit = vi.fn();

    render(
      <DayViewModal
        dayViewDate={todo.due_date}
        dayViewTodos={[todo]}
        pendingToggleIDs={new Set()}
        onClose={vi.fn()}
        onToggleDone={vi.fn()}
        onEdit={onEdit}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.queryByText(/^(Open|Completed)$/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: `Edit ${todo.content}` }));
    expect(onEdit).toHaveBeenCalledWith(todo);
  });

  it("allows changing the due date before creating a todo", () => {
    const setSelectedDate = vi.fn();
    render(
      <CreateTodoModal
        selectedDate="2025-01-15"
        setSelectedDate={setSelectedDate}
        newTodoContent="Prepare release"
        setNewTodoContent={vi.fn()}
        creating={false}
        onClose={vi.fn()}
        onCreate={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Due date"), {
      target: { value: "2025-01-20" },
    });

    expect(setSelectedDate).toHaveBeenCalledWith("2025-01-20");
    expect(screen.getByRole("button", { name: "Add todo" })).toBeTruthy();
  });
});
