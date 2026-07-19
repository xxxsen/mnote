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

test("assets uses side-by-side detail on desktop and one panel on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/assets");
  await expect(page.getByRole("region", { name: "Assets" })).toBeVisible();
  await expect(page.getByRole("region", { name: "launch-plan.pdf" })).toBeVisible();
  await expect(page).toHaveScreenshot("assets-desktop-master-detail.png", { animations: "disabled" });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("region", { name: "Assets" })).toBeVisible();
  await page.getByRole("button", { name: /launch-plan.pdf/ }).click();
  await expect(page.getByRole("button", { name: "Back to Assets" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "References" })).toBeVisible();
  await expectNoBodyOverflow(page);
  await expect(page).toHaveScreenshot("assets-mobile-detail.png", { animations: "disabled" });
});

test("asset copy actions retain an accessible name and report clipboard failure", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/assets");
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("denied")) },
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: () => false,
    });
  });
  await page.getByRole("button", { name: "Copy URL" }).click();
  await expect(page.getByText("Clipboard access failed. Copy the value manually.")).toBeVisible();
});
