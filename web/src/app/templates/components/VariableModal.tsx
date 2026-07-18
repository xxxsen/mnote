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
          <div className="grid shrink-0 grid-cols-2 border-b border-slate-200 p-2 md:hidden">
            <button
              type="button"
              aria-pressed={activePanel === "variables"}
              onClick={() => setActivePanel("variables")}
              className={`h-11 rounded-xl text-sm font-medium ${
                activePanel === "variables" ? "bg-slate-900 text-white" : "text-slate-600"
              }`}
            >
              Variables
            </button>
            <button
              type="button"
              aria-pressed={activePanel === "preview"}
              onClick={() => setActivePanel("preview")}
              className={`h-11 rounded-xl text-sm font-medium ${
                activePanel === "preview" ? "bg-slate-900 text-white" : "text-slate-600"
              }`}
            >
              Preview
            </button>
          </div>
          <DialogBody className="grid gap-5 md:grid-cols-[320px_minmax(0,1fr)]">
            <section
              aria-label="Template variables"
              className={activePanel === "variables" ? "space-y-4" : "hidden space-y-4 md:block"}
            >
              <h3 className="text-sm font-semibold text-slate-900">Variables</h3>
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
                ? "min-h-0 rounded-xl border border-border bg-slate-50 p-4"
                : "hidden min-h-0 rounded-xl border border-border bg-slate-50 p-4 md:block"}
            >
              <h3 className="mb-3 text-sm font-semibold text-slate-900">Preview</h3>
              <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-6 text-slate-800">
                {previewContent}
              </pre>
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
