"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogStatus,
} from "@/components/ui/dialog";

interface DeleteTemplateDialogProps {
  templateName: string;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

export function DeleteTemplateDialog({
  templateName,
  deleting,
  onCancel,
  onConfirm,
}: DeleteTemplateDialogProps) {
  return (
    <Dialog
      open
      title="Delete template?"
      description={`“${templateName}” will be permanently removed.`}
      variant="modal"
      size="sm"
      role="alertdialog"
      dismissPolicy="when-idle"
      busy={deleting}
      onClose={onCancel}
    >
      <DialogHeader />
      <DialogBody>
        <DialogStatus variant="error">
          Existing notes created from this template are not affected. This action cannot be undone.
        </DialogStatus>
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
          onClick={() => void onConfirm()}
          isLoading={deleting}
        >
          {deleting ? "Deleting template" : "Delete template"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
