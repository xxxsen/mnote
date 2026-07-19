import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Todo } from "@/types";

import { CalendarCell } from "../components/CalendarCell";
import { MobileSchedule } from "../components/MobileSchedule";
import { CreateTodoModal } from "../components/TodoModals";

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
    expect(document.body.innerHTML).not.toContain("todo-marquee");
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

    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    fireEvent.click(screen.getByRole("button", { name: `Edit ${todo.content}` }));
    expect(onView).toHaveBeenCalledWith("2025-01-15");
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
