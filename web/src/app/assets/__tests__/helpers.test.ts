import { describe, expect, it } from "vitest";

import { assetMarkdown, formatAssetSize, resolveAssetURL } from "../helpers";

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
});
