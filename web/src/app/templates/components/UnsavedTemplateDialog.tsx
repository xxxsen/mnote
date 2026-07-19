"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogStatus,
} from "@/components/ui/dialog";

export function UnsavedTemplateDialog({
  saving,
  onCancel,
  onDiscard,
  onSave,
}: {
  saving: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void | Promise<void>;
}) {
  return (
    <Dialog
      open
      title="Save changes?"
      description="This template has unsaved changes."
      role="alertdialog"
      dismissPolicy="when-idle"
      busy={saving}
      onClose={onCancel}
    >
      <DialogHeader />
      <DialogBody>
        <DialogStatus variant="warning">
          Save before continuing, or discard the current edits.
        </DialogStatus>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button variant="destructive" onClick={onDiscard} disabled={saving}>Discard and continue</Button>
        <Button onClick={() => void onSave()} isLoading={saving}>Save and continue</Button>
      </DialogFooter>
    </Dialog>
  );
}
