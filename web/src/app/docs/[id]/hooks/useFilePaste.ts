import { useCallback } from "react";
import { uploadFile } from "@/lib/api";
import { randomBase62 } from "../utils";

function resolveUploadMarkdown(result: { url: string; content_type?: string; name?: string }, file: File): string {
  let contentType = result.content_type || file.type || "";
  const name = result.name || file.name || "file";
  const ext = name.split(".").pop()?.toLowerCase();

  if (contentType === "application/octet-stream" || !contentType) {
    const audioExts = ["aac", "mp3", "wav", "ogg", "flac", "m4a", "opus"];
    const videoExts = ["mp4", "webm", "ogv", "mov", "mkv"];
    if (ext && audioExts.includes(ext)) contentType = "audio/" + ext;
    if (ext && videoExts.includes(ext)) contentType = "video/" + ext;
  }

  if (contentType.startsWith("image/")) return `![PIC:${name}](${result.url})`;
  if (contentType.startsWith("video/")) return `![VIDEO:${name}](${result.url})`;
  if (contentType.startsWith("audio/")) return `![AUDIO:${name}](${result.url})`;
  return `[FILE:${name}](${result.url})`;
}

export function useFilePaste(opts: {
  insertTextAtCursor: (text: string) => void;
  replacePlaceholder: (placeholder: string, replacement: string) => void;
  toast: (o: { description: string | Error; variant?: "default" | "success" | "error" }) => void;
}) {
  const { insertTextAtCursor, replacePlaceholder, toast } = opts;

  const handlePaste = useCallback(async (event: ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (!items || items.length === 0) return;
    const fileItem = Array.from(items).find((item) => item.kind === "file");
    if (!fileItem) return;
    const file = fileItem.getAsFile();
    if (!file) return;
    event.preventDefault();
    const placeholder = `file_uploading_${randomBase62(8)}`;
    insertTextAtCursor(placeholder);
    try {
      const result = await uploadFile(file);
      replacePlaceholder(placeholder, resolveUploadMarkdown(result, file));
    } catch (err) {
      console.error(err);
      replacePlaceholder(placeholder, "");
      toast({ description: err instanceof Error ? err : "Upload failed", variant: "error" });
    }
  }, [insertTextAtCursor, replacePlaceholder, toast]);

  return { handlePaste };
}
