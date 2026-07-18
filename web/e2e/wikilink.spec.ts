import { expect, test } from "@playwright/test";
import {
  createDocument,
  deleteDocument,
  loginTestUser,
  openEditor,
} from "./editor-helpers";

test("Wikilink menu supports keyboard selection", async ({ page }) => {
  const token = await loginTestUser(page);
  const target = await createDocument(page, token, "# Wikilink target\nbody");
  const source = await createDocument(page, token, "# Wikilink source\nbody");
  try {
    await openEditor(page, source.id);
    await page.locator(".cm-content").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.insertText("\n[[Wikilink target");
    const menu = page.getByRole("listbox", { name: "Link to note" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("option", { name: "Wikilink target" })).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await expect(page.locator(".cm-content")).toContainText("](/docs/");
  } finally {
    await deleteDocument(page, token, source.id);
    await deleteDocument(page, token, target.id);
  }
});
