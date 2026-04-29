"use client";

import { CheckCircle2, Circle, Eye } from "lucide-react";
import type { Todo } from "@/types";
import { MAX_PREVIEW_TODOS, dateKey, isSameDay, monthKey } from "../utils";

export function CalendarCell({ day, dayIndex, month, todosByDate, onCreatePanel, onDayView, onToggleDone, onEditPanel }: {
  day: Date | null; dayIndex: number; month: Date;
  todosByDate: (key: string) => Todo[]; onCreatePanel: (d: Date) => void;
  onDayView: (key: string) => void; onToggleDone: (t: Todo) => Promise<void>; onEditPanel: (t: Todo) => void;
}) {
  const rightBorderClass = (dayIndex + 1) % 7 === 0 ? "border-r-0" : "border-r";
  if (!day) return <div key={`${monthKey(month)}-empty-${dayIndex}`} className={`min-h-[188px] border-b border-border/40 ${rightBorderClass} bg-muted/5`} />;

  const key = dateKey(day);
  const dayTodos = todosByDate(key);
  const previewTodos = dayTodos.slice(0, MAX_PREVIEW_TODOS);
  const hiddenCount = Math.max(0, dayTodos.length - previewTodos.length);
  const isToday = isSameDay(day, new Date());

  return (
    <div onClick={() => onCreatePanel(day)}
      className={`group min-h-[188px] border-b border-border/40 ${rightBorderClass} p-2 flex flex-col gap-2 transition-colors cursor-pointer bg-card hover:bg-muted/10`}>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${isToday ? "bg-indigo-500 text-white" : "text-foreground"}`}>{day.getDate()}</span>
        <button onClick={(evt) => { evt.stopPropagation(); onDayView(key); }}
          className="h-6 w-6 inline-flex items-center justify-center text-muted-foreground opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto hover:text-indigo-500 transition-colors"
          title="View all todos" aria-label="View all todos"><Eye className="h-3.5 w-3.5" /></button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <div className="space-y-1 pr-0.5">
          {previewTodos.map((todo) => (
            <div key={todo.id} onClick={(evt) => evt.stopPropagation()}
              className={`group/todo text-xs rounded border px-2 py-1.5 flex items-start gap-1.5 transition-colors ${todo.done === 1 ? "bg-muted/50 border-transparent opacity-70" : "bg-background border-border hover:border-indigo-400/60"}`}>
              <button onClick={(evt) => { evt.stopPropagation(); void onToggleDone(todo); }}
                className="mt-0.5 shrink-0 text-muted-foreground hover:text-indigo-500 transition-colors">
                {todo.done === 1 ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Circle className="h-3.5 w-3.5" />}
              </button>
              <button onClick={(evt) => { evt.stopPropagation(); onEditPanel(todo); }}
                className={`flex-1 min-w-0 text-left ${todo.done === 1 ? "line-through text-muted-foreground" : "text-foreground"}`}
                title={`完整内容: ${todo.content}`}>
                {todo.content.length > 18 ? (
                  <span className="block overflow-hidden whitespace-nowrap"><span className="inline-block max-w-none group-hover/todo:animate-[todo-marquee_6s_linear_infinite]">{todo.content}</span></span>
                ) : (<span className="block truncate">{todo.content}</span>)}
              </button>
            </div>
          ))}
        </div>
        {hiddenCount > 0 && (
          <div onClick={(evt) => { evt.stopPropagation(); onDayView(key); }}
            className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card via-card/80 to-transparent flex items-end justify-center pb-1.5 text-[10px] text-muted-foreground">
            <span>{hiddenCount} more todos</span>
          </div>
        )}
      </div>
    </div>
  );
}
