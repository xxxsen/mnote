import React from "react";

export function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "section";
}

export function getText(value: React.ReactNode): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map((item) => getText(item)).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(value)) {
    return getText(value.props.children);
  }
  return "";
}

export function normalizeTagName(name: string): string {
  return name.trim();
}

export function isValidTagName(name: string): boolean {
  if (!name) return false;
  if (Array.from(name).length > 16) return false;
  return /^[\p{Script=Han}A-Za-z0-9]{1,16}$/u.test(name);
}

export function extractTitleFromContent(value: string): string {
  const lines = value.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const h1Match = line.match(/^#\s+(.+)$/);
    if (h1Match) return h1Match[1].trim();

    if (i + 1 < lines.length && /^=+$/.test(lines[i + 1].trim())) {
      return line;
    }

    return line.length > 50 ? line.slice(0, 50) + "..." : line;
  }
  return "";
}

export function randomBase62(length: number): string {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  if (length <= 0) return "";
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(values)
    .map((v) => chars[v % chars.length])
    .join("");
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// SavedSyncAction is the page's decision for how to react to a
// successful save in the editor:
//
//   - "clear": the snapshot the server just accepted is still the
//     authoritative state in the editor; the page should mark the
//     draft as fully synced and remove the localStorage backup.
//   - "preserve_draft": a newer snapshot exists somewhere (either
//     queued in the save queue or still in flight in contentRef), so
//     the page must keep hasUnsavedChanges=true and re-publish the
//     latest editor body to the localStorage draft to protect against
//     a crash/reload before the follow-up save commits.
export type SavedSyncAction = "clear" | "preserve_draft";

// decideSavedSync runs the staleness check the editor page uses to
// react to useEditorSaveQueue's onSaved callback.
//
// A snapshot is "stale" — i.e. NOT the editor's current state — if any
// of the following hold:
//
//   - isLatest is false: the save queue already has a newer snapshot
//     waiting under its single-flight lock.
//   - snapshot.content differs from contentRef.current: the user typed
//     additional characters between requestSave being invoked and the
//     PUT actually completing.
//   - snapshot.title differs from the title currently derived from
//     contentRef.current: same as content drift but for the heading.
//
// Stale snapshots must NOT clear the localStorage draft or
// hasUnsavedChanges, otherwise a crash/reload between this point and
// the follow-up save would silently lose the unsynced edits.
export function decideSavedSync(input: {
  snapshotContent: string;
  snapshotTitle: string;
  currentContent: string;
  currentTitle: string;
  isLatest: boolean;
}): SavedSyncAction {
  if (
    input.isLatest &&
    input.snapshotContent === input.currentContent &&
    input.snapshotTitle === input.currentTitle
  ) {
    return "clear";
  }
  return "preserve_draft";
}

export function extractLinkedDocIDs(value: string, excludeId: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const regex = /\/docs\/([a-zA-Z0-9_-]+)/g;
  let match: RegExpExecArray | null = regex.exec(value);
  while (match) {
    const targetID = match[1];
    if (targetID && targetID !== excludeId && !seen.has(targetID)) {
      seen.add(targetID);
      ids.push(targetID);
    }
    match = regex.exec(value);
  }
  return ids;
}
