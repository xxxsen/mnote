import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Dialog } from "@/components/ui/dialog";

afterEach(cleanup);

describe("Dialog drawer width", () => {
  it("uses the semantic compact width without changing other drawers", () => {
    const { rerender } = render(
      <Dialog open title="Context" variant="drawer" drawerWidth="compact">
        Context
      </Dialog>,
    );
    expect(screen.getByRole("dialog").className).toContain("lg:max-w-96");

    rerender(
      <Dialog open title="Default" variant="drawer">
        Default
      </Dialog>,
    );
    expect(screen.getByRole("dialog").className).toContain("sm:max-w-md");
  });
});
