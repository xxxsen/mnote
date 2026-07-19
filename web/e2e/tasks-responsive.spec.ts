import {
  expect,
  expectNoBodyOverflow,
  test,
  usePrivateSession,
  useStableBrowserState,
} from "./ui-test";
import { installUiApi } from "./ui-api-fixture";

test.beforeEach(async ({ page }) => {
  await installUiApi(page);
  await usePrivateSession(page);
  await useStableBrowserState(page);
});

test("tasks switches from desktop calendar to complete mobile schedule", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/todos");
  await expect(page.getByRole("heading", { name: "July 2026" }).first()).toBeVisible();
  await expect(page).toHaveScreenshot("tasks-desktop-calendar.png", { animations: "disabled" });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Monthly schedule")).toBeVisible();
  await expectNoBodyOverflow(page);
  expect((await page.getByRole("button", { name: "Add task", exact: true }).first().boundingBox())?.height)
    .toBeGreaterThanOrEqual(44);
  expect((await page.getByRole("button", { name: "New task" }).boundingBox())?.height)
    .toBeGreaterThanOrEqual(44);
  await expect(page).toHaveScreenshot("tasks-mobile-schedule.png", { animations: "disabled" });
});

test("day details expose independent checkbox, edit, and delete actions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/todos");
  await page.getByRole("button", { name: "Details" }).click();
  const dialog = page.getByRole("dialog", { name: "Todos for 2026-07-19" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("checkbox")).toHaveCount(2);
  await expect(dialog.getByRole("button", { name: /Edit Review the release/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Delete Review the release/ })).toBeVisible();
  await expect(page).toHaveScreenshot("tasks-day-details.png", { animations: "disabled" });
});
