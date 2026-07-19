"use client";

import { useRef, useState } from "react";
import type { Todo } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogStatus,
} from "@/components/ui/dialog";
import { CheckCircle2, Circle, Loader2, Trash2 } from "lucide-react";

function scrollFieldIntoView(element: HTMLElement) {
  const scrollIntoView = Reflect.get(element, "scrollIntoView") as unknown;
  if (typeof scrollIntoView === "function") {
    scrollIntoView.call(element, { block: "nearest" });
  }
}

interface DayViewModalProps {
  dayViewDate: string;
  dayViewTodos: Todo[];
  onClose: () => void;
  onToggleDone: (todo: Todo) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
  pendingToggleIDs: ReadonlySet<string>;
}

export function DayViewModal({
  dayViewDate,
  dayViewTodos,
  onClose,
  onToggleDone,
  onEdit,
  onDelete,
  pendingToggleIDs,
}: DayViewModalProps) {
  return (
    <Dialog
      open
      title={`Todos for ${dayViewDate}`}
      description="Review, complete, or edit todos scheduled for this day."
      variant="modal"
      size="md"
      onClose={onClose}
    >
      <DialogHeader />
      <DialogBody>
        <div className="space-y-2">
          {dayViewTodos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
              No todos for this day
            </div>
          ) : (
            dayViewTodos.map((todo) => (
              <div
                key={`day-view-${todo.id}`}
                className={`flex items-start gap-2 rounded-md border px-2 py-2 ${
                  todo.done === 1
                    ? "border-transparent bg-muted/40 opacity-80"
                    : "border-border bg-background"
                }`}
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={todo.done === 1}
                  aria-label={todo.done === 1 ? `Mark ${todo.content} incomplete` : `Mark ${todo.content} complete`}
                  aria-busy={pendingToggleIDs.has(todo.id) || undefined}
                  disabled={pendingToggleIDs.has(todo.id)}
                  onClick={() => onToggleDone(todo)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
                >
                  {pendingToggleIDs.has(todo.id) ? (
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
                  onClick={() => onEdit(todo)}
                  className={`min-h-11 min-w-0 flex-1 py-1.5 text-left text-sm leading-5 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    todo.done === 1
                      ? "text-muted-foreground line-through"
                      : "text-foreground"
                  }`}
                  title={todo.content}
                >
                  <span className="line-clamp-2">{todo.content}</span>
                  <span className="mt-1 block text-xs font-medium no-underline">
                    {todo.done === 1 ? "Completed" : "Open"}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${todo.content}`}
                  onClick={() => onDelete(todo)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))
          )}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button className="h-11 w-full sm:w-auto" onClick={onClose}>Close</Button>
      </DialogFooter>
    </Dialog>
  );
}

interface CreateTodoModalProps {
  selectedDate: string;
  setSelectedDate: (value: string) => void;
  newTodoContent: string;
  setNewTodoContent: (value: string) => void;
  creating: boolean;
  onClose: () => void;
  onCreate: () => void | Promise<void>;
}

export function CreateTodoModal({
  selectedDate,
  setSelectedDate,
  newTodoContent,
  setNewTodoContent,
  creating,
  onClose,
  onCreate,
}: CreateTodoModalProps) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const actionRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initialDateRef = useRef(selectedDate);
  const hasContent = newTodoContent.trim().length > 0;
  const dirty = hasContent || selectedDate !== initialDateRef.current;
  const requestClose = () => {
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };
  const submit = async () => {
    if (actionRef.current || creating || !hasContent || !selectedDate) return;
    actionRef.current = true;
    try {
      await onCreate();
    } finally {
      actionRef.current = false;
    }
  };

  return (
    <Dialog
      open
      title={confirmDiscard ? "Discard new todo?" : "New todo"}
      description={confirmDiscard
        ? "The todo text has not been saved."
        : `Add a todo scheduled for ${selectedDate}.`}
      variant="modal"
      size="md"
      dismissPolicy="when-idle"
      busy={creating}
      initialFocusRef={textareaRef}
      onClose={requestClose}
    >
      <DialogHeader showClose={!confirmDiscard} />
      {confirmDiscard ? (
        <>
          <DialogBody>
            <DialogStatus variant="info">
              Discarding will permanently remove the text entered in this dialog.
            </DialogStatus>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              className="h-11 w-full sm:w-auto"
              onClick={() => setConfirmDiscard(false)}
            >
              Keep editing
            </Button>
            <Button
              variant="destructive"
              className="h-11 w-full sm:w-auto"
              onClick={onClose}
            >
              Discard
            </Button>
          </DialogFooter>
        </>
      ) : (
        <>
          <DialogBody>
            <label htmlFor="new-todo-date" className="mb-2 block text-sm font-medium text-foreground">
              Due date
            </label>
            <input
              id="new-todo-date"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="mb-4 h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-10"
            />
            <label htmlFor="new-todo-content" className="mb-2 block text-sm font-medium text-foreground">
              Todo content
            </label>
            <textarea
              ref={textareaRef}
              id="new-todo-content"
              rows={4}
              maxLength={500}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="What needs to be done?"
              value={newTodoContent}
              onFocus={(event) => scrollFieldIntoView(event.currentTarget)}
              onChange={(event) => setNewTodoContent(event.target.value)}
            />
            <div className="mt-1 text-right text-xs text-muted-foreground">
              {newTodoContent.length}/500
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              className="h-11 w-full sm:w-auto"
              onClick={requestClose}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              className="h-11 w-full sm:w-auto"
              onClick={() => void submit()}
              isLoading={creating}
              disabled={!hasContent || !selectedDate}
            >
              {creating ? "Adding todo" : "Add todo"}
            </Button>
          </DialogFooter>
        </>
      )}
    </Dialog>
  );
}

interface EditTodoModalProps {
  editingTodoDueDate: string;
  editTodoContent: string;
  setEditTodoContent: (value: string) => void;
  updating: boolean;
  onClose: () => void;
  onSave: () => void | Promise<void>;
}

export function EditTodoModal({
  editingTodoDueDate,
  editTodoContent,
  setEditTodoContent,
  updating,
  onClose,
  onSave,
}: EditTodoModalProps) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const initialContentRef = useRef(editTodoContent);
  const actionRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const valid = editTodoContent.trim().length > 0;
  const dirty = editTodoContent !== initialContentRef.current;
  const requestClose = () => {
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };
  const submit = async () => {
    if (actionRef.current || updating || !valid || !dirty) return;
    actionRef.current = true;
    try {
      await onSave();
    } finally {
      actionRef.current = false;
    }
  };

  return (
    <Dialog
      open
      title={confirmDiscard ? "Discard todo changes?" : "Edit todo"}
      description={confirmDiscard
        ? "Your updated todo text has not been saved."
        : `Update the todo scheduled for ${editingTodoDueDate}.`}
      variant="modal"
      size="md"
      dismissPolicy="when-idle"
      busy={updating}
      initialFocusRef={textareaRef}
      onClose={requestClose}
    >
      <DialogHeader showClose={!confirmDiscard} />
      {confirmDiscard ? (
        <>
          <DialogBody>
            <DialogStatus variant="info">
              Discarding will restore the todo text that was present when this dialog opened.
            </DialogStatus>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              className="h-11 w-full sm:w-auto"
              onClick={() => setConfirmDiscard(false)}
            >
              Keep editing
            </Button>
            <Button
              variant="destructive"
              className="h-11 w-full sm:w-auto"
              onClick={onClose}
            >
              Discard
            </Button>
          </DialogFooter>
        </>
      ) : (
        <>
          <DialogBody>
            <label htmlFor="edit-todo-content" className="mb-2 block text-sm font-medium text-foreground">
              Todo content
            </label>
            <textarea
              ref={textareaRef}
              id="edit-todo-content"
              rows={4}
              maxLength={500}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Update todo content"
              value={editTodoContent}
              onFocus={(event) => scrollFieldIntoView(event.currentTarget)}
              onChange={(event) => setEditTodoContent(event.target.value)}
            />
            <div className="mt-1 text-right text-xs text-muted-foreground">
              {editTodoContent.length}/500
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              className="h-11 w-full sm:w-auto"
              onClick={requestClose}
              disabled={updating}
            >
              Cancel
            </Button>
            <Button
              className="h-11 w-full sm:w-auto"
              onClick={() => void submit()}
              isLoading={updating}
              disabled={!valid || !dirty}
            >
              {updating ? "Saving todo" : "Save"}
            </Button>
          </DialogFooter>
        </>
      )}
    </Dialog>
  );
}
