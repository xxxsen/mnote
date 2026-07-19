"use client";

import { CheckCircle2, Circle, Eye, Loader2, Plus } from "lucide-react";

import type { Todo } from "@/types";

import { MAX_PREVIEW_TODOS, dateKey, isSameDay } from "../utils";

type CalendarCellProps = {
  day: Date | null;
  dayIndex: number;
  todosByDate: (key: string) => Todo[];
  pendingToggleIDs: ReadonlySet<string>;
  onCreatePanel: (day: Date) => void;
  onDayView: (key: string) => void;
  onToggleDone: (todo: Todo) => Promise<void>;
  onEditPanel: (todo: Todo) => void;
};

export function CalendarCell({
  day,
  dayIndex,
  todosByDate,
  pendingToggleIDs,
  onCreatePanel,
  onDayView,
  onToggleDone,
  onEditPanel,
}: CalendarCellProps) {
  const rightBorderClass = (dayIndex + 1) % 7 === 0 ? "border-r-0" : "border-r";
  if (!day) {
    return (
      <div
        aria-hidden="true"
        className={`min-h-[188px] border-b border-border/40 ${rightBorderClass} bg-muted/20`}
      />
    );
  }

  const key = dateKey(day);
  const dayTodos = todosByDate(key);
  const previewTodos = dayTodos.slice(0, MAX_PREVIEW_TODOS);
  const hiddenCount = Math.max(0, dayTodos.length - previewTodos.length);
  const isToday = isSameDay(day, new Date());
  const label = day.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <section
      aria-label={label}
      className={`flex min-h-[188px] flex-col gap-1.5 border-b border-border/40 ${rightBorderClass} bg-card p-2`}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          className={`flex h-7 min-w-7 items-center justify-center rounded-md px-1 text-xs font-medium ${
            isToday ? "bg-primary text-primary-foreground" : "text-foreground"
          }`}
        >
          {day.getDate()}
        </span>
        <div className="flex items-center gap-0.5">
          {dayTodos.length > 0 ? (
            <button
              type="button"
              onClick={() => onDayView(key)}
              className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`View all todos for ${label}`}
            >
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden xl:inline">View</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onCreatePanel(day)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Add todo for ${label}`}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-hidden">
        {previewTodos.map((todo) => {
          const pending = pendingToggleIDs.has(todo.id);
          return (
            <div
              key={todo.id}
              className={`flex items-start gap-1 rounded-md border px-1 py-0.5 ${
                todo.done === 1
                  ? "border-transparent bg-muted/60"
                  : "border-border bg-background"
              }`}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={todo.done === 1}
                aria-label={todo.done === 1
                  ? `Mark ${todo.content} incomplete`
                  : `Mark ${todo.content} complete`}
                aria-busy={pending || undefined}
                disabled={pending}
                onClick={() => void onToggleDone(todo)}
                className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
              >
                {pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                ) : todo.done === 1 ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                ) : (
                  <Circle className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                aria-label={`Edit ${todo.content}`}
                onClick={() => onEditPanel(todo)}
                className={`min-h-7 min-w-0 flex-1 py-1 text-left text-xs leading-4 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  todo.done === 1 ? "text-muted-foreground line-through" : "text-foreground"
                }`}
                title={todo.content}
              >
                <span className="line-clamp-1">{todo.content}</span>
                <span className="block text-xs font-medium no-underline">
                  {todo.done === 1 ? "Completed" : "Open"}
                </span>
              </button>
            </div>
          );
        })}
      </div>
      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => onDayView(key)}
          className="min-h-7 rounded-md px-2 text-left text-xs font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          View {hiddenCount} more
        </button>
      ) : null}
    </section>
  );
}
