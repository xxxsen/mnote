import {
  expect,
  test,
  usePrivateSession,
  useStableBrowserState,
} from "./ui-test";
import { installUiApi } from "./ui-api-fixture";

test.beforeEach(async ({ page }) => {
  await installUiApi(page);
  await usePrivateSession(page);
  await useStableBrowserState(page);
  await page.setViewportSize({ width: 1280, height: 800 });
});

test("menus support arrows, Home, End, Escape, and focus restoration", async ({
  page,
}) => {
  await page.goto("/docs");
  const trigger = page.getByRole("button", { name: "New note options" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "New note options" });
  await expect(menu).toBeVisible();
  await page.keyboard.press("End");
  await expect(menu.getByRole("menuitem").last()).toBeFocused();
  await page.keyboard.press("Home");
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("dialogs trap Tab and return focus after Escape", async ({ page }) => {
  await page.goto("/tags");
  const trigger = page.getByRole("button", { name: "Delete product" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("alertdialog", { name: "Delete tag" });
  await expect(dialog).toBeVisible();
  for (let index = 0; index < 5; index += 1) {
    await page.keyboard.press("Tab");
    await expect(dialog.locator(":focus")).toHaveCount(1);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("segmented controls and editor resize remain keyboard operable", async ({
  page,
}) => {
  await page.goto("/docs/doc-1");
  await page.getByRole("button", { name: "Split view" }).click();
  const separator = page.getByRole("separator", { name: "Resize editor and preview" });
  await separator.focus();
  const original = await separator.getAttribute("aria-valuenow");
  await page.keyboard.press("ArrowRight");
  await expect(separator).not.toHaveAttribute("aria-valuenow", original || "");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const preview = page.getByRole("button", { name: "Preview", exact: true });
  await preview.focus();
  await page.keyboard.press("Enter");
  await expect(preview).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Markdown preview" })).toBeVisible();
});
