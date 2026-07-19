"use client";

import type { Todo } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogStatus,
} from "@/components/ui/dialog";

export function DeleteTodoDialog({
  target,
  deleting,
  onCancel,
  onConfirm,
}: {
  target: Todo | null;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={Boolean(target)}
      role="alertdialog"
      title="Delete todo"
      description="This action permanently removes the todo from the calendar."
      variant="modal"
      size="sm"
      dismissPolicy="when-idle"
      busy={deleting}
      onClose={onCancel}
    >
      <DialogHeader />
      <DialogBody className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Delete <span className="font-semibold text-foreground">{target?.content}</span>?
        </p>
        {deleting ? (
          <DialogStatus variant="loading">Deleting todo…</DialogStatus>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button
          variant="outline"
          className="h-11 w-full sm:w-auto"
          onClick={onCancel}
          disabled={deleting}
        >
          Cancel
        </Button>
        <Button
          variant="destructive"
          className="h-11 w-full sm:w-auto"
          onClick={onConfirm}
          isLoading={deleting}
        >
          Delete todo
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
