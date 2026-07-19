import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { IconButton } from "../icon-button";

afterEach(cleanup);

describe("IconButton", () => {
  it("requires a visible accessibility contract for stateful icon actions", () => {
    render(
      <IconButton label="Show outline" pressed expanded>
        <span aria-hidden="true">O</span>
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "Show outline" });
    expect(button.getAttribute("title")).toBe("Show outline");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.className).toContain("h-11");
    expect(button.className).toContain("sm:h-10");
  });
});
