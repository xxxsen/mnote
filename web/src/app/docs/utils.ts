import type { DocumentWithTags } from "./types";

export function generatePixelAvatar(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
  const color = "#" + "00000".substring(0, 6 - c.length) + c;

  let rects = "";
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      if ((hash >> (y * 3 + x)) & 1) {
        rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${color}" />`;
        if (x < 2) rects += `<rect x="${4 - x}" y="${y}" width="1" height="1" fill="${color}" />`;
      }
    }
  }
  return `data:image/svg+xml;base64,${btoa(`<svg viewBox="0 0 5 5" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">${rects}</svg>`)}`;
}

export function sortDocs(docs: DocumentWithTags[]): DocumentWithTags[] {
  return [...docs].sort((a, b) => {
    if ((b.pinned || 0) !== (a.pinned || 0)) {
      return (b.pinned || 0) - (a.pinned || 0);
    }
    return (b.mtime || b.ctime || 0) - (a.mtime || a.ctime || 0);
  });
}

export function sortRecentDocs(docs: DocumentWithTags[]): DocumentWithTags[] {
  return [...docs].sort((a, b) => {
    return (b.mtime || b.ctime || 0) - (a.mtime || a.ctime || 0);
  });
}

export function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) return "";
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, now - timestamp);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === "undefined") return false;
  return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
}
