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

test("templates preserve dirty edits until the user makes an explicit decision", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/templates");
  await expect(page.getByLabel("Name")).toHaveValue("Weekly review");
  await expect(page).toHaveScreenshot("templates-list-editor.png", { animations: "disabled" });

  await page.getByLabel("Name").fill("Changed weekly review");
  await expect(page.getByText("Unsaved changes").first()).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Save changes?" });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveScreenshot("templates-dirty-confirmation.png", { animations: "disabled" });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByLabel("Name")).toHaveValue("Changed weekly review");
});

test("template variables provide a responsive preview before creation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/templates");
  await page
    .getByRole("region", { name: "Templates" })
    .getByRole("button", { name: /^Weekly review/ })
    .click();
  await page.getByRole("button", { name: "Use template" }).click();
  const dialog = page.getByRole("dialog", { name: "Template preview" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Variables" })).toBeVisible();
  await expectNoBodyOverflow(page);
  await expect(page).toHaveScreenshot("templates-variable-preview.png", { animations: "disabled" });
});
