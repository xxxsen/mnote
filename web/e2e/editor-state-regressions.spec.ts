import type { Page } from "@playwright/test";

import { installUiApi, type UiApiState } from "./ui-api-fixture";
import {
  expect,
  test,
  usePrivateSession,
  useStableBrowserState,
} from "./ui-test";

const VIEW_MODE_KEY = "mnote:editor-view-mode:v1";
const SPLIT_RATIO_KEY = "mnote:editor-split-ratio:v1";
const SCROLL_SYNC_KEY = "mnote:editor-scroll-sync:v1";
const CONTEXT_RAIL_COLLAPSED_KEY =
  "mnote:editor-context-rail:collapsed:v1";

const previousModes = [
  { mode: "edit", buttonName: "Edit view" },
  { mode: "split", buttonName: "Split view" },
  { mode: "preview", buttonName: "Preview view" },
] as const;

let apiState: UiApiState;

test.beforeEach(async ({ page }) => {
  apiState = await installUiApi(page);
  await usePrivateSession(page);
  await useStableBrowserState(page);
  await page.setViewportSize({ width: 1440, height: 900 });
});

async function readPreference(page: Page, key: string) {
  return page.evaluate((storageKey) => localStorage.getItem(storageKey), key);
}

for (const { mode, buttonName } of previousModes) {
  test(`a new note opens in Split after the previous mode was ${mode}`, async ({
    page,
  }) => {
    await page.evaluate(
      ({ ratioKey, syncKey }) => {
        localStorage.setItem(ratioKey, "64");
        localStorage.setItem(syncKey, "false");
      },
      { ratioKey: SPLIT_RATIO_KEY, syncKey: SCROLL_SYNC_KEY },
    );
    await page.goto("/docs/doc-1");

    const previousModeButton = page.getByRole("button", { name: buttonName });
    await previousModeButton.click();
    await expect(previousModeButton).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => readPreference(page, VIEW_MODE_KEY)).toBe(mode);

    await page.goto("/docs");
    await expect(page.getByText("Product launch notes").first()).toBeVisible();
    await Promise.all([
      page.waitForURL(/\/docs\/doc-1$/),
      page.getByRole("button", { name: "New note", exact: true }).click(),
    ]);

    await expect(
      page.getByRole("button", { name: "Split view" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("region", { name: "Markdown editor" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Markdown preview" }),
    ).toBeVisible();
    await expect.poll(() => readPreference(page, VIEW_MODE_KEY)).toBe("split");
    await expect.poll(() => readPreference(page, SPLIT_RATIO_KEY)).toBe("64");
    await expect.poll(() => readPreference(page, SCROLL_SYNC_KEY)).toBe("false");

    const editor = page.locator(".cm-content");
    await editor.click();
    await page.keyboard.insertText("Editable");
    await expect(editor).toContainText("Editable");
  });
}

test("a failed note creation keeps the previous view preference", async ({
  page,
}) => {
  apiState.createDocumentFails = true;
  await page.evaluate(
    ({ modeKey }) => localStorage.setItem(modeKey, "preview"),
    { modeKey: VIEW_MODE_KEY },
  );
  await page.goto("/docs");
  await expect(page.getByText("Product launch notes").first()).toBeVisible();

  await page
    .getByRole("button", { name: "New note", exact: true })
    .click();

  await expect(page).toHaveURL(/\/docs$/);
  await expect(
    page.getByLabel("Notifications").getByRole("alert"),
  ).toContainText("Failed to create document.");
  await expect.poll(() => readPreference(page, VIEW_MODE_KEY)).toBe("preview");
});

test("Details temporarily expands and then restores a collapsed Outline", async ({
  page,
}) => {
  await page.evaluate(
    ({ collapsedKey }) => localStorage.setItem(collapsedKey, "1"),
    { collapsedKey: CONTEXT_RAIL_COLLAPSED_KEY },
  );
  await page.goto("/docs/doc-1");

  await expect(page.getByTestId("editor-context-rail-collapsed")).toBeVisible();
  await page.getByRole("button", { name: "Show details" }).click();
  const expandedRail = page.getByTestId("editor-context-rail");
  await expect(expandedRail.getByText("Document details")).toBeVisible();
  await expect.poll(() => readPreference(page, CONTEXT_RAIL_COLLAPSED_KEY)).toBe(
    "1",
  );

  await page.evaluate(() => {
    const trackedWindow = window as typeof window & {
      __mnoteExpandedOutlineSeen?: boolean;
      __mnoteOutlineObserver?: MutationObserver;
    };
    trackedWindow.__mnoteExpandedOutlineSeen = false;
    trackedWindow.__mnoteOutlineObserver = new MutationObserver(() => {
      const outline = document.querySelector<HTMLElement>(
        '[data-testid="editor-context-rail"] [aria-label="Note outline"]',
      );
      if (outline && outline.getClientRects().length > 0) {
        trackedWindow.__mnoteExpandedOutlineSeen = true;
      }
    });
    trackedWindow.__mnoteOutlineObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });

  await page.getByRole("button", { name: "Show outline" }).click();
  await expect(page.getByTestId("editor-context-rail-collapsed")).toBeVisible();
  await expect.poll(() => readPreference(page, CONTEXT_RAIL_COLLAPSED_KEY)).toBe(
    "1",
  );
  const expandedOutlineSeen = await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    const trackedWindow = window as typeof window & {
      __mnoteExpandedOutlineSeen?: boolean;
      __mnoteOutlineObserver?: MutationObserver;
    };
    trackedWindow.__mnoteOutlineObserver?.disconnect();
    return trackedWindow.__mnoteExpandedOutlineSeen;
  });
  expect(expandedOutlineSeen).toBe(false);

  await page.getByRole("button", { name: "Open outline" }).click();
  await expect(
    page.getByRole("navigation", { name: "Note outline" }),
  ).toBeVisible();
  await expect.poll(() => readPreference(page, CONTEXT_RAIL_COLLAPSED_KEY)).toBe(
    "0",
  );
});
