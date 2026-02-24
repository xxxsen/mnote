import { expect, test } from "@playwright/test";

test("markdown preview supports font/span styling and warning container", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.goto("/test-markdown", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".markdown-body", { timeout: 15_000 });

  const spanColor = page.getByText("Span Color");
  await expect(spanColor).toBeVisible();
  await expect(spanColor).toHaveCSS("color", "rgb(239, 68, 68)");

  const spanSize = page.getByText("Span Size");
  await expect(spanSize).toBeVisible();
  await expect(spanSize).toHaveCSS("font-size", "24px");

  const fontTagText = page.getByText("Font Color and Size");
  await expect(fontTagText).toBeVisible();
  await expect(fontTagText).toHaveCSS("color", "rgb(0, 128, 0)");
  await expect(fontTagText).toHaveCSS("font-size", "16px");

  const warning = page.locator(".md-alert-warning");
  await expect(warning).toBeVisible();
  await expect(warning).toContainText("这里是被包裹的内容");

  await page.screenshot({ path: testInfo.outputPath("markdown-preview-extensions.png"), fullPage: true });
});
