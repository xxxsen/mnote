"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface VariableModalProps {
  variableValues: Record<string, string>;
  setVariableValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  previewContent: string;
  creatingDoc: boolean;
  onCancel: () => void;
  onApply: (variables: Record<string, string>) => void;
}

export function VariableModal({ variableValues, setVariableValues, previewContent, creatingDoc, onCancel, onApply }: VariableModalProps) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl max-h-[90vh] rounded-xl border border-border bg-card p-4 overflow-hidden">
        <div className="text-sm font-semibold mb-3">Template Preview</div>
        <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 h-[calc(90vh-6rem)] min-h-[360px]">
          <div className="space-y-3 overflow-y-auto pr-1">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Variables</div>
            {Object.keys(variableValues).length === 0 ? (
              <div className="text-xs text-muted-foreground">No custom variables.</div>
            ) : (
              Object.keys(variableValues).map((key) => (
                <div key={key} className="grid grid-cols-[120px_1fr] items-center gap-2">
                  <div className="text-xs text-muted-foreground font-mono truncate">{key}</div>
                  <Input
                    value={variableValues[key] || ""}
                    onChange={(e) => setVariableValues((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder="Value"
                  />
                </div>
              ))
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button onClick={() => void onApply(variableValues)} disabled={creatingDoc}>
                Apply
              </Button>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-background p-3 overflow-y-auto">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Preview</div>
            <pre className="text-sm whitespace-pre-wrap break-words font-mono leading-6">{previewContent}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}
