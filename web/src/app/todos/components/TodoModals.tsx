"use client";

import { Todo } from "@/types";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, X } from "lucide-react";

interface DayViewModalProps {
  dayViewDate: string;
  dayViewTodos: Todo[];
  onClose: () => void;
  onToggleDone: (todo: Todo) => void;
  onEdit: (todo: Todo) => void;
}

export function DayViewModal({ dayViewDate, dayViewTodos, onClose, onToggleDone, onEdit }: DayViewModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-border bg-background p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Day Todos</div>
            <div className="text-sm font-semibold">{dayViewDate}</div>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[420px] overflow-y-auto pr-1 space-y-2">
          {dayViewTodos.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
              No todos for this day
            </div>
          ) : (
            dayViewTodos.map((todo) => (
              <div
                key={`day-view-${todo.id}`}
                className={`group/todo rounded-lg border px-3 py-2 flex items-start gap-2 ${todo.done === 1 ? "bg-muted/40 border-transparent opacity-80" : "bg-background border-border"}`}
              >
                <button
                  onClick={() => void onToggleDone(todo)}
                  className="mt-0.5 shrink-0 text-muted-foreground hover:text-indigo-500 transition-colors"
                >
                  {todo.done === 1 ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Circle className="h-4 w-4" />
                  )}
                </button>

                <button
                  onClick={() => onEdit(todo)}
                  className={`flex-1 min-w-0 text-left text-sm ${todo.done === 1 ? "line-through text-muted-foreground" : "text-foreground"}`}
                  title={`完整内容: ${todo.content}`}
                >
                  {todo.content.length > 26 ? (
                    <span className="block overflow-hidden whitespace-nowrap">
                      <span className="inline-block max-w-none group-hover/todo:animate-[todo-marquee_6s_linear_infinite]">
                        {todo.content}
                      </span>
                    </span>
                  ) : (
                    <span className="block truncate">{todo.content}</span>
                  )}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

interface CreateTodoModalProps {
  selectedDate: string;
  newTodoContent: string;
  setNewTodoContent: (val: string) => void;
  creating: boolean;
  onClose: () => void;
  onCreate: () => void;
}

export function CreateTodoModal({ selectedDate, newTodoContent, setNewTodoContent, creating, onClose, onCreate }: CreateTodoModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">New Todo</div>
            <div className="text-sm font-semibold">{selectedDate}</div>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Todo Content</label>
            <textarea
              rows={3}
              maxLength={500}
              className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="What needs to be done?"
              value={newTodoContent}
              onChange={(e) => setNewTodoContent(e.target.value)}
            />
            <div className="text-[10px] text-muted-foreground text-right mt-1">{newTodoContent.length}/500</div>
          </div>

          <div className="pt-1 flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={onCreate}
              isLoading={creating}
              disabled={newTodoContent.trim().length === 0}
            >
              Add Todo
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface EditTodoModalProps {
  editingTodoDueDate: string;
  editTodoContent: string;
  setEditTodoContent: (val: string) => void;
  updating: boolean;
  onClose: () => void;
  onSave: () => void;
}

export function EditTodoModal({ editingTodoDueDate, editTodoContent, setEditTodoContent, updating, onClose, onSave }: EditTodoModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Edit Todo</div>
            <div className="text-sm font-semibold">{editingTodoDueDate}</div>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Todo Content</label>
            <textarea
              rows={3}
              maxLength={500}
              className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Update todo content"
              value={editTodoContent}
              onChange={(e) => setEditTodoContent(e.target.value)}
            />
            <div className="text-[10px] text-muted-foreground text-right mt-1">{editTodoContent.length}/500</div>
          </div>

          <div className="pt-1 flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={onSave}
              isLoading={updating}
              disabled={editTodoContent.trim().length === 0}
            >
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
