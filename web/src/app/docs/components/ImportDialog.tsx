import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogStatus,
} from "@/components/ui/dialog";
import type { ImportStep, ImportMode, ImportSource, ImportPreview, ImportReport } from "../types";
import { FileArchive, Upload } from "lucide-react";

export interface ImportDialogProps {
  open: boolean;
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
  importSource: ImportSource;
  importFileName: string | null;
  onImportFile: (file: File) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <FileArchive className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="text-sm font-medium">
          {importSource === "hedgedoc" ? "Upload HedgeDoc ZIP" : "Upload Notes JSON ZIP"}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">Only .zip files are supported</div>
        <label className="mt-4 inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-border bg-background px-4 text-xs font-semibold hover:bg-accent">
          <Upload className="h-4 w-4" aria-hidden="true" />
          Choose file
          <input
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(event) => {
              const input = event.target;
              const file = input.files?.[0];
              if (file) onImportFile(file);
              input.value = "";
            }}
          />
        </label>
        {importFileName ? (
          <div className="mt-2 break-all text-xs text-muted-foreground">{importFileName}</div>
        ) : null}
      </div>
      <div className="text-xs leading-5 text-muted-foreground">
        {importSource === "hedgedoc" ? (
          <>
            Tags are extracted from lines starting with{" "}
            <code className="font-mono">###### tags:</code> and removed from note content.
          </>
        ) : (
          <>Each JSON file must include title and content; tag_list is optional.</>
        )}
      </div>
    </div>
  );
}

function PreviewStep({ importPreview, importMode, onSetImportMode }: {
  importPreview: ImportPreview;
  importMode: ImportMode;
  onSetImportMode: (mode: ImportMode) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          ["Notes", importPreview.notes_count],
          ["Tags", importPreview.tags_count],
          ["Conflicts", importPreview.conflicts],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-muted/20 p-3">
            <div className="text-xs font-medium text-muted-foreground">{label}</div>
            <div className="mt-1 text-lg font-bold">{value}</div>
          </div>
        ))}
      </div>
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-foreground">Conflict handling</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {([
            { label: "Ignore", value: "skip" as ImportMode, hint: "Skip existing titles" },
            { label: "Overwrite", value: "overwrite" as ImportMode, hint: "Replace existing notes" },
            { label: "Add suffix", value: "append" as ImportMode, hint: "Create a separate copy" },
          ]).map((item) => (
            <button
              type="button"
              key={item.value}
              aria-pressed={importMode === item.value}
              onClick={() => onSetImportMode(item.value)}
              className={`min-h-11 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors ${
                importMode === item.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:bg-accent"
              }`}
            >
              <span className="block">{item.label}</span>
              <span className="mt-1 block text-xs font-normal text-muted-foreground">{item.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>
      {importPreview.samples.length > 0 ? (
        <div className="space-y-2">
          <div className="text-xs font-medium text-foreground">Sample notes</div>
          <div className="space-y-2">
            {importPreview.samples.map((item) => (
              <div key={item.title} className="rounded-xl border border-border bg-background p-3">
                <div className="truncate text-sm font-semibold">{item.title}</div>
                {item.tags.length > 0 ? (
                  <div className="mt-1 text-xs text-muted-foreground">#{item.tags.join(" #")}</div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DoneStep({ importReport }: { importReport: ImportReport }) {
  const succeeded = importReport.created + importReport.updated + importReport.skipped;
  return (
    <div className="space-y-4">
      <DialogStatus variant={importReport.failed > 0 ? "info" : "success"}>
        Import finished. Review the report before returning to your notes.
      </DialogStatus>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <div className="text-xs text-muted-foreground">Processed</div>
          <div className="mt-1 text-lg font-bold">{succeeded}</div>
        </div>
        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <div className="text-xs text-muted-foreground">Failed</div>
          <div className="mt-1 text-lg font-bold">{importReport.failed}</div>
        </div>
      </div>
      {importReport.failed_titles.length > 0 ? (
        <div className="space-y-2">
          <div className="text-xs font-medium text-foreground">Failed notes</div>
          <div className="max-h-40 overflow-y-auto rounded-xl border border-border p-3 text-xs text-muted-foreground">
            {importReport.failed_titles.map((title) => (
              <div key={title} className="truncate">{title}</div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ImportFooter({
  importStep,
  onClose,
  onImportConfirm,
}: Pick<ImportDialogProps, "importStep" | "onClose" | "onImportConfirm">) {
  if (importStep === "importing") {
    return (
      <DialogFooter>
        <Button className="h-11 w-full sm:w-auto" disabled isLoading>
          Importing
        </Button>
      </DialogFooter>
    );
  }
  if (importStep === "done") {
    return (
      <DialogFooter>
        <Button variant="outline" className="h-11 w-full sm:w-auto" onClick={onClose}>Close</Button>
        <Button className="h-11 w-full sm:w-auto" onClick={onClose}>View notes</Button>
      </DialogFooter>
    );
  }
  return (
    <DialogFooter>
      <Button variant="outline" className="h-11 w-full sm:w-auto" onClick={onClose}>
        {importStep === "parsing" ? "Cancel parsing" : "Cancel"}
      </Button>
      {importStep === "preview" ? (
        <Button className="h-11 w-full sm:w-auto" onClick={onImportConfirm}>Start import</Button>
      ) : null}
    </DialogFooter>
  );
}

export function ImportDialog(props: ImportDialogProps) {
  const {
    open,
    importStep,
    importMode,
    importSource,
    importPreview,
    importReport,
    importError,
    importFileName,
    importProgress,
    onSetImportMode,
    onClose,
    onImportFile,
    onImportConfirm,
  } = props;
  const title = importSource === "hedgedoc" ? "Import from HedgeDoc" : "Import Micro Note archive";
  const description = importStep === "upload"
    ? "Choose a ZIP archive to inspect before importing."
    : importStep === "preview"
      ? "Review the archive and choose how title conflicts are handled."
      : importStep === "importing"
        ? "The server is writing notes. This dialog will unlock when the operation finishes."
        : importStep === "done"
          ? "The document list has been refreshed with the import result."
          : "The archive is being uploaded and parsed.";

  return (
    <Dialog
      open={open}
      title={title}
      description={description}
      variant="modal"
      size="lg"
      dismissPolicy="when-idle"
      busy={importStep === "importing"}
      onClose={onClose}
    >
      <DialogHeader />
      <DialogBody className="space-y-4">
        {importError ? (
          <DialogStatus variant="error">
            <div>{importError}</div>
            <div className="mt-1 text-xs">Review the selected archive or retry the current step.</div>
          </DialogStatus>
        ) : null}
        {importStep === "upload" ? (
          <UploadStep
            importSource={importSource}
            importFileName={importFileName}
            onImportFile={onImportFile}
          />
        ) : null}
        {importStep === "parsing" ? (
          <div className="py-10">
            <DialogStatus variant="loading">Uploading and parsing the archive…</DialogStatus>
          </div>
        ) : null}
        {importStep === "preview" && importPreview ? (
          <PreviewStep
            importPreview={importPreview}
            importMode={importMode}
            onSetImportMode={onSetImportMode}
          />
        ) : null}
        {importStep === "importing" ? (
          <div className="space-y-4 py-4">
            <DialogStatus variant="loading">
              Import in progress. Closing is temporarily unavailable so the final report is not lost.
            </DialogStatus>
            <div
              role="progressbar"
              aria-label="Import progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(importProgress)}
              className="space-y-2"
            >
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-[width] duration-500"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
              <div className="text-right text-xs text-muted-foreground">
                {Math.round(importProgress)}%
              </div>
            </div>
          </div>
        ) : null}
        {importStep === "done" && importReport ? <DoneStep importReport={importReport} /> : null}
      </DialogBody>
      <ImportFooter
        importStep={importStep}
        onClose={onClose}
        onImportConfirm={onImportConfirm}
      />
    </Dialog>
  );
}
