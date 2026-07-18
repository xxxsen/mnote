import { expect, test } from "@playwright/test";
import {
  createDocument,
  deleteDocument,
  loginTestUser,
  openEditor,
} from "./editor-helpers";

test("mobile editor keeps details as an overlay and exposes named toolbar controls", async ({
  page,
}) => {
  const token = await loginTestUser(page);
  const document = await createDocument(page, token, "# Mobile note\nbody");
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await openEditor(page, document.id);
    await expect(
      page.getByRole("toolbar", { name: "Markdown formatting" }),
    ).toBeVisible();
    for (const name of [
      "Undo",
      "Redo",
      "Heading 1",
      "Bold",
      "Italic",
      "Link",
      "More formatting",
    ]) {
      await expect(page.getByRole("button", { name })).toBeVisible();
    }

    await page.getByRole("button", { name: "Show details" }).click();
    await expect(
      page.getByRole("dialog", { name: "Document details" }),
    ).toBeVisible();
    await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Document details" }),
    ).toBeHidden();
  } finally {
    await deleteDocument(page, token, document.id);
  }
});

test("desktop context is a non-modal layout rail at 1280px", async ({
  page,
}) => {
  const token = await loginTestUser(page);
  const document = await createDocument(page, token, "# Dock note\nbody");
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openEditor(page, document.id);
    const dock = page.getByRole("complementary", { name: "Document context" });
    await expect(dock).toBeVisible();
    await expect(
      dock.getByRole("navigation", { name: "Note outline" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Show details" }).click();
    for (const tabName of ["Summary", "History", "Share"]) {
      await expect(dock.getByRole("tab", { name: tabName })).toBeVisible();
    }
    await expect(
      dock.getByRole("navigation", { name: "Note outline" }),
    ).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(dock).toBeVisible();
    await page.getByRole("button", { name: "Show outline" }).click();
    await expect(
      dock.getByRole("navigation", { name: "Note outline" }),
    ).toBeVisible();
    await expect(dock.getByRole("tab", { name: "Summary" })).toBeHidden();
    await page
      .getByRole("button", { name: "Collapse document context rail" })
      .click();
    await expect(
      page.getByTestId("editor-context-rail-collapsed"),
    ).toBeVisible();
  } finally {
    await deleteDocument(page, token, document.id);
  }
});

test("Split panes retain their 420px minimum beside the docked rail", async ({
  page,
}) => {
  const token = await loginTestUser(page);
  const document = await createDocument(page, token, "# Split note\nbody");
  try {
    await page.setViewportSize({ width: 1366, height: 820 });
    await openEditor(page, document.id);
    await page.getByRole("button", { name: "Split view" }).click();

    const separator = page.getByRole("separator", {
      name: "Resize editor and preview",
    });
    const editor = page.getByRole("region", { name: "Markdown editor" });
    const preview = page.getByRole("region", { name: "Markdown preview" });
    const separatorBox = await separator.boundingBox();
    expect(separatorBox).not.toBeNull();

    await page.mouse.move(
      (separatorBox?.x ?? 0) + (separatorBox?.width ?? 0) / 2,
      (separatorBox?.y ?? 0) + (separatorBox?.height ?? 0) / 2,
    );
    await page.mouse.down();
    await page.mouse.move(0, (separatorBox?.y ?? 0) + 20);
    await page.mouse.up();
    await expect
      .poll(async () => (await editor.boundingBox())?.width ?? 0)
      .toBeGreaterThanOrEqual(419.5);

    const rail = page.getByTestId("editor-context-rail");
    const railBox = await rail.boundingBox();
    await page.mouse.move(
      (await separator.boundingBox())?.x ?? 0,
      (separatorBox?.y ?? 0) + 20,
    );
    await page.mouse.down();
    await page.mouse.move(
      (railBox?.x ?? 0) - 1,
      (separatorBox?.y ?? 0) + 20,
    );
    await page.mouse.up();
    await expect
      .poll(async () => (await preview.boundingBox())?.width ?? 0)
      .toBeGreaterThanOrEqual(419.5);
  } finally {
    await deleteDocument(page, token, document.id);
  }
});

test("mobile More sheet has dialog semantics and closes with Escape", async ({
  page,
}) => {
  const token = await loginTestUser(page);
  const document = await createDocument(page, token, "# Toolbar note\nbody");
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await openEditor(page, document.id);
    await page.getByRole("button", { name: "More formatting" }).click();
    const sheet = page.getByRole("dialog", { name: "More formatting" });
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  } finally {
    await deleteDocument(page, token, document.id);
  }
});

test("context drawer becomes a rail across the 1280px breakpoint without reopening", async ({
  page,
}) => {
  const token = await loginTestUser(page);
  const document = await createDocument(
    page,
    token,
    "# Responsive context\nbody",
  );
  try {
    await page.setViewportSize({ width: 1180, height: 820 });
    await openEditor(page, document.id);
    await expect(page.getByTestId("editor-context-rail")).toBeHidden();
    const trigger = page.getByRole("button", { name: "Open outline" });
    await trigger.click();
    const drawer = page.getByRole("dialog", {
      name: "Outline",
    });
    await expect(drawer).toBeVisible();
    await expect
      .poll(async () => (await drawer.boundingBox())?.width ?? 0)
      .toBeLessThanOrEqual(385);

    await page.setViewportSize({ width: 800, height: 820 });
    await expect
      .poll(async () => (await drawer.boundingBox())?.width ?? 0)
      .toBeGreaterThanOrEqual(799);

    await page.setViewportSize({ width: 1366, height: 820 });
    await expect(
      page.getByRole("dialog", { name: "Outline" }),
    ).toBeHidden();
    await expect(page.getByTestId("editor-context-rail")).toBeVisible();

    await page.setViewportSize({ width: 1180, height: 820 });
    await expect(page.getByTestId("editor-context-rail")).toBeHidden();
    await expect(
      page.getByRole("dialog", { name: "Outline" }),
    ).toBeHidden();
  } finally {
    await deleteDocument(page, token, document.id);
  }
});
