import { describe, expect, it } from "vitest";

import { buildOutline } from "../helpers";

describe("buildOutline", () => {
  it("builds structured H1-H6 entries with source lines", () => {
    const markdown = [
      "# H1",
      "## H2",
      "### H3",
      "#### H4",
      "##### H5",
      "###### H6",
    ].join("\n");
    expect(buildOutline(markdown)).toEqual([
      { level: 1, text: "H1", id: "h1", sourceLine: 1 },
      { level: 2, text: "H2", id: "h2", sourceLine: 2 },
      { level: 3, text: "H3", id: "h3", sourceLine: 3 },
      { level: 4, text: "H4", id: "h4", sourceLine: 4 },
      { level: 5, text: "H5", id: "h5", sourceLine: 5 },
      { level: 6, text: "H6", id: "h6", sourceLine: 6 },
    ]);
  });

  it("uses rendered heading text and stable duplicate slugs", () => {
    const outline = buildOutline(
      "# **Install** [guide](https://example.com)\n## Install guide\n# **Install** [guide](https://example.com)",
    );
    expect(outline).toEqual([
      { level: 1, text: "Install guide", id: "install-guide", sourceLine: 1 },
      { level: 2, text: "Install guide", id: "install-guide-1", sourceLine: 2 },
      { level: 1, text: "Install guide", id: "install-guide-2", sourceLine: 3 },
    ]);
  });

  it("ignores backtick and tilde fences", () => {
    const outline = buildOutline(
      "# Visible\n````md\n## Hidden\n````\n~~~\n### Also hidden\n~~~\n## Visible two",
    );
    expect(outline).toEqual([
      { level: 1, text: "Visible", id: "visible", sourceLine: 1 },
      { level: 2, text: "Visible two", id: "visible-two", sourceLine: 8 },
    ]);
  });

  it("keeps empty headings navigable without requiring a toc token", () => {
    expect(buildOutline("#\n\nPlain text\n\n## Named\n\n# ###")).toEqual([
      { level: 1, text: "Untitled section", id: "section", sourceLine: 1 },
      { level: 2, text: "Named", id: "named", sourceLine: 5 },
      { level: 1, text: "Untitled section", id: "section-1", sourceLine: 7 },
    ]);
    expect(buildOutline("# Outline without token")).toHaveLength(1);
  });
});
