import { Button } from "@/components/ui/button";
import type { ImportStep, ImportMode, ImportSource, ImportPreview, ImportReport } from "../types";
import { ChevronDown, FileArchive, Upload, X } from "lucide-react";

export interface ImportDialogProps {
  importStep: ImportStep;
  importMode: ImportMode;
  importSource: ImportSource;
  importPreview: ImportPreview | null;
  importReport: ImportReport | null;
  importError: string | null;
  importFileName: string | null;
  importProgress: number;
  onSetImportMode: (mode: ImportMode) => void;
  onClose: () => void;
  onImportFile: (file: File) => void;
  onImportConfirm: () => void;
}

function UploadStep({ importSource, importFileName, onImportFile }: {
  importSource: ImportSource; importFileName: string | null; onImportFile: (file: File) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="border border-dashed border-border rounded-2xl p-6 text-center bg-muted/20">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary mx-auto mb-3">
          <FileArchive className="h-5 w-5" />
        </div>
        <div className="text-sm font-medium">{importSource === "hedgedoc" ? "Upload HedgeDoc ZIP" : "Upload Notes JSON ZIP"}</div>
        <div className="text-xs text-muted-foreground mt-1">Only .zip files are supported</div>
        <label className="inline-flex items-center gap-2 mt-4 cursor-pointer rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold hover:bg-accent">
          <Upload className="h-4 w-4" />
          Choose file
          <input type="file" accept=".zip" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImportFile(file); }} />
        </label>
        {importFileName && <div className="text-xs text-muted-foreground mt-2">{importFileName}</div>}
      </div>
      {importSource === "hedgedoc" ? (
        <div className="text-[11px] text-muted-foreground">
          We will extract tags from lines starting with <code className="font-mono">###### tags:</code> and remove them from the content.
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground">
          Each JSON file should include title and content, with optional summary and tag_list.
        </div>
      )}
    </div>
  );
}

function PreviewStep({ importPreview, importMode, onSetImportMode }: {
  importPreview: ImportPreview; importMode: ImportMode; onSetImportMode: (mode: ImportMode) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Notes</div>
          <div className="text-lg font-bold mt-1">{importPreview.notes_count}</div>
        </div>
        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Tags</div>
          <div className="text-lg font-bold mt-1">{importPreview.tags_count}</div>
        </div>
        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Conflicts</div>
          <div className="text-lg font-bold mt-1">{importPreview.conflicts}</div>
        </div>
      </div>
      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Conflict handling</div>
        <div className="grid grid-cols-3 gap-2">
          {([
            { label: "Ignore", value: "skip" as ImportMode, hint: "Skip existing titles" },
            { label: "Overwrite", value: "overwrite" as ImportMode, hint: "Replace existing notes" },
            { label: "Add Suffix", value: "append" as ImportMode, hint: "Create with suffix" },
          ]).map((item) => (
            <button
              key={item.value}
              onClick={() => onSetImportMode(item.value)}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${importMode === item.value ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"}`}
            >
              <div>{item.label}</div>
              <div className="text-[10px] text-muted-foreground mt-1">{item.hint}</div>
            </button>
          ))}
        </div>
      </div>
      {importPreview.samples.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Sample notes</div>
          <div className="space-y-2">
            {importPreview.samples.map((item) => (
              <div key={item.title} className="border border-border rounded-xl p-3 bg-background">
                <div className="text-sm font-semibold truncate">{item.title}</div>
                {item.tags.length > 0 && <div className="text-[11px] text-muted-foreground mt-1">#{item.tags.join(" #")}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DoneStep({ importReport }: { importReport: ImportReport }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Success</div>
          <div className="text-lg font-bold mt-1">{importReport.created + importReport.updated + importReport.skipped}</div>
        </div>
        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Failed</div>
          <div className="text-lg font-bold mt-1">{importReport.failed}</div>
        </div>
      </div>
      {(importReport.failed_titles || []).length > 0 && ( // eslint-disable-line @typescript-eslint/no-unnecessary-condition
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Failed notes</div>
          <div className="max-h-40 overflow-y-auto border border-border rounded-xl p-3 text-xs text-muted-foreground">
            {(importReport.failed_titles || []).map((title) => ( // eslint-disable-line @typescript-eslint/no-unnecessary-condition
              <div key={title} className="truncate">{title}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ImportDialog(props: ImportDialogProps) {
  const {
    importStep, importMode, importSource, importPreview, importReport,
    importError, importFileName, importProgress,
    onSetImportMode, onClose, onImportFile, onImportConfirm,
  } = props;

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={importStep === "importing" ? undefined : onClose} />
      <div className="relative w-full max-w-2xl rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <div className="text-sm font-bold">
              {importSource === "hedgedoc" ? "Import from HedgeDoc" : "Import Notes (JSON)"}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {importSource === "hedgedoc" ? "Upload a HedgeDoc export ZIP to import notes" : "Upload a notes JSON ZIP to import notes"}
            </div>
          </div>
          <button className="text-muted-foreground hover:text-foreground" onClick={onClose} disabled={importStep === "importing"}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {importError && (
            <div className="bg-destructive/10 text-destructive text-sm px-3 py-2 rounded-lg">{importError}</div>
          )}
          {importStep === "upload" && <UploadStep importSource={importSource} importFileName={importFileName} onImportFile={onImportFile} />}
          {importStep === "parsing" && (
            <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full border border-border bg-background flex items-center justify-center">
                  <ChevronDown className="h-4 w-4 animate-bounce" />
                </div>
                <span>Parsing archive and extracting notes...</span>
              </div>
            </div>
          )}
          {importStep === "preview" && importPreview && <PreviewStep importPreview={importPreview} importMode={importMode} onSetImportMode={onSetImportMode} />}
          {importStep === "importing" && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">Importing notes, please wait...</div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all duration-500" style={{ width: `${importProgress}%` }} />
              </div>
              <div className="text-xs text-muted-foreground">{Math.round(importProgress)}%</div>
            </div>
          )}
          {importStep === "done" && importReport && <DoneStep importReport={importReport} />}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={importStep === "importing"}>
            {importStep === "done" ? "Close" : "Cancel"}
          </Button>
          {importStep === "preview" && <Button onClick={onImportConfirm}>Continue</Button>}
        </div>
      </div>
    </div>
  );
}
