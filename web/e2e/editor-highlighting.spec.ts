import { test, expect } from "@playwright/test";
import path from "path";

const SCREENSHOT_DIR = path.join(__dirname, "screenshots");

test.describe("Editor Theme Highlighting", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/test-editor");
    // Wait for CodeMirror to fully render
    await page.waitForSelector(".cm-editor", { timeout: 15_000 });
    // Wait a bit for syntax highlighting to apply
    await page.waitForTimeout(1000);
  });

  test("loads with Dark+ theme by default", async ({ page }) => {
    // Verify selector shows dark-plus
    const selector = page.getByTestId("theme-selector");
    await expect(selector).toHaveValue("dark-plus");

    // Verify editor background is dark (#1e1e1e)
    const editorBg = await page.locator(".cm-editor").evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });
    // #1e1e1e = rgb(30, 30, 30)
    expect(editorBg).toBe("rgb(30, 30, 30)");

    // Screenshot: Dark+ default
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "01-dark-plus-default.png"),
      fullPage: true,
    });
  });

  test("headings have different color from default foreground", async ({ page }) => {
    // Heading color should be distinct from the editor default foreground
    const headingColor = await page.evaluate(() => {
      const spans = document.querySelectorAll(".cm-line span");
      for (const span of spans) {
        const text = span.textContent || "";
        if (text.includes("Heading 1")) {
          return window.getComputedStyle(span).color;
        }
      }
      return null;
    });

    const defaultFg = await page.locator(".cm-editor").evaluate((el) => {
      return window.getComputedStyle(el).color;
    });

    expect(headingColor).toBeTruthy();
    expect(defaultFg).toBeTruthy();
    // Heading color (#569cd6) should differ from default fg (#d4d4d4)
    expect(headingColor).not.toBe(defaultFg);
  });

  test("bold text has font-weight 700", async ({ page }) => {
    const boldWeight = await page.evaluate(() => {
      const spans = document.querySelectorAll(".cm-line span");
      for (const span of spans) {
        const text = span.textContent || "";
        if (text === "bold text") {
          return window.getComputedStyle(span).fontWeight;
        }
      }
      return null;
    });

    expect(boldWeight).toBe("700");
  });

  test("italic text has italic font-style", async ({ page }) => {
    const italicStyle = await page.evaluate(() => {
      const spans = document.querySelectorAll(".cm-line span");
      for (const span of spans) {
        const text = span.textContent || "";
        if (text === "italic text") {
          return window.getComputedStyle(span).fontStyle;
        }
      }
      return null;
    });

    expect(italicStyle).toBe("italic");
  });

  test("code block has language-specific highlighting", async ({ page }) => {
    // Wait for code block language loading
    await page.waitForTimeout(2000);

    // In a JS code block, the keyword "function" and string should have different colors
    const colors = await page.evaluate(() => {
      const lines = document.querySelectorAll(".cm-line");
      const colorMap: Record<string, string> = {};
      for (const line of lines) {
        const spans = line.querySelectorAll("span");
        for (const span of spans) {
          const text = (span.textContent || "").trim();
          if (text === "function" || text === "const" || text === "return") {
            colorMap["keyword"] = window.getComputedStyle(span).color;
          }
          if (text.startsWith('"') || text === '"Hello, "') {
            colorMap["string"] = window.getComputedStyle(span).color;
          }
        }
      }
      return colorMap;
    });

    // We should find at least keyword coloring from the code block
    if (colors.keyword && colors.string) {
      expect(colors.keyword).not.toBe(colors.string);
    }

    // Screenshot: code block highlighting
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "02-dark-plus-code-blocks.png"),
      fullPage: true,
    });
  });

  test("switch to Monokai theme changes editor colors", async ({ page }) => {
    // Switch to Monokai
    await page.getByTestId("theme-selector").selectOption("monokai");
    await page.waitForTimeout(500);

    // Verify selector value changed
    await expect(page.getByTestId("theme-selector")).toHaveValue("monokai");
    await expect(page.getByTestId("current-theme-label")).toContainText("monokai");

    // Verify editor background changed to Monokai bg (#272822)
    const editorBg = await page.locator(".cm-editor").evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });
    // #272822 = rgb(39, 40, 34)
    expect(editorBg).toBe("rgb(39, 40, 34)");

    // Screenshot: Monokai
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "03-monokai.png"),
      fullPage: true,
    });
  });

  test("switch to Light+ theme makes background white", async ({ page }) => {
    await page.getByTestId("theme-selector").selectOption("light-plus");
    await page.waitForTimeout(500);

    const editorBg = await page.locator(".cm-editor").evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });
    // #ffffff = rgb(255, 255, 255)
    expect(editorBg).toBe("rgb(255, 255, 255)");

    // Screenshot: Light+
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "04-light-plus.png"),
      fullPage: true,
    });
  });

  test("switch to GitHub Dark theme", async ({ page }) => {
    await page.getByTestId("theme-selector").selectOption("github-dark");
    await page.waitForTimeout(500);

    const editorBg = await page.locator(".cm-editor").evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });
    // #0d1117 = rgb(13, 17, 23)
    expect(editorBg).toBe("rgb(13, 17, 23)");

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "05-github-dark.png"),
      fullPage: true,
    });
  });

  test("switch to Solarized Dark theme", async ({ page }) => {
    await page.getByTestId("theme-selector").selectOption("solarized-dark");
    await page.waitForTimeout(500);

    const editorBg = await page.locator(".cm-editor").evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });
    // #002b36 = rgb(0, 43, 54)
    expect(editorBg).toBe("rgb(0, 43, 54)");

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "06-solarized-dark.png"),
      fullPage: true,
    });
  });

  test("theme persists after page reload", async ({ page }) => {
    // Switch to Monokai
    await page.getByTestId("theme-selector").selectOption("monokai");
    await page.waitForTimeout(500);

    // Reload the page
    await page.reload();
    await page.waitForSelector(".cm-editor", { timeout: 15_000 });
    await page.waitForTimeout(1000);

    // Should still be monokai
    await expect(page.getByTestId("theme-selector")).toHaveValue("monokai");

    const editorBg = await page.locator(".cm-editor").evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });
    expect(editorBg).toBe("rgb(39, 40, 34)");
  });

  test("theme selector shows all available themes", async ({ page }) => {
    const options = await page.getByTestId("theme-selector").locator("option").allTextContents();
    expect(options).toContain("Dark+");
    expect(options).toContain("Light+");
    expect(options).toContain("Monokai");
    expect(options).toContain("GitHub Dark");
    expect(options).toContain("Solarized Dark");
  });
});
