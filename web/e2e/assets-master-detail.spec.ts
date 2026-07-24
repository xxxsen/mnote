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

test("scrolling a long asset list keeps the preview visible", async ({ page }) => {
  const assets = Array.from({ length: 30 }, (_, index) => ({
    id: `asset-${index + 1}`,
    user_id: "user-1",
    file_key: `asset-${index + 1}.png`,
    url: `https://assets.example.test/fixtures/asset-${index + 1}.png`,
    name: `asset-${String(index + 1).padStart(2, "0")}.png`,
    content_type: "application/octet-stream",
    size: 1024 * (index + 1),
    ctime: 1_784_426_400,
    mtime: 1_784_426_400,
    ref_count: 0,
  }));
  await page.route("**/api/v1/assets**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith("/references") ? [] : assets;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 0, data }),
    });
  });

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/assets");

  const list = page.getByTestId("asset-list-scroll");
  await expect(page.getByRole("region", { name: "asset-01.png" })).toBeVisible();
  await expect.poll(
    () => list.evaluate((element) => element.scrollHeight > element.clientHeight),
  ).toBe(true);
  await expect(list).toHaveJSProperty("scrollTop", 0);

  await list.hover();
  await page.mouse.wheel(0, 10_000);
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByRole("heading", { name: "Preview" })).toBeVisible();

  await page.getByRole("button", { name: /asset-30\.png/ }).click();
  await expect(page.getByRole("region", { name: "asset-30.png" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Preview" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});
