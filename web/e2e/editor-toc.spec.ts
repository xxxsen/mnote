import { expect, test } from "@playwright/test";
import {
  createDocument,
  deleteDocument,
  loginTestUser,
  openEditor,
} from "./editor-helpers";

test("tracks the active TOC section from editor and preview scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const token = await loginTestUser(page);
  const sections = Array.from({ length: 24 }, (_, index) => {
    const number = index + 1;
    return `## Section ${number}\n${Array.from({ length: 8 }, () => `Section ${number} body`).join("\n\n")}`;
  });
  const content = [
    "# Intro",
    "[toc]",
    "Intro body",
    ...sections,
    "## Repeat",
    "First repeated section",
    "## Repeat",
    "Final repeated section",
  ].join("\n\n");
  const document = await createDocument(page, token, content);

  try {
    await openEditor(page, document.id);
    const currentLink = page.locator(
      '.floating-toc a[aria-current="location"]',
    );
    await expect(currentLink).toHaveText("Intro");

    await page.getByRole("button", { name: "Scroll sync on" }).click();
    await expect(
      page.getByRole("button", { name: "Scroll sync off" }),
    ).toHaveAttribute("aria-pressed", "false");

    const preview = page.getByRole("region", { name: "Markdown preview" });
    const previewScrollTop = await preview.evaluate(
      (element) => element.scrollTop,
    );
    await page.locator(".cm-scroller").evaluate((element) => {
      element.scrollTop = element.scrollHeight * 0.55;
      element.dispatchEvent(new Event("scroll"));
    });
    await expect.poll(async () => currentLink.textContent()).not.toBe("Intro");
    expect(await preview.evaluate((element) => element.scrollTop)).toBe(
      previewScrollTop,
    );

    await page.getByRole("button", { name: "Preview view" }).click();
    await expect(preview).toBeVisible();
    await preview.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event("scroll"));
    });

    const finalLink = page.locator(
      '.floating-toc a[data-toc-id="repeat-1"]',
    );
    await expect(finalLink).toHaveAttribute("aria-current", "location");
    await expect(finalLink).toHaveClass(/toc-active/);
    await expect
      .poll(() =>
        page
          .locator(".custom-scrollbar")
          .evaluate((element) => element.scrollTop),
      )
      .toBeGreaterThan(0);
  } finally {
    await deleteDocument(page, token, document.id);
  }
});
