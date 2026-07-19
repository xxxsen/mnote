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

test("version comparison uses side-by-side and stacked diff layouts without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/docs/doc-1/revert?version=2");
  await expect(page.getByLabel("Side-by-side document differences")).toBeVisible();
  await expect(page).toHaveScreenshot("revert-desktop.png", { animations: "disabled" });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Stacked document differences")).toBeVisible();
  await expectNoBodyOverflow(page);
  await expect(page).toHaveScreenshot("revert-mobile.png", { animations: "disabled" });
});

test("restore is keyboard reachable and submits the loaded revision", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let restoreBody = "";
  page.on("request", (request) => {
    if (request.method() === "PUT" && request.url().includes("/documents/doc-1")) {
      restoreBody = request.postData() || "";
    }
  });
  await page.goto("/docs/doc-1/revert?version=2");
  const restore = page.getByRole("button", { name: "Restore v2" });
  await restore.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => restoreBody).toContain('"base_revision":3');
});
