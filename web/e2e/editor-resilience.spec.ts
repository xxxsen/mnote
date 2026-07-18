import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createDocument,
  deleteDocument,
  loginTestUser,
  openEditor,
  replaceEditorContent,
} from "./editor-helpers";

async function editorText(page: Page): Promise<string> {
  return page.locator(".cm-content").evaluate((element) => {
    const content = element.cloneNode(true) as HTMLElement;
    content.querySelectorAll(".cm-placeholder").forEach((node) => node.remove());
    return Array.from(content.querySelectorAll(".cm-line"))
      .map((line) => line.textContent || "")
      .join("\n");
  });
}

async function expectInsideViewport(locator: Locator, page: Page): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
}

test("requires a decision for a legacy local draft, including empty content", async ({ page }) => {
  const token = await loginTestUser(page);
  const document = await createDocument(page, token, "# Legacy draft\nserver body");
  try {
    await page.evaluate((id) => {
      localStorage.setItem(`mnote:draft:${id}`, JSON.stringify({
        content: "",
        updatedAt: Date.now(),
      }));
    }, document.id);

    await page.goto(`/docs/${document.id}`);
    const dialog = page.getByRole("dialog", { name: "Recover local draft" });
    await expect(dialog).toBeVisible();
    await expect(page.locator(".cm-content")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Recover local draft" }).click();
    await expect(page.locator(".cm-content")).toHaveCount(1);
    await expect.poll(() => editorText(page)).toBe("");
    await expect(page.getByTestId("editor-save-status")).toContainText("add a title");
  } finally {
    await deleteDocument(page, token, document.id);
  }
});

test("preserves the draft on a failed save and retries explicitly", async ({ page }) => {
  const token = await loginTestUser(page);
  const document = await createDocument(page, token, "# Retry note\nserver body");
  let failSave = true;
  await page.route(`**/api/v1/documents/${document.id}`, async (route) => {
    if (route.request().method() === "PUT" && failSave) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ code: 999999, message: "forced save failure", data: null }),
      });
      return;
    }
    await route.continue();
  });

  try {
    await openEditor(page, document.id);
    await replaceEditorContent(page, "# Retry note\nlocal body survives");
    await page.keyboard.press(process.platform === "darwin" ? "Meta+S" : "Control+S");
    const status = page.getByTestId("editor-save-status");
    await expect(status).toHaveAttribute("data-status", "ERROR");
    await expect.poll(() => page.evaluate((id) => localStorage.getItem(`mnote:draft:${id}`), document.id))
      .toContain("local body survives");

    failSave = false;
    await status.click();
    await expect(status).toHaveAttribute("data-status", "SYNCED");
  } finally {
    await page.unroute(`**/api/v1/documents/${document.id}`);
    await deleteDocument(page, token, document.id);
  }
});

test("semantic heading and list commands replace markers without touching the next line", async ({ page }) => {
  const token = await loginTestUser(page);
  const document = await createDocument(page, token, "## Heading\n- first\n- second\nuntouched");
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openEditor(page, document.id);
    const editor = page.locator(".cm-content");
    await editor.click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+Home" : "Control+Home");
    await page.keyboard.press("Shift+End");
    await page.getByRole("button", { name: "Heading 1" }).click();
    await expect.poll(() => editorText(page)).toBe("# Heading\n- first\n- second\nuntouched");

    await editor.click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+Home" : "Control+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Shift+ArrowDown");
    await page.getByRole("button", { name: "Ordered List" }).click();
    await expect.poll(() => editorText(page)).toBe("# Heading\n1. first\n2. second\nuntouched");
  } finally {
    await deleteDocument(page, token, document.id);
  }
});

test("mobile More exposes emoji, color, size, theme and preview inside the viewport", async ({ page }) => {
  const token = await loginTestUser(page);
  const document = await createDocument(page, token, "# Mobile appearance\nbody");
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await openEditor(page, document.id);
    await page.getByRole("button", { name: "More formatting" }).click();
    const sheet = page.getByRole("dialog", { name: "More formatting" });

    await sheet.getByRole("button", { name: "Emoji", exact: true }).click();
    await expectInsideViewport(sheet.getByRole("group", { name: "Emoji picker" }), page);

    await sheet.getByRole("button", { name: "Text color", exact: true }).click();
    await expectInsideViewport(sheet.getByRole("group", { name: "Text color picker" }), page);

    await sheet.getByRole("button", { name: "Font size", exact: true }).click();
    await expectInsideViewport(sheet.getByRole("group", { name: "Font size picker" }), page);
    await expectInsideViewport(sheet.getByRole("combobox", { name: "Editor theme" }), page);
    await expect(sheet.getByRole("button", { name: "Full preview" })).toBeVisible();
  } finally {
    await deleteDocument(page, token, document.id);
  }
});

test("structured scroll sync follows sections in both directions and can be disabled", async ({ page }) => {
  const token = await loginTestUser(page);
  const content = Array.from(
    { length: 40 },
    (_, index) => `## Section ${index + 1}\nparagraph ${index + 1}\n\n- one\n- two\n`,
  ).join("\n");
  const document = await createDocument(page, token, `# Scroll note\n\n${content}`);
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openEditor(page, document.id);
    const editorScroller = page.locator(".cm-scroller");
    const preview = page.getByRole("region", { name: "Markdown preview" });

    await editorScroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await expect.poll(() => preview.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

    await preview.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await expect.poll(() => editorScroller.evaluate((element) => element.scrollTop)).toBeLessThan(100);

    await page.getByRole("button", { name: "Scroll sync on" }).click();
    const before = await editorScroller.evaluate((element) => element.scrollTop);
    await preview.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await page.waitForTimeout(100);
    expect(await editorScroller.evaluate((element) => element.scrollTop)).toBe(before);
  } finally {
    await deleteDocument(page, token, document.id);
  }
});

test("a 100k character document publishes the final preview update within 1.5 seconds", async ({ page }) => {
  test.setTimeout(60_000);
  const token = await loginTestUser(page);
  const largeParagraph = "word ".repeat(20_500);
  const document = await createDocument(page, token, `# Large note\n\n${largeParagraph}`);
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openEditor(page, document.id);
    const editor = page.locator(".cm-content");
    await editor.click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+End" : "Control+End");
    await page.keyboard.insertText("\n\n## Final preview marker\nready");
    await expect(
      page.getByRole("region", { name: "Markdown preview" })
        .getByRole("heading", { name: "Final preview marker" }),
    ).toBeVisible({ timeout: 1_500 });
  } finally {
    await deleteDocument(page, token, document.id);
  }
});
