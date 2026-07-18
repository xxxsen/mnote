export type EditorDraftV2 = {
  version: 2;
  docId: string;
  content: string;
  updatedAt: number;
  baseRevision: number;
  baseContentHash: string;
};

export type LegacyEditorDraft = {
  content: string;
  updatedAt?: number;
};

export type DraftServerSnapshot = {
  docId: string;
  content: string;
  contentRevision: number;
  contentHash: string;
};

export type StoredEditorDraft = EditorDraftV2 | LegacyEditorDraft;

export type DraftClassification =
  | { kind: "use_server"; reason: "missing" | "invalid" | "same_content" }
  | { kind: "auto_recover"; draft: EditorDraftV2 }
  | { kind: "needs_recovery"; draft: StoredEditorDraft };

export type StorageWriteResult =
  | { ok: true }
  | { ok: false; error: unknown };

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function draftStorageKey(docId: string): string {
  return `mnote:draft:${docId}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseV2(value: Record<string, unknown>): EditorDraftV2 | null {
  if (
    value.version !== 2 ||
    typeof value.docId !== "string" ||
    typeof value.content !== "string" ||
    !isFiniteNumber(value.updatedAt) ||
    !Number.isInteger(value.baseRevision) ||
    (value.baseRevision as number) <= 0 ||
    typeof value.baseContentHash !== "string"
  ) {
    return null;
  }
  return {
    version: 2,
    docId: value.docId,
    content: value.content,
    updatedAt: value.updatedAt,
    baseRevision: value.baseRevision as number,
    baseContentHash: value.baseContentHash,
  };
}

function parseLegacy(value: Record<string, unknown>): LegacyEditorDraft | null {
  if (typeof value.content !== "string") return null;
  if (value.updatedAt !== undefined && !isFiniteNumber(value.updatedAt)) return null;
  return {
    content: value.content,
    ...(value.updatedAt === undefined ? {} : { updatedAt: value.updatedAt }),
  };
}

export function parseStoredDraft(raw: string): StoredEditorDraft | null {
  try {
    const value = JSON.parse(raw) as unknown;
    if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    return record.version === 2 ? parseV2(record) : parseLegacy(record);
  } catch {
    return null;
  }
}

export function removeDraft(storage: DraftStorage, docId: string): StorageWriteResult {
  try {
    storage.removeItem(draftStorageKey(docId));
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

export function flushDraft(storage: DraftStorage, draft: EditorDraftV2): StorageWriteResult {
  try {
    storage.setItem(draftStorageKey(draft.docId), JSON.stringify(draft));
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

export function classifyStoredDraft(
  storage: DraftStorage,
  server: DraftServerSnapshot,
): DraftClassification {
  let raw: string | null;
  try {
    raw = storage.getItem(draftStorageKey(server.docId));
  } catch {
    return { kind: "use_server", reason: "missing" };
  }
  if (raw === null) return { kind: "use_server", reason: "missing" };

  const draft = parseStoredDraft(raw);
  if (!draft || ("version" in draft && draft.docId !== server.docId)) {
    removeDraft(storage, server.docId);
    return { kind: "use_server", reason: "invalid" };
  }
  if (draft.content === server.content) {
    removeDraft(storage, server.docId);
    return { kind: "use_server", reason: "same_content" };
  }
  if (
    "version" in draft &&
    draft.baseRevision === server.contentRevision &&
    draft.baseContentHash === server.contentHash
  ) {
    return { kind: "auto_recover", draft };
  }
  return { kind: "needs_recovery", draft };
}

export function createDraftV2(input: {
  docId: string;
  content: string;
  baseRevision: number;
  baseContentHash: string;
  updatedAt?: number;
}): EditorDraftV2 {
  return {
    version: 2,
    docId: input.docId,
    content: input.content,
    updatedAt: input.updatedAt ?? Date.now(),
    baseRevision: input.baseRevision,
    baseContentHash: input.baseContentHash,
  };
}
