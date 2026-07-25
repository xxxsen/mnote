import { useImportFlow } from "./useImportFlow";
import { useExportFlow } from "./useExportFlow";

type ToastVariant = "default" | "success" | "error";

interface UseImportExportDeps {
  fetchOverview: () => Promise<void>;
  fetchTags: (query: string) => Promise<void>;
  fetchSidebarTags: (offset: number, append: boolean, query: string) => Promise<void>;
  tagSearch: string;
  toast: (opts: { description: string | Error; variant?: ToastVariant }) => void;
}

export function useImportExport(deps: UseImportExportDeps) {
  const importFlow = useImportFlow(deps);
  const exportFlow = useExportFlow({ toast: deps.toast });

  return {
    importOpen: importFlow.open,
    importStep: importFlow.step,
    importMode: importFlow.mode,
    setImportMode: importFlow.setMode,
    importSource: importFlow.source,
    exportOpen: exportFlow.open,
    exporting: exportFlow.exporting,
    exportError: exportFlow.error,
    importPreview: importFlow.preview,
    importReport: importFlow.report,
    importError: importFlow.error,
    importFileName: importFlow.fileName,
    importProgress: importFlow.progress,
    openImportModal: importFlow.openDialog,
    closeImportModal: importFlow.closeDialog,
    openExportModal: exportFlow.openDialog,
    closeExportModal: exportFlow.closeDialog,
    handleImportFile: importFlow.importFile,
    handleImportConfirm: importFlow.confirm,
    handleExportNotes: exportFlow.exportNotes,
  };
}
