import { expect, test } from "@playwright/test";
import {
  createDocument,
  deleteDocument,
  loginTestUser,
  openEditor,
  replaceEditorContent,
} from "./editor-helpers";

test("flushes a draft on immediate navigation, including an empty document", async ({
  page,
}) => {
  const token = await loginTestUser(page);
  const document = await createDocument(page, token, "# Draft safety\nserver");
  try {
    await openEditor(page, document.id);
    await replaceEditorContent(page, "# Draft safety\nlocal latest");
    await page.getByRole("button", { name: "Back to notes" }).click();
    await openEditor(page, document.id);
    await expect(page.locator(".cm-content")).toContainText("local latest");

    await replaceEditorContent(page, "");
    await page.goto("/docs");
    await openEditor(page, document.id);
    await expect(page.locator(".cm-content .cm-line")).toHaveCount(1);
    await expect
      .poll(async () =>
        page.locator(".cm-content").evaluate((element) => {
          const content = element.cloneNode(true) as HTMLElement;
          content
            .querySelectorAll(".cm-placeholder")
            .forEach((node) => node.remove());
          return content.textContent;
        }),
      )
      .toBe("");
    await expect(page.getByTestId("editor-save-status")).toContainText(
      "add a title",
    );
  } finally {
    await deleteDocument(page, token, document.id);
  }
});

test("requires an explicit decision when two clients save the same base revision", async ({
  browser,
  page,
}) => {
  const token = await loginTestUser(page);
  const document = await createDocument(page, token, "# Conflict note\nbase");
  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  try {
    await loginTestUser(secondPage);
    await openEditor(page, document.id);
    await openEditor(secondPage, document.id);

    await replaceEditorContent(page, "# Conflict note\nsaved by A");
    await page.keyboard.press(
      process.platform === "darwin" ? "Meta+S" : "Control+S",
    );
    await expect(page.getByTestId("editor-save-status")).toHaveAttribute(
      "data-status",
      "SYNCED",
    );

    await replaceEditorContent(secondPage, "# Conflict note\nsaved by B");
    await secondPage.keyboard.press(
      process.platform === "darwin" ? "Meta+S" : "Control+S",
    );
    const dialog = secondPage.getByRole("dialog", {
      name: "Resolve save conflict",
    });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("saved by A");
    await expect(dialog).toContainText("saved by B");

    await dialog.getByRole("button", { name: "Use server version" }).click();
    await expect(secondPage.locator(".cm-content")).toContainText("saved by A");
  } finally {
    await secondContext.close();
    await deleteDocument(page, token, document.id);
  }
});

test("persists split ratio after pointer and keyboard resizing", async ({
  page,
}) => {
  const token = await loginTestUser(page);
  const document = await createDocument(page, token, "# Split note\nbody");
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openEditor(page, document.id);
    const separator = page.getByRole("separator", {
      name: "Resize editor and preview",
    });
    const containerBox = await separator.locator("..").boundingBox();
    if (!containerBox) throw new Error("Split pane container is not visible");
    const separatorBox = await separator.boundingBox();
    if (!separatorBox) throw new Error("Split pane separator is not visible");
    await page.mouse.move(
      separatorBox.x + separatorBox.width / 2,
      separatorBox.y + separatorBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      containerBox.x + containerBox.width * 0.7,
      separatorBox.y + separatorBox.height / 2,
    );
    await page.mouse.up();
    await expect(separator).toHaveAttribute("aria-valuenow", "70");

    await separator.focus();
    await page.keyboard.press("Home");
    await expect(separator).toHaveAttribute("aria-valuenow", "30");
    await page.reload();
    await expect(
      page.getByRole("separator", { name: "Resize editor and preview" }),
    ).toHaveAttribute("aria-valuenow", "30");
  } finally {
    await deleteDocument(page, token, document.id);
  }
});

test("uses Edit and Preview switching below the desktop breakpoint", async ({
  page,
}) => {
  const token = await loginTestUser(page);
  const document = await createDocument(page, token, "# Compact note\nbody");
  try {
    await page.setViewportSize({ width: 1023, height: 900 });
    await openEditor(page, document.id);
    await expect(page.getByRole("separator")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Markdown editor" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Markdown preview" })).toHaveCount(0);

    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.getByRole("region", { name: "Markdown preview" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Markdown editor" })).toHaveCount(0);

    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("region", { name: "Markdown editor" })).toBeVisible();
  } finally {
    await deleteDocument(page, token, document.id);
  }
});
