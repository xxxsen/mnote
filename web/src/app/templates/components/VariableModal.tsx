"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogStatus,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import MarkdownPreview from "@/components/markdown-preview";
import { ReadingSurface } from "@/components/reading-surface";
import { SegmentedControl } from "@/components/ui/segmented-control";

interface VariableModalProps {
  variableValues: Record<string, string>;
  setVariableValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  previewContent: string;
  creatingDoc: boolean;
  onCancel: () => void;
  onApply: (variables: Record<string, string>) => void | Promise<void>;
}

export function VariableModal({
  variableValues,
  setVariableValues,
  previewContent,
  creatingDoc,
  onCancel,
  onApply,
}: VariableModalProps) {
  const [activePanel, setActivePanel] = useState<"variables" | "preview">("variables");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const initialValuesRef = useRef(JSON.stringify(variableValues));
  const actionRef = useRef(false);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(variableValues) !== initialValuesRef.current;
  const requestClose = () => {
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    onCancel();
  };
  const apply = async () => {
    if (actionRef.current || creatingDoc) return;
    actionRef.current = true;
    try {
      await onApply(variableValues);
    } finally {
      actionRef.current = false;
    }
  };

  return (
    <Dialog
      open
      title={confirmDiscard ? "Discard variable changes?" : "Template preview"}
      description={confirmDiscard
        ? "Your variable values have not been applied."
        : "Fill in template variables and review the generated note before applying it."}
      variant="fullscreen"
      size="xl"
      dismissPolicy="when-idle"
      busy={creatingDoc}
      initialFocusRef={firstInputRef}
      onClose={requestClose}
    >
      <DialogHeader showClose={!confirmDiscard} />
      {confirmDiscard ? (
        <>
          <DialogBody>
            <DialogStatus variant="info">
              Discarding will remove the variable values entered in this preview.
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
              onClick={onCancel}
            >
              Discard
            </Button>
          </DialogFooter>
        </>
      ) : (
        <>
          <div className="shrink-0 border-b border-border p-2 md:hidden">
            <SegmentedControl
              label="Template preview panel"
              value={activePanel}
              options={[
                { value: "variables", label: "Variables" },
                { value: "preview", label: "Preview" },
              ]}
              onChange={setActivePanel}
              className="grid w-full grid-cols-2"
            />
          </div>
          <DialogBody className="grid gap-5 md:grid-cols-[320px_minmax(0,1fr)]">
            <section
              aria-label="Template variables"
              className={activePanel === "variables" ? "space-y-4" : "hidden space-y-4 md:block"}
            >
              <h3 className="text-sm font-semibold text-foreground">Variables</h3>
              {Object.keys(variableValues).length === 0 ? (
                <DialogStatus variant="info">This template has no custom variables.</DialogStatus>
              ) : (
                <div className="space-y-3">
                  {Object.keys(variableValues).map((key, index) => (
                    <label key={key} className="block space-y-1.5">
                      <span className="block truncate font-mono text-xs text-muted-foreground">{key}</span>
                      <Input
                        ref={index === 0 ? firstInputRef : undefined}
                        value={variableValues[key] || ""}
                        onFocus={(event) => event.currentTarget.scrollIntoView({ block: "nearest" })}
                        onChange={(event) => {
                          setVariableValues((previous) => ({
                            ...previous,
                            [key]: event.target.value,
                          }));
                        }}
                        placeholder={`Value for ${key}`}
                      />
                    </label>
                  ))}
                </div>
              )}
            </section>
            <section
              aria-label="Generated note preview"
              className={activePanel === "preview"
                ? "min-h-0"
                : "hidden min-h-0 md:block"}
            >
              <h3 className="mb-3 text-sm font-semibold">Preview</h3>
              <ReadingSurface className="max-w-none p-4">
                <MarkdownPreview content={previewContent} />
              </ReadingSurface>
            </section>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              className="h-11 w-full sm:w-auto"
              onClick={requestClose}
              disabled={creatingDoc}
            >
              Cancel
            </Button>
            <Button
              className="h-11 w-full sm:w-auto"
              onClick={() => void apply()}
              isLoading={creatingDoc}
            >
              {creatingDoc ? "Creating note" : "Apply template"}
            </Button>
          </DialogFooter>
        </>
      )}
    </Dialog>
  );
}
