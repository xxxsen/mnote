import { expect, test } from "@playwright/test";

test.describe("Markdown Preview Extensions", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/test-markdown", { waitUntil: "domcontentloaded" });
        await page.waitForSelector(".markdown-body", { timeout: 15_000 });
    });

    test("span with inline color style renders correctly", async ({ page }, testInfo) => {
        const spanColor = page.getByText("Span Color");
        await expect(spanColor).toBeVisible();
        await expect(spanColor).toHaveCSS("color", "rgb(239, 68, 68)");

        await page.screenshot({
            path: testInfo.outputPath("span-color.png"),
            fullPage: true,
        });
    });

    test("span with inline font-size style renders correctly", async ({ page }, testInfo) => {
        const spanSize = page.getByText("Span Size");
        await expect(spanSize).toBeVisible();
        await expect(spanSize).toHaveCSS("font-size", "24px");

        await page.screenshot({
            path: testInfo.outputPath("span-fontsize.png"),
            fullPage: true,
        });
    });

    test("font tag with color and size renders correctly", async ({ page }, testInfo) => {
        const fontTagText = page.getByText("Font Color and Size");
        await expect(fontTagText).toBeVisible();
        await expect(fontTagText).toHaveCSS("color", "rgb(0, 128, 0)");
        await expect(fontTagText).toHaveCSS("font-size", "16px");

        await page.screenshot({
            path: testInfo.outputPath("font-tag.png"),
            fullPage: true,
        });
    });

    test("warning admonition block renders correctly", async ({ page }, testInfo) => {
        const warning = page.locator(".md-alert-warning");
        await expect(warning).toBeVisible();
        await expect(warning).toContainText("这里是被包裹的内容");

        // Verify warning styling
        await expect(warning).toHaveCSS("border-left-color", "rgb(245, 158, 11)");
        await expect(warning).toHaveCSS("background-color", "rgb(255, 251, 235)");

        await page.screenshot({
            path: testInfo.outputPath("warning-admonition.png"),
            fullPage: true,
        });
    });
});
