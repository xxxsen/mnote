import { expect, test } from "@playwright/test";
import {
  createDocument,
  deleteDocument,
  loginTestUser,
  openEditor,
} from "./editor-helpers";

test("mobile editor keeps details as an overlay and exposes named toolbar controls", async ({ page }) => {
  const token = await loginTestUser(page);
  const document = await createDocument(page, token, "# Mobile note\nbody");
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await openEditor(page, document.id);
    await expect(page.getByRole("toolbar", { name: "Markdown formatting" })).toBeVisible();
    for (const name of ["Undo", "Redo", "Heading 1", "Bold", "Italic", "Link", "More formatting"]) {
      await expect(page.getByRole("button", { name })).toBeVisible();
    }

    await page.getByRole("button", { name: "Show details" }).click();
    await expect(page.getByRole("dialog", { name: "Document details" })).toBeVisible();
    await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Document details" })).toBeHidden();
  } finally {
    await deleteDocument(page, token, document.id);
  }
});

test("desktop details is a non-modal dock at 1440px", async ({ page }) => {
  const token = await loginTestUser(page);
  const document = await createDocument(page, token, "# Dock note\nbody");
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openEditor(page, document.id);
    await page.getByRole("button", { name: "Show details" }).click();
    const dock = page.getByRole("complementary", { name: "Document details" });
    await expect(dock).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dock).toBeVisible();
    await page.getByRole("button", { name: "Hide details" }).click();
    await expect(dock).toBeHidden();
  } finally {
    await deleteDocument(page, token, document.id);
  }
});

test("mobile More sheet has dialog semantics and closes with Escape", async ({ page }) => {
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
