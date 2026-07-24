import { describe, expect, it } from "vitest";

import {
  assetMarkdown,
  classifyAssetPreview,
  formatAssetSize,
  isSafeAssetFileKey,
  normalizeAssetContentType,
  resolveAssetDownloadURL,
  resolveAssetPreviewURL,
  resolveAssetURL,
} from "../helpers";

describe("asset helpers", () => {
  it("formats file sizes at stable unit boundaries", () => {
    expect(formatAssetSize(500)).toBe("500 B");
    expect(formatAssetSize(1536)).toBe("1.5 KB");
    expect(formatAssetSize(2 * 1024 * 1024)).toBe("2.0 MB");
  });

  it("preserves absolute and application-relative URLs", () => {
    expect(resolveAssetURL("https://files.example/image.png")).toBe("https://files.example/image.png");
    expect(resolveAssetURL("/uploads/image.png")).toBe("/uploads/image.png");
  });

  it("builds the exact Markdown image snippet", () => {
    expect(assetMarkdown("diagram.png", "/uploads/diagram.png"))
      .toBe("![diagram.png](/uploads/diagram.png)");
  });

  it("normalizes MIME parameters and classifies explicit media types", () => {
    expect(normalizeAssetContentType(" Application/PDF; charset=binary ")).toBe("application/pdf");
    expect(classifyAssetPreview("Application/PDF; charset=binary", "manual.bin")).toBe("pdf");
    expect(classifyAssetPreview("video/webm", "clip.bin")).toBe("video");
    expect(classifyAssetPreview("audio/mpeg", "track.bin")).toBe("audio");
    expect(classifyAssetPreview("image/png", "image.bin")).toBe("image");
  });

  it("falls back only for generic MIME and handles Ogg deterministically", () => {
    expect(classifyAssetPreview("application/octet-stream", "manual.PDF")).toBe("pdf");
    expect(classifyAssetPreview("", "movie.MP4")).toBe("video");
    expect(classifyAssetPreview("", "track.FLAC")).toBe("audio");
    expect(classifyAssetPreview("application/ogg", "movie.ogv")).toBe("video");
    expect(classifyAssetPreview("application/ogg", "track.ogg")).toBe("audio");
    expect(classifyAssetPreview("application/ogg", "unknown.bin")).toBe("unsupported");
    expect(classifyAssetPreview("text/html", "manual.pdf")).toBe("unsupported");
  });

  it("builds preview and download URLs only from safe file keys", () => {
    expect(resolveAssetPreviewURL("user_file.pdf"))
      .toBe("/api/v1/files/user_file.pdf/preview");
    expect(resolveAssetDownloadURL("user_file.pdf"))
      .toBe("/api/v1/files/user_file.pdf");
    for (const key of ["", ".", "..", "../file.pdf", "folder/file.pdf", "https://evil.test/file"]) {
      expect(isSafeAssetFileKey(key)).toBe(false);
      expect(resolveAssetPreviewURL(key)).toBeNull();
      expect(resolveAssetDownloadURL(key)).toBeNull();
    }
  });
});
