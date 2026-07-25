import { expect, test } from "@playwright/test";

import {
  createDocument,
  deleteDocument,
  loginTestUser,
  openEditor,
  replaceEditorContent,
} from "./editor-helpers";

test("shows saved incoming, outgoing, mutual, and draft relation states", async ({
  page,
}) => {
  const token = await loginTestUser(page);
  const target = await createDocument(
    page,
    token,
    "# Linked target\nTarget body",
  );
  const source = await createDocument(
    page,
    token,
    `# Linked source\n[Target](/docs/${target.id})`,
  );
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openEditor(page, source.id);
    const linkedNotesTrigger = page.getByRole("button", {
      name: "Open linked notes, 1 linked notes",
    });
    await expect(linkedNotesTrigger).toBeVisible();
    await page.reload();
    await expect(linkedNotesTrigger).toBeVisible();

    const editor = page.getByRole("region", { name: "Markdown editor" });
    const editorWidth = (await editor.boundingBox())?.width;
    await linkedNotesTrigger.click();
    const popover = page.getByRole("dialog", { name: "Linked notes" });
    await expect(popover).toHaveAttribute("aria-modal", "false");
    await popover.getByRole("tab", { name: /Outgoing 1/ }).click();
    await expect(
      popover.getByRole("button", { name: "Preview Linked target" }),
    ).toBeVisible();
    expect((await editor.boundingBox())?.width).toBe(editorWidth);

    const rail = page.getByTestId("editor-context-rail");
    const [popoverBox, railBox] = await Promise.all([
      popover.boundingBox(),
      rail.boundingBox(),
    ]);
    expect((popoverBox?.x ?? 0) + (popoverBox?.width ?? 0)).toBeLessThanOrEqual(
      (railBox?.x ?? Number.POSITIVE_INFINITY) + 1,
    );

    await popover
      .getByRole("button", { name: "Open Linked target" })
      .click();
    await expect(page).toHaveURL(new RegExp(`/docs/${target.id}$`));
    await page
      .getByRole("button", { name: /Open linked notes/ })
      .click();
    const targetPopover = page.getByRole("dialog", {
      name: "Linked notes",
    });
    await expect(
      targetPopover.getByRole("button", { name: "Preview Linked source" }),
    ).toBeVisible();

    await replaceEditorContent(
      page,
      `# Linked target\n[Source](/docs/${source.id})`,
    );
    await page.keyboard.press(
      process.platform === "darwin" ? "Meta+S" : "Control+S",
    );
    await expect(page.getByTestId("editor-save-status")).toHaveAttribute(
      "data-status",
      "SYNCED",
    );
    await page
      .getByRole("button", { name: /Open linked notes/ })
      .click();
    const mutualPopover = page.getByRole("dialog", {
      name: "Linked notes",
    });
    await expect(
      mutualPopover.getByRole("tabpanel").getByText("Mutual"),
    ).toBeVisible();

    await replaceEditorContent(page, "# Linked target\nDraft without link");
    await page
      .getByRole("button", { name: /Open linked notes/ })
      .click();
    const draftPopover = page.getByRole("dialog", {
      name: "Linked notes",
    });
    await expect(
      draftPopover.getByText("Save this note to update linked notes."),
    ).toBeVisible();
    await expect(
      draftPopover.getByRole("button", { name: "Preview Linked source" }),
    ).toBeVisible();

    await page.keyboard.press(
      process.platform === "darwin" ? "Meta+S" : "Control+S",
    );
    await expect(page.getByTestId("editor-save-status")).toHaveAttribute(
      "data-status",
      "SYNCED",
    );
    await expect(
      draftPopover.getByText("Save this note to update linked notes."),
    ).toBeHidden();
    await draftPopover.getByRole("tab", { name: /Outgoing 0/ }).click();
    await expect(
      draftPopover.getByText("Type [[ in the editor to link another note."),
    ).toBeVisible();
  } finally {
    await deleteDocument(page, token, source.id);
    await deleteDocument(page, token, target.id);
  }
});

test("uses the More menu and one shared drawer below 1024px", async ({
  page,
}) => {
  const token = await loginTestUser(page);
  const target = await createDocument(page, token, "# Mobile linked target");
  const source = await createDocument(
    page,
    token,
    `# Mobile linked source\n[Target](/docs/${target.id})`,
  );
  try {
    await page.setViewportSize({ width: 1023, height: 820 });
    await openEditor(page, source.id);
    await expect(
      page.getByRole("button", { name: /Open linked notes/ }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "More editor actions" })
      .click();
    await page.getByRole("menuitem", { name: "Linked notes" }).click();
    const drawer = page.getByRole("dialog", { name: "Linked notes" });
    await expect(drawer).toHaveAttribute("aria-modal", "true");
    await expect(page.getByRole("dialog", { name: "Linked notes" })).toHaveCount(
      1,
    );
    await drawer.getByRole("tab", { name: /Outgoing 1/ }).click();
    await expect(drawer.getByText("Mobile linked target")).toBeVisible();
    await drawer.getByRole("button", { name: "Close" }).click();

    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await page
      .getByRole("button", { name: "More editor actions" })
      .click();
    await page
      .getByRole("menuitem", { name: "Linked notes (1)" })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Linked notes" }),
    ).toBeVisible();
  } finally {
    await deleteDocument(page, token, source.id);
    await deleteDocument(page, token, target.id);
  }
});

test("keeps editing available when linked notes fail and Retry recovers", async ({
  page,
}) => {
  const token = await loginTestUser(page);
  const document = await createDocument(page, token, "# Link failure\nbody");
  const routePattern = `**/api/v1/documents/${document.id}/links?**`;
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route(routePattern, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ code: 10000000, message: "temporary" }),
      });
    });
    await openEditor(page, document.id);
    await page
      .getByRole("button", { name: "Open linked notes", exact: true })
      .click();
    const popover = page.getByRole("dialog", { name: "Linked notes" });
    await expect(
      popover.getByRole("tabpanel").getByText("Linked notes unavailable"),
    ).toBeVisible();
    await replaceEditorContent(page, "# Link failure\nstill editable");
    await page
      .getByRole("button", { name: /Open linked notes/ })
      .click();
    await expect(
      popover.getByRole("tabpanel").getByText("Linked notes unavailable"),
    ).toBeVisible();
    await page.unroute(routePattern);
    await popover.getByRole("button", { name: "Retry" }).click();
    await expect(
      popover.getByText("No notes link to this note yet."),
    ).toBeVisible();
  } finally {
    await deleteDocument(page, token, document.id);
  }
});
