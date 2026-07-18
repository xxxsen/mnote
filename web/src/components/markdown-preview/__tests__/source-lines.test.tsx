import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import MarkdownPreview, { buildOutline } from "../index";

afterEach(cleanup);

describe("MarkdownPreview source line markers", () => {
  it("uses the structured Outline IDs for rendered headings", () => {
    const content =
      "# **Install** [guide](https://example.com)\n\n## Install guide";
    const outline = buildOutline(content);
    const { container } = render(
      <MarkdownPreview content={content} outline={outline} />,
    );
    expect(
      Array.from(container.querySelectorAll("h1, h2")).map(
        (heading) => heading.id,
      ),
    ).toEqual(outline.map((entry) => entry.id));
  });

  it("marks block nodes with their markdown source line", () => {
    const { container } = render(
      <MarkdownPreview content={"# Heading\n\nParagraph\n\n- Item\n\n> Quote"} />,
    );
    expect(container.querySelector("h1")?.getAttribute("data-source-line")).toBe("1");
    expect(container.querySelector("p")?.getAttribute("data-source-line")).toBe("3");
    expect(container.querySelector("li")?.getAttribute("data-source-line")).toBe("5");
    expect(container.querySelector("blockquote")?.getAttribute("data-source-line")).toBe("7");
  });
});
