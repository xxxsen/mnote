import {
  expect,
  expectNamedPageStructure,
  expectNoBodyOverflow,
  test,
  usePrivateSession,
  useStableBrowserState,
} from "./ui-test";
import { installUiApi } from "./ui-api-fixture";

const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
];

const privateRoutes = [
  "/docs",
  "/tags",
  "/todos",
  "/templates",
  "/assets",
  "/settings",
  "/docs/doc-1",
  "/docs/doc-1/revert?version=2",
];

test.beforeEach(async ({ page }) => {
  await installUiApi(page);
  await usePrivateSession(page);
  await useStableBrowserState(page);
});

test("all product routes avoid body overflow across the supported viewport matrix", async ({
  page,
}) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const route of [...privateRoutes, "/login", "/register", "/share/public"]) {
      await page.goto(route);
      await expect(page.getByRole("main")).toBeVisible();
      await expectNoBodyOverflow(page);
    }
  }
});

test("management and authentication pages expose one named page structure", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const route of ["/docs", "/tags", "/todos", "/templates", "/assets", "/settings", "/login", "/register"]) {
    await page.goto(route);
    await expectNamedPageStructure(page);
  }
});

test("tags have stable list and destructive confirmation visuals", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/tags");
  await expect(page.getByRole("heading", { name: "Tags" })).toBeVisible();
  await expect(page.getByText("#product")).toBeVisible();
  await expect(page).toHaveScreenshot("tags-list.png", { animations: "disabled" });

  await page.getByRole("button", { name: "Delete product" }).click();
  await expect(page.getByRole("alertdialog", { name: "Delete tag" })).toBeVisible();
  await expect(page).toHaveScreenshot("tags-delete-confirmation.png", { animations: "disabled" });
});

test("settings and editor modes have stable desktop and mobile visuals", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Account settings" })).toBeVisible();
  await expect(page).toHaveScreenshot("settings-desktop.png", { animations: "disabled" });

  await page.goto("/docs/doc-1");
  await expect(page.getByRole("region", { name: "Markdown editor" })).toBeVisible();
  await expect(page).toHaveTitle("Product launch notes · Micro Note");
  await page.getByRole("button", { name: "Split view" }).click();
  await expect(page.getByRole("region", { name: "Markdown preview" })).toBeVisible();
  await expect(page).toHaveScreenshot("editor-split-desktop.png", { animations: "disabled" });

  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page).toHaveScreenshot("editor-preview-desktop.png", { animations: "disabled" });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("region", { name: "Markdown preview" })).toBeVisible();
  await expect(page).toHaveScreenshot("editor-preview-mobile.png", { animations: "disabled" });
});
