import {
  expect,
  test as base,
  type ConsoleMessage,
  type Page,
} from "@playwright/test";

type RuntimeErrorMonitor = {
  errors: string[];
};

export const test = base.extend<{ runtimeErrorMonitor: RuntimeErrorMonitor }>({
  runtimeErrorMonitor: [
    async ({ page }, use) => {
      const monitor: RuntimeErrorMonitor = { errors: [] };
      const onPageError = (error: Error) => {
        monitor.errors.push(`pageerror: ${error.message}`);
      };
      const onConsole = (message: ConsoleMessage) => {
        if (message.type() === "error") {
          monitor.errors.push(`console.error: ${message.text()}`);
        }
      };
      page.on("pageerror", onPageError);
      page.on("console", onConsole);

      await use(monitor);

      page.off("pageerror", onPageError);
      page.off("console", onConsole);
      expect(
        monitor.errors,
        "The page emitted an uncaught error or console.error.",
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export async function expectNoBodyOverflow(page: Page) {
  await expect.poll(async () => page.evaluate(
    () => document.documentElement.scrollWidth === window.innerWidth,
  )).toBe(true);
}

export async function expectNamedPageStructure(page: Page) {
  await expect(page.locator("h1")).toHaveCount(1);
  const main = page.getByRole("main");
  await expect(main).toHaveCount(1);
  await expect(main).toHaveAccessibleName(/.+/);
}

export async function usePrivateSession(page: Page) {
  const setSession = () => {
    localStorage.setItem("mnote_token", "e2e-token");
    localStorage.setItem("mnote_email", "reader@example.com");
    localStorage.setItem("mnote_guest_anon_id", "A11Y");
  };
  await page.addInitScript(setSession);
  const propertiesLoaded = page.waitForResponse((response) => (
    response.url().includes("/api/v1/properties")
  ));
  await page.goto("/login");
  await propertiesLoaded;
  await page.evaluate(setSession);
}

export async function useStableBrowserState(page: Page) {
  await page.addInitScript((fixedTime) => {
    const NativeDate = Date;
    const FixedDate = new Proxy(NativeDate, {
      construct(target, args) {
        return Reflect.construct(target, args.length ? args : [fixedTime]);
      },
    });
    Object.defineProperty(FixedDate, "now", { value: () => fixedTime });
    globalThis.Date = FixedDate;
  }, new Date("2026-07-19T10:00:00+08:00").getTime());
  await page.emulateMedia({ reducedMotion: "reduce" });
}
