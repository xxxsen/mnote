import { expect, test } from "@playwright/test";
import {
  createDocument,
  deleteDocument,
  loginTestUser,
  openEditor,
} from "./editor-helpers";

test("editor midline determines the active Outline section", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const token = await loginTestUser(page);
  const content = [
    "# Midline note",
    ...Array.from({ length: 10 }, (_, sectionIndex) => {
      const section = sectionIndex + 1;
      return [
        `## Section ${section}`,
        ...Array.from(
          { length: 30 },
          (_, lineIndex) => `Section ${section} line ${lineIndex + 1}`,
        ),
      ].join("\n");
    }),
  ].join("\n\n");
  const document = await createDocument(page, token, content);

  try {
    await openEditor(page, document.id);
    await page.getByRole("button", { name: "Edit view" }).click();
    const editorScroller = page.locator(".cm-scroller");
    const heading = page
      .locator(".cm-line")
      .filter({ hasText: /^## Section 7$/ });

    await page.locator('[data-outline-id="section-7"]').click();
    await expect(heading).toBeVisible();
    await expect
      .poll(() => editorScroller.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);

    await editorScroller.evaluate((element) => {
      element.scrollTop = Math.max(
        0,
        element.scrollTop - element.clientHeight * 0.3,
      );
      element.dispatchEvent(new Event("scroll"));
    });
    await expect
      .poll(async () => {
        const headingBox = await heading.boundingBox();
        const editorBox = await editorScroller.boundingBox();
        if (!headingBox || !editorBox) return -1;
        return (headingBox.y - editorBox.y) / editorBox.height;
      })
      .toBeGreaterThan(0.15);
    await expect
      .poll(async () => {
        const headingBox = await heading.boundingBox();
        const editorBox = await editorScroller.boundingBox();
        if (!headingBox || !editorBox) return 1;
        return (headingBox.y - editorBox.y) / editorBox.height;
      })
      .toBeLessThan(0.5);
    await expect(
      page.locator('[data-outline-id="section-7"]'),
    ).toHaveAttribute("aria-current", "location");
  } finally {
    await deleteDocument(page, token, document.id);
  }
});

test("preview wheel delegates scrolling to the editor while sync is enabled", async ({
  page,
}) => {
  const passiveWheelErrors: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("passive event listener")) {
      passiveWheelErrors.push(message.text());
    }
  });
  await page.setViewportSize({ width: 1600, height: 900 });
  const token = await loginTestUser(page);
  const content = [
    "# Wheel scroll",
    ...Array.from(
      { length: 18 },
      (_, index) =>
        `## Section ${index + 1}\n${"Preview scrolling body. ".repeat(90)}`,
    ),
  ].join("\n\n");
  const document = await createDocument(page, token, content);

  try {
    await openEditor(page, document.id);
    await page.getByRole("button", { name: "Split view" }).click();
    const preview = page.getByRole("region", { name: "Markdown preview" });
    const editorScroller = page.locator(".cm-scroller");
    await preview.evaluate((element) => {
      element.addEventListener(
        "wheel",
        (event) => {
          element.dataset.wheelDefaultPrevented = String(
            event.defaultPrevented,
          );
        },
        { once: true },
      );
    });
    await expect(
      page.getByRole("button", { name: "Scroll sync on" }),
    ).toHaveAttribute("aria-pressed", "true");

    const editorBeforeWheel = await editorScroller.evaluate(
      (element) => element.scrollTop,
    );
    await preview.hover();
    await page.mouse.wheel(0, 1400);
    await expect
      .poll(() => preview.getAttribute("data-wheel-default-prevented"))
      .toBe("true");
    expect(passiveWheelErrors).toEqual([]);
    await expect
      .poll(() => preview.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(200);
    await expect
      .poll(() => editorScroller.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(editorBeforeWheel);
    await page.waitForTimeout(400);
    expect(await preview.evaluate((element) => element.scrollTop)).toBeGreaterThan(
      200,
    );
  } finally {
    await deleteDocument(page, token, document.id);
  }
});

test("keeps a TOC document aligned when Mermaid changes preview height", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const token = await loginTestUser(page);
  const sections = Array.from({ length: 5 }, (_, index) => {
    const number = index + 1;
    return [
      `## Section ${number}`,
      `Section ${number} body. ${"Long content. ".repeat(35)}`,
      "```mermaid",
      "flowchart TD",
      `  S${number}[Section ${number}] --> T${number}[Rendered diagram]`,
      "```",
    ].join("\n\n");
  });
  const content = [
    "# Mermaid alignment",
    "[TOC]",
    ...sections,
    "## 6. API 形态",
    "The target section must occupy the midpoint in both panes.",
    "## 7. Final section",
    "Trailing content. ".repeat(80),
  ].join("\n\n");
  const document = await createDocument(page, token, content);

  try {
    await openEditor(page, document.id);
    await page.getByRole("button", { name: "Split view" }).click();
    const editorScroller = page.locator(".cm-scroller");
    const preview = page.getByRole("region", { name: "Markdown preview" });
    const editorHeading = page
      .locator(".cm-line")
      .filter({ hasText: /^## 6\. API 形态$/ });
    const previewHeading = preview.getByRole("heading", {
      name: "6. API 形态",
    });

    await page
      .locator('[data-outline-id]')
      .filter({ hasText: "6. API 形态" })
      .first()
      .click();
    await expect(editorHeading).toBeVisible();
    await preview.locator(".mermaid-container svg").first().waitFor({
      state: "attached",
      timeout: 15_000,
    });
    await page.waitForTimeout(200);
    await editorScroller.evaluate((element) => {
      const heading = Array.from(element.querySelectorAll(".cm-line")).find(
        (line) => line.textContent === "## 6. API 形态",
      );
      if (!heading) throw new Error("target editor heading missing");
      const headingRect = heading.getBoundingClientRect();
      const editorRect = element.getBoundingClientRect();
      element.scrollTop +=
        headingRect.top - editorRect.top - element.clientHeight / 2;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    await expect
      .poll(async () => {
        const headingBox = await previewHeading.boundingBox();
        const previewBox = await preview.boundingBox();
        if (!headingBox || !previewBox) return -1;
        return (headingBox.y - previewBox.y) / previewBox.height;
      })
      .toBeGreaterThan(0.35);
    await expect
      .poll(async () => {
        const headingBox = await previewHeading.boundingBox();
        const previewBox = await preview.boundingBox();
        if (!headingBox || !previewBox) return 1;
        return (headingBox.y - previewBox.y) / previewBox.height;
      })
      .toBeLessThan(0.65);

    const before = await page.evaluate(() => {
      const editor = globalThis.document.querySelector<HTMLElement>(".cm-scroller");
      const preview = globalThis.document.querySelector<HTMLElement>(
        '[aria-label="Markdown preview"]',
      );
      const heading = Array.from(
        preview?.querySelectorAll<HTMLElement>("h2") ?? [],
      ).find((element) => element.textContent === "6. API 形态");
      if (!editor || !preview || !heading) throw new Error("pane missing");
      return {
        editorTop: editor.scrollTop,
        previewTop: preview.scrollTop,
        headingY:
          heading.getBoundingClientRect().top -
          preview.getBoundingClientRect().top,
      };
    });
    await preview.locator(".mermaid-container").first().evaluate((element) => {
      element.style.height =
        String(element.getBoundingClientRect().height + 400) + "px";
    });
    await expect
      .poll(() => preview.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(before.previewTop + 300);
    const after = await page.evaluate(() => {
      const editor = globalThis.document.querySelector<HTMLElement>(".cm-scroller");
      const preview = globalThis.document.querySelector<HTMLElement>(
        '[aria-label="Markdown preview"]',
      );
      const heading = Array.from(
        preview?.querySelectorAll<HTMLElement>("h2") ?? [],
      ).find((element) => element.textContent === "6. API 形态");
      if (!editor || !preview || !heading) throw new Error("pane missing");
      return {
        editorTop: editor.scrollTop,
        headingY:
          heading.getBoundingClientRect().top -
          preview.getBoundingClientRect().top,
      };
    });
    expect(after.editorTop).toBe(before.editorTop);
    expect(Math.abs(after.headingY - before.headingY)).toBeLessThan(8);
  } finally {
    await deleteDocument(page, token, document.id);
  }
});

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
      '[data-outline-id][aria-current="location"]',
    );
    await expect(currentLink).toHaveText("Section 1");

    await page.getByRole("button", { name: "Scroll sync on" }).click();
    await expect(
      page.getByRole("button", { name: "Scroll sync off" }),
    ).toHaveAttribute("aria-pressed", "false");

    const preview = page.getByRole("region", { name: "Markdown preview" });
    const rail = page.getByTestId("editor-context-rail");
    const previewBox = await preview.boundingBox();
    const railBox = await rail.boundingBox();
    expect(previewBox).not.toBeNull();
    expect(railBox).not.toBeNull();
    expect((previewBox?.x ?? 0) + (previewBox?.width ?? 0)).toBeLessThanOrEqual(
      (railBox?.x ?? 0) + 1,
    );
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

    const finalLink = page.locator('[data-outline-id="repeat-1"]');
    await expect(finalLink).toHaveAttribute("aria-current", "location");
    await expect(finalLink).toHaveClass(/font-semibold/);
    await expect
      .poll(() =>
        page
          .locator(".custom-scrollbar:has([data-outline-id])")
          .evaluate((element) => element.scrollTop),
      )
      .toBeGreaterThan(0);
  } finally {
    await deleteDocument(page, token, document.id);
  }
});

test("Outline navigates Edit, Preview, and unsynchronized Split without an inline toc token", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const token = await loginTestUser(page);
  const content = [
    "# Navigation note",
    ...Array.from(
      { length: 20 },
      (_, index) =>
        `## Section ${index + 1}\n${"Long section body. ".repeat(80)}`,
    ),
  ].join("\n\n");
  const document = await createDocument(page, token, content);

  try {
    await openEditor(page, document.id);
    const editorScroller = page.locator(".cm-scroller");
    const preview = page.getByRole("region", { name: "Markdown preview" });

    await page.getByRole("button", { name: "Edit view" }).click();
    await page.locator('[data-outline-id="section-20"]').click();
    await expect
      .poll(() => editorScroller.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);

    await page.getByRole("button", { name: "Preview view" }).click();
    await preview.evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.locator('[data-outline-id="section-18"]').click();
    await expect
      .poll(() => preview.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);

    await page.getByRole("button", { name: "Split view" }).click();
    const syncButton = page.getByRole("button", { name: "Scroll sync on" });
    if (await syncButton.isVisible()) await syncButton.click();
    const editorBefore = await editorScroller.evaluate(
      (element) => element.scrollTop,
    );
    await page.locator('[data-outline-id="section-5"]').click();
    await expect
      .poll(() => editorScroller.evaluate((element) => element.scrollTop))
      .toBe(editorBefore);

    await page.getByRole("button", { name: "Scroll sync off" }).click();
    const editorBeforeSynchronizedNavigation = await editorScroller.evaluate(
      (element) => element.scrollTop,
    );
    await page.locator('[data-outline-id="section-1"]').click();
    await expect
      .poll(() => editorScroller.evaluate((element) => element.scrollTop))
      .not.toBe(editorBeforeSynchronizedNavigation);
  } finally {
    await deleteDocument(page, token, document.id);
  }
});
