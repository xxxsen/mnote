import {
  expect,
  expectNoBodyOverflow,
  test,
  useStableBrowserState,
} from "./ui-test";
import { installUiApi } from "./ui-api-fixture";

test.beforeEach(async ({ page }) => {
  await useStableBrowserState(page);
});

test("login presents stable default and generic error states", async ({ page }) => {
  const state = await installUiApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login?return=%2Ftemplates");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  for (const control of [
    page.getByLabel("Email"),
    page.locator("#password"),
    page.getByRole("button", { name: "Sign in" }),
  ]) {
    expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
  await expect(page).toHaveScreenshot("login-default.png", { animations: "disabled" });

  state.loginFails = true;
  await page.getByLabel("Email").fill("reader@example.com");
  await page.locator("#password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("#login-error")).toContainText("Sign in failed");
  await expect(page).toHaveScreenshot("login-error.png", { animations: "disabled" });
});

test("registration presents the shared authentication layout", async ({ page }) => {
  await installUiApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
  await expect(page).toHaveScreenshot("register-default.png", { animations: "disabled" });
});

test("public share covers normal, password, and unavailable states", async ({
  page,
}) => {
  await installUiApi(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/share/public");
  await expect(page.locator("#share-title")).toHaveText("Product launch notes");
  await expect(page).toHaveScreenshot("share-normal.png", { animations: "disabled" });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/share/protected");
  await expect(page.getByRole("heading", { name: "Protected share" })).toBeVisible();
  await expect(page).toHaveScreenshot("share-password.png", { animations: "disabled" });

  await page.goto("/share/expired");
  await expect(page.getByRole("heading", { name: "Share link unavailable" })).toBeVisible();
  await expectNoBodyOverflow(page);
  await expect(page).toHaveScreenshot("share-unavailable.png", { animations: "disabled" });
});

test("protected share allows retrying the same password after rejection", async ({
  page,
}) => {
  await installUiApi(page);
  await page.goto("/share/protected");
  const password = page.getByLabel("Share password");
  await password.fill("wrong");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Invalid password.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Invalid password.", { exact: true })).toBeVisible();
  await password.fill("open-sesame");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#share-title")).toHaveText("Product launch notes");
});
