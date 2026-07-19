import {
  expect,
  expectNoBodyOverflow,
  test,
  usePrivateSession,
  useStableBrowserState,
} from "./ui-test";
import { installUiApi, type UiApiState } from "./ui-api-fixture";

let apiState: UiApiState;

test.beforeEach(async ({ page }) => {
  apiState = await installUiApi(page);
  await usePrivateSession(page);
  await useStableBrowserState(page);
});

test("docs renders stable data, empty, and mobile navigation states", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/docs");
  await expect(page.getByRole("heading", { name: "Product launch notes" })).toBeVisible();
  await expect(page).toHaveScreenshot("docs-with-data.png", { animations: "disabled" });

  apiState.docsEmpty = true;
  await page.reload();
  await expect(page.getByRole("heading", { name: "Create your first note" })).toBeVisible();
  await expect(page).toHaveScreenshot("docs-empty.png", { animations: "disabled" });

  apiState.docsEmpty = false;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole("button", { name: "Open application navigation" }).click();
  await expect(page.getByRole("dialog", { name: "Application navigation" })).toBeVisible();
  await expectNoBodyOverflow(page);
  await expect(page).toHaveScreenshot("docs-mobile-navigation.png", { animations: "disabled" });
});

test("mobile drawer traps focus and restores it to the trigger", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/docs");
  const trigger = page.getByRole("button", { name: "Open application navigation" });
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "Application navigation" });
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();
});
