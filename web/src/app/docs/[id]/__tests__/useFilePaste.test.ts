import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { uploadFile } from "@/lib/api";
import { useFilePaste } from "../hooks/useFilePaste";

vi.mock("@/lib/api", () => ({
  uploadFile: vi.fn(),
}));

vi.mock("../utils", () => ({
  randomBase62: vi.fn().mockReturnValue("abc12345"),
  extractLinkedDocIDs: vi.fn().mockReturnValue([]),
}));

const mockUploadFile = vi.mocked(uploadFile);
const stableInsert = vi.fn();
const stableReplace = vi.fn();
const stableToast = vi.fn();

beforeEach(() => { vi.clearAllMocks(); });

function makeClipboardEvent(file: File | null): ClipboardEvent {
  const items = file ? [{ kind: "file", getAsFile: () => file }] : [];
  return {
    clipboardData: { items },
    preventDefault: vi.fn(),
  } as unknown as ClipboardEvent;
}

describe("useFilePaste", () => {
  it("returns handlePaste function", () => {
    const { result } = renderHook(() =>
      useFilePaste({ insertTextAtCursor: stableInsert, replacePlaceholder: stableReplace, toast: stableToast })
    );
    expect(result.current.handlePaste).toBeTypeOf("function");
  });

  it("handlePaste uploads image and inserts markdown", async () => {
    mockUploadFile.mockResolvedValue({ url: "https://example.com/img.png", content_type: "image/png", name: "img.png" });
    const file = new File(["data"], "img.png", { type: "image/png" });
    const event = makeClipboardEvent(file);

    const { result } = renderHook(() =>
      useFilePaste({ insertTextAtCursor: stableInsert, replacePlaceholder: stableReplace, toast: stableToast })
    );

    await act(async () => { await result.current.handlePaste(event); });
    expect(event.preventDefault).toHaveBeenCalled();
    expect(stableInsert).toHaveBeenCalledWith("file_uploading_abc12345");
    expect(stableReplace).toHaveBeenCalledWith("file_uploading_abc12345", "![PIC:img.png](https://example.com/img.png)");
  });

  it("handlePaste inserts video markdown for video files", async () => {
    mockUploadFile.mockResolvedValue({ url: "https://example.com/vid.mp4", content_type: "video/mp4", name: "vid.mp4" });
    const file = new File(["data"], "vid.mp4", { type: "video/mp4" });
    const event = makeClipboardEvent(file);

    const { result } = renderHook(() =>
      useFilePaste({ insertTextAtCursor: stableInsert, replacePlaceholder: stableReplace, toast: stableToast })
    );

    await act(async () => { await result.current.handlePaste(event); });
    expect(stableReplace).toHaveBeenCalledWith("file_uploading_abc12345", "![VIDEO:vid.mp4](https://example.com/vid.mp4)");
  });

  it("handlePaste inserts audio markdown for audio files", async () => {
    mockUploadFile.mockResolvedValue({ url: "https://example.com/a.mp3", content_type: "audio/mp3", name: "a.mp3" });
    const file = new File(["data"], "a.mp3", { type: "audio/mp3" });
    const event = makeClipboardEvent(file);

    const { result } = renderHook(() =>
      useFilePaste({ insertTextAtCursor: stableInsert, replacePlaceholder: stableReplace, toast: stableToast })
    );

    await act(async () => { await result.current.handlePaste(event); });
    expect(stableReplace).toHaveBeenCalledWith("file_uploading_abc12345", "![AUDIO:a.mp3](https://example.com/a.mp3)");
  });

  it("handlePaste inserts file link for unknown types", async () => {
    mockUploadFile.mockResolvedValue({ url: "https://example.com/doc.pdf", content_type: "application/pdf", name: "doc.pdf" });
    const file = new File(["data"], "doc.pdf", { type: "application/pdf" });
    const event = makeClipboardEvent(file);

    const { result } = renderHook(() =>
      useFilePaste({ insertTextAtCursor: stableInsert, replacePlaceholder: stableReplace, toast: stableToast })
    );

    await act(async () => { await result.current.handlePaste(event); });
    expect(stableReplace).toHaveBeenCalledWith("file_uploading_abc12345", "[FILE:doc.pdf](https://example.com/doc.pdf)");
  });

  it("handlePaste handles upload error", async () => {
    mockUploadFile.mockRejectedValue(new Error("Upload failed"));
    const file = new File(["data"], "img.png", { type: "image/png" });
    const event = makeClipboardEvent(file);

    const { result } = renderHook(() =>
      useFilePaste({ insertTextAtCursor: stableInsert, replacePlaceholder: stableReplace, toast: stableToast })
    );

    await act(async () => { await result.current.handlePaste(event); });
    expect(stableReplace).toHaveBeenCalledWith("file_uploading_abc12345", "");
    expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
  });

  it("handlePaste ignores events without files", async () => {
    const event = { clipboardData: { items: [{ kind: "string" }] }, preventDefault: vi.fn() } as unknown as ClipboardEvent;

    const { result } = renderHook(() =>
      useFilePaste({ insertTextAtCursor: stableInsert, replacePlaceholder: stableReplace, toast: stableToast })
    );

    await act(async () => { await result.current.handlePaste(event); });
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(stableInsert).not.toHaveBeenCalled();
  });

  it("resolves audio type from extension when content_type is octet-stream", async () => {
    mockUploadFile.mockResolvedValue({ url: "https://example.com/a.wav", content_type: "application/octet-stream", name: "a.wav" });
    const file = new File(["data"], "a.wav", { type: "application/octet-stream" });
    const event = makeClipboardEvent(file);

    const { result } = renderHook(() =>
      useFilePaste({ insertTextAtCursor: stableInsert, replacePlaceholder: stableReplace, toast: stableToast })
    );

    await act(async () => { await result.current.handlePaste(event); });
    expect(stableReplace).toHaveBeenCalledWith("file_uploading_abc12345", "![AUDIO:a.wav](https://example.com/a.wav)");
  });

  it("resolves video type from extension when content_type is octet-stream", async () => {
    mockUploadFile.mockResolvedValue({ url: "https://example.com/v.webm", content_type: "application/octet-stream", name: "v.webm" });
    const file = new File(["data"], "v.webm", { type: "application/octet-stream" });
    const event = makeClipboardEvent(file);

    const { result } = renderHook(() =>
      useFilePaste({ insertTextAtCursor: stableInsert, replacePlaceholder: stableReplace, toast: stableToast })
    );

    await act(async () => { await result.current.handlePaste(event); });
    expect(stableReplace).toHaveBeenCalledWith("file_uploading_abc12345", "![VIDEO:v.webm](https://example.com/v.webm)");
  });
});
