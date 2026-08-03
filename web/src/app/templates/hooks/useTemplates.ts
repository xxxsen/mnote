"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import {
  NEW_NOTE_EDITOR_VIEW_MODE,
  saveEditorViewModePreference,
} from "@/lib/editor-view-mode";
import type { Document, Template } from "@/types";
import { VARIABLE_REGEX, normalizeTemplatePlaceholders, resolveSystemVariableClient } from "../utils";
import { useTemplateCatalog } from "./useTemplateCatalog";
import { useTemplateEditor } from "./useTemplateEditor";
import { useTemplateLeaveGuard } from "./useTemplateLeaveGuard";

type PendingTemplateDelete = { id: string; name: string };

function detectTemplateVariables(content: string) {
  const result: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = VARIABLE_REGEX.exec(content || "")) !== null) {
    const key = (match[1] || "").trim().toUpperCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(key);
  }
  VARIABLE_REGEX.lastIndex = 0;
  return result;
}

export function useTemplates() {
  const router = useRouter();
  const { toast } = useToast();
  const catalog = useTemplateCatalog(toast);
  const editor = useTemplateEditor({
    selectedID: catalog.selectedID,
    toast,
    onSaved: catalog.reload,
  });
  const [pendingDelete, setPendingDelete] = useState<PendingTemplateDelete | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState(false);
  const [creatingDoc, setCreatingDoc] = useState(false);
  const [showVariableModal, setShowVariableModal] = useState(false);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const deletingTemplateRef = useRef(false);
  const creatingDocRef = useRef(false);
  const guard = useTemplateLeaveGuard({
    dirty: editor.isDirty,
    saving: editor.saving,
    onSave: editor.saveTemplate,
  });

  const selected = useMemo(
    () => editor.selectedTemplate
      ?? catalog.templates.find((item) => item.id === catalog.selectedID)
      ?? null,
    [catalog.selectedID, catalog.templates, editor.selectedTemplate],
  );
  const detectedVariables = useMemo(
    () => detectTemplateVariables(editor.draft.content),
    [editor.draft.content],
  );

  const requestSelectTemplate = useCallback((id: string, onSelected?: () => void) => {
    if (id === catalog.selectedID) {
      onSelected?.();
      return;
    }
    guard.request(() => {
      catalog.setSelectedID(id);
      onSelected?.();
    }, id);
  }, [catalog, guard]);

  const createTemplateNow = useCallback(async () => {
    try {
      const item = await apiFetch<Template>("/templates", {
        method: "POST",
        body: JSON.stringify({
          name: "New Template",
          description: "",
          content: "# New Template\n",
          default_tag_ids: [],
        }),
      });
      catalog.setSearch("");
      await catalog.reload("");
      catalog.setSelectedID(item.id);
    } catch (error) {
      toast({
        description: error instanceof Error ? error.message : "Failed to create template",
        variant: "error",
      });
    }
  }, [catalog, toast]);

  const requestCreateTemplate = useCallback((onCreated?: () => void) => {
    guard.request(async () => {
      await createTemplateNow();
      onCreated?.();
    });
  }, [createTemplateNow, guard]);

  const requestDeleteTemplate = useCallback((id: string, name: string) => {
    const showConfirmation = () => setPendingDelete({ id, name });
    if (id === catalog.selectedID) guard.request(showConfirmation);
    else showConfirmation();
  }, [catalog.selectedID, guard]);

  const cancelDeleteTemplate = () => {
    if (!deletingTemplateRef.current) setPendingDelete(null);
  };

  const confirmDeleteTemplate = async () => {
    if (!pendingDelete || deletingTemplateRef.current) return;
    deletingTemplateRef.current = true;
    setDeletingTemplate(true);
    try {
      await apiFetch(`/templates/${pendingDelete.id}`, { method: "DELETE" });
      const deletedID = pendingDelete.id;
      setPendingDelete(null);
      const page = await catalog.reload();
      if (catalog.selectedID === deletedID) {
        catalog.setSelectedID(page?.items[0]?.id ?? "");
      }
      toast({ description: "Template deleted.", variant: "success" });
    } catch (error) {
      toast({
        description: error instanceof Error ? error.message : "Failed to delete template",
        variant: "error",
      });
    } finally {
      deletingTemplateRef.current = false;
      setDeletingTemplate(false);
    }
  };

  const prepareUseTemplate = () => {
    if (!selected || !editor.selectedTemplate) return;
    void (async () => {
      if (editor.isDirty && !(await editor.saveTemplate())) return;
      const initial: Record<string, string> = {};
      detectedVariables
        .filter((key) => !key.startsWith("SYS:"))
        .forEach((key) => { initial[key] = ""; });
      setVariableValues(initial);
      setShowVariableModal(true);
    })();
  };

  const createFromTemplate = async (variables: Record<string, string>) => {
    if (!selected || creatingDocRef.current) return;
    creatingDocRef.current = true;
    setCreatingDoc(true);
    try {
      const doc = await apiFetch<Document>(`/templates/${selected.id}/create`, {
        method: "POST",
        body: JSON.stringify({ variables }),
      });
      setShowVariableModal(false);
      saveEditorViewModePreference(NEW_NOTE_EDITOR_VIEW_MODE);
      router.push(`/docs/${doc.id}`);
    } catch (error) {
      toast({
        description: error instanceof Error ? error.message : "Failed to create note from template",
        variant: "error",
      });
    } finally {
      creatingDocRef.current = false;
      setCreatingDoc(false);
    }
  };

  const previewContent = useMemo(() => normalizeTemplatePlaceholders(editor.draft.content).replace(
    VARIABLE_REGEX,
    (_raw, key: string) => {
      const normalized = (key || "").trim().toUpperCase();
      if (!normalized) return "";
      if (normalized.startsWith("SYS:")) return resolveSystemVariableClient(normalized);
      return variableValues[normalized] || "";
    },
  ), [editor.draft.content, variableValues]);

  return {
    router,
    ...catalog,
    ...editor,
    ...guard,
    selected,
    pendingDelete,
    deletingTemplate,
    creatingDoc,
    showVariableModal,
    setShowVariableModal,
    variableValues,
    setVariableValues,
    requestSelectTemplate,
    requestCreateTemplate,
    createTemplate: createTemplateNow,
    requestDeleteTemplate,
    cancelDeleteTemplate,
    confirmDeleteTemplate,
    prepareUseTemplate,
    createFromTemplate,
    previewContent,
    requestNavigate: (path: string) => guard.request(() => router.push(path)),
    requestMobileBack: (onBack: () => void) => guard.request(onBack),
  };
}
