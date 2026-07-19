"use client";

import { CheckCircle2, Circle, Eye, Loader2, Plus } from "lucide-react";

import type { Todo } from "@/types";

import { buildMonthCells, dateKey, isSameDay } from "../utils";

type MobileScheduleProps = {
  month: Date;
  todosByDate: (key: string) => Todo[];
  pendingToggleIDs: ReadonlySet<string>;
  onCreatePanel: (day: Date) => void;
  onDayView: (key: string) => void;
  onToggleDone: (todo: Todo) => Promise<void>;
  onEditPanel: (todo: Todo) => void;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

export function MobileSchedule({
  month,
  todosByDate,
  pendingToggleIDs,
  onCreatePanel,
  onDayView,
  onToggleDone,
  onEditPanel,
}: MobileScheduleProps) {
  const days = buildMonthCells(month).filter((day): day is Date => day !== null);

  return (
    <div className="divide-y divide-border" aria-label="Monthly schedule">
      {days.map((day) => {
        const key = dateKey(day);
        const todos = todosByDate(key);
        const today = isSameDay(day, new Date());

        return (
          <section key={key} aria-labelledby={`schedule-${key}`} className="px-4 py-4">
            <div className="flex min-h-11 items-center justify-between gap-3">
              <h2
                id={`schedule-${key}`}
                className={`text-sm font-semibold ${today ? "text-primary" : "text-foreground"}`}
              >
                {dateFormatter.format(day)}
                {today ? <span className="ml-2 text-xs font-medium text-primary">Today</span> : null}
              </h2>
              <div className="flex items-center gap-1">
                {todos.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => onDayView(key)}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Eye className="h-4 w-4" aria-hidden="true" />
                    Details
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onCreatePanel(day)}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add task
                </button>
              </div>
            </div>
            {todos.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {todos.map((todo) => {
                  const pending = pendingToggleIDs.has(todo.id);
                  return (
                    <li
                      key={todo.id}
                      className={`flex items-start gap-2 rounded-md border p-2 ${
                        todo.done === 1
                          ? "border-transparent bg-muted/60"
                          : "border-border bg-card"
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
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
                      >
                        {pending ? (
                          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                        ) : todo.done === 1 ? (
                          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                        ) : (
                          <Circle className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                      <button
                        type="button"
                        aria-label={`Edit ${todo.content}`}
                        onClick={() => onEditPanel(todo)}
                        className={`min-h-11 min-w-0 flex-1 py-1 text-left text-sm leading-5 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          todo.done === 1 ? "text-muted-foreground line-through" : "text-foreground"
                        }`}
                        title={todo.content}
                      >
                        <span className="line-clamp-2">{todo.content}</span>
                        <span className="mt-1 block text-xs font-medium no-underline">
                          {todo.done === 1 ? "Completed" : "Open"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
