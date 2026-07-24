import { resolveAPIURL } from "@/lib/api";

export type AssetPreviewKind = "image" | "pdf" | "video" | "audio" | "unsupported";

export const PDF_PREVIEW_MAX_BYTES = 25 * 1024 * 1024;
export const PDF_PREVIEW_MAX_PAGES = 500;
export const PDF_PREVIEW_MAX_RENDER_PIXELS = 16_000_000;
export const PDF_PREVIEW_MAX_RENDER_SIDE = 8192;
export const PDF_PREVIEW_MIN_ZOOM = 0.5;
export const PDF_PREVIEW_MAX_ZOOM = 2;
export const PDF_PREVIEW_ZOOM_STEP = 0.25;

const SAFE_FILE_KEY = /^[A-Za-z0-9._-]+$/;
const GENERIC_CONTENT_TYPES = new Set(["", "application/octet-stream"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".ogv", ".mov"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".oga", ".m4a", ".aac", ".flac"]);

export function formatAssetSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function normalizeAssetContentType(value: string) {
  return value.split(";", 1)[0].trim().toLowerCase();
}

function assetExtension(filename: string) {
  const name = filename.trim().toLowerCase();
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index) : "";
}

export function classifyAssetPreview(contentType: string, filename: string): AssetPreviewKind {
  const normalized = normalizeAssetContentType(contentType);
  const extension = assetExtension(filename);
  if (normalized === "application/pdf") return "pdf";
  if (normalized.startsWith("video/")) return "video";
  if (normalized.startsWith("audio/")) return "audio";
  if (normalized.startsWith("image/")) return "image";
  if (normalized === "application/ogg") {
    if (extension === ".ogv") return "video";
    if (extension === ".ogg" || extension === ".oga") return "audio";
    return "unsupported";
  }
  if (!GENERIC_CONTENT_TYPES.has(normalized)) return "unsupported";
  if (extension === ".pdf") return "pdf";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (AUDIO_EXTENSIONS.has(extension)) return "audio";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  return "unsupported";
}

export function isSafeAssetFileKey(fileKey: string) {
  return Boolean(
    fileKey
    && fileKey !== "."
    && fileKey !== ".."
    && SAFE_FILE_KEY.test(fileKey),
  );
}

export function resolveAssetPreviewURL(fileKey: string) {
  if (!isSafeAssetFileKey(fileKey)) return null;
  return resolveAPIURL(`/files/${encodeURIComponent(fileKey)}/preview`);
}

export function resolveAssetDownloadURL(fileKey: string) {
  if (!isSafeAssetFileKey(fileKey)) return null;
  return resolveAPIURL(`/files/${encodeURIComponent(fileKey)}`);
}

export function resolveAssetURL(value: string) {
  if (!value || /^https?:\/\//i.test(value) || !value.startsWith("/")) return value;
  const apiBase = process.env.NEXT_PUBLIC_API_BASE || "/api/v1";
  if (!/^https?:\/\//i.test(apiBase)) return value;
  try {
    return `${new URL(apiBase).origin}${value}`;
  } catch {
    return value;
  }
}

export function assetMarkdown(name: string, url: string) {
  return `![${name}](${url})`;
}
