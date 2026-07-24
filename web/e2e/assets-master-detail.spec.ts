import {
  expect,
  expectNoBodyOverflow,
  test,
  usePrivateSession,
  useStableBrowserState,
} from "./ui-test";
import type { Page } from "@playwright/test";
import { installUiApi, prepareMediaFixtures } from "./ui-api-fixture";

const assetTimestamp = 1_784_426_400;

function mediaAsset(
  id: string,
  fileKey: string,
  contentType: string,
  size = 1024,
) {
  return {
    id,
    user_id: "user-1",
    file_key: fileKey,
    url: `https://assets.example.test/private/${fileKey}`,
    name: fileKey,
    content_type: contentType,
    size,
    ctime: assetTimestamp,
    mtime: assetTimestamp,
    ref_count: 0,
  };
}

async function routeAssetList(
  page: Page,
  assets: ReturnType<typeof mediaAsset>[],
) {
  await page.route("**/api/v1/assets**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        code: 0,
        data: path.endsWith("/references") ? [] : assets,
      }),
    });
  });
}

test.beforeAll(async () => {
  await prepareMediaFixtures();
});

test.beforeEach(async ({ page }) => {
  await installUiApi(page, { mockFiles: false });
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
  const firstPage = page.getByRole("img", {
    name: "Page 1 of 2: launch-plan.pdf",
  });
  await expect(firstPage).toBeVisible();
  await expect.poll(
    () => firstPage.evaluate((canvas) => (canvas as HTMLCanvasElement).width),
  ).toBeGreaterThan(0);
  await expect.poll(
    () => firstPage.evaluate((canvas) => (canvas as HTMLCanvasElement).height),
  ).toBeGreaterThan(0);
  await expect(page).toHaveScreenshot("assets-desktop-master-detail.png", { animations: "disabled" });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("region", { name: "Assets" })).toBeVisible();
  await page.getByRole("button", { name: /launch-plan.pdf/ }).click();
  await expect(page.getByRole("button", { name: "Back to Assets" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "References" })).toBeVisible();
  await expectNoBodyOverflow(page);
  await expect(page).toHaveScreenshot("assets-mobile-detail.png", { animations: "disabled" });
});

test("PDF preview is Canvas-only, bounded, navigable, and keeps safe response headers", async ({
  page,
}) => {
  const previewRequests: Array<{ method: string; range: string | undefined }> = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/files/launch-plan.pdf/preview")) {
      previewRequests.push({
        method: request.method(),
        range: request.headers().range,
      });
    }
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/assets");

  const preview = page.getByRole("region", {
    name: "PDF preview: launch-plan.pdf",
  });
  await expect(preview).toBeVisible();
  await expect(page.getByRole("img", {
    name: "Page 1 of 2: launch-plan.pdf",
  })).toBeVisible();
  await expect(preview.locator("iframe, object, embed")).toHaveCount(0);

  await page.getByRole("button", { name: "Next PDF page" }).click();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  await expect(page.getByRole("img", {
    name: "Page 2 of 2: launch-plan.pdf",
  })).toBeVisible();
  await preview.press("PageUp");
  await expect(page.getByText("Page 1 of 2")).toBeVisible();

  const zoomIn = page.getByRole("button", { name: "Zoom in PDF" });
  for (let index = 0; index < 4; index += 1) await zoomIn.click();
  await expect(page.getByText("200%")).toBeVisible();
  await expect(zoomIn).toBeDisabled();
  const zoomOut = page.getByRole("button", { name: "Zoom out PDF" });
  for (let index = 0; index < 6; index += 1) await zoomOut.click();
  await expect(page.getByText("50%")).toBeVisible();
  await expect(zoomOut).toBeDisabled();

  await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "References" })).toBeVisible();
  const safeDownloadURL = "http://127.0.0.1:8850/api/v1/files/launch-plan.pdf";
  await expect(page.getByRole("link", {
    name: "Open launch-plan.pdf in a new tab",
  })).toHaveAttribute("href", safeDownloadURL);

  await expect.poll(() => previewRequests.map(({ method }) => method))
    .toEqual(expect.arrayContaining(["HEAD", "GET"]));
  expect(previewRequests[0]?.method).toBe("HEAD");
  for (const request of previewRequests) {
    expect(request.range || "").not.toContain(",");
  }

  const previewURL = `${safeDownloadURL}/preview`;
  const cMap = await page.request.get("/pdfjs/cmaps/Adobe-GB1-UCS2.bcmap");
  expect(cMap.status()).toBe(200);
  expect(cMap.headers()["content-type"]).toContain("application/octet-stream");
  expect((await cMap.body()).length).toBeGreaterThan(0);

  const head = await page.request.head(previewURL, {
    headers: { "Accept-Encoding": "gzip" },
  });
  expect(head.status()).toBe(200);
  expect(head.headers()["content-type"]).toBe("application/pdf");
  expect(head.headers()["content-disposition"]).toContain("attachment");
  expect(head.headers()["content-encoding"]).toBeUndefined();
  expect(head.headers()["x-content-type-options"]).toBe("nosniff");
  expect(head.headers()["content-security-policy"]).toContain("sandbox");
  expect(Number(head.headers()["content-length"])).toBeGreaterThan(0);

  const partial = await page.request.get(previewURL, {
    headers: { Range: "bytes=0-15", "Accept-Encoding": "gzip" },
  });
  expect(partial.status()).toBe(206);
  expect(partial.headers()["content-range"]).toMatch(/^bytes 0-15\/\d+$/);
  expect(partial.headers()["content-encoding"]).toBeUndefined();
  expect((await partial.body()).length).toBe(16);

  const download = await page.request.get(safeDownloadURL, {
    headers: { "Accept-Encoding": "gzip" },
  });
  expect(download.status()).toBe(200);
  expect(download.headers()["content-disposition"]).toContain("attachment");
  expect(download.headers()["content-security-policy"]).toContain("sandbox");
});

test("untrusted and resource-heavy PDFs fail closed without executable document UI", async ({
  page,
  runtimeErrorMonitor,
}) => {
  const fixtures = [
    mediaAsset("scripted", "scripted.pdf", "application/pdf"),
    mediaAsset("spoofed", "spoofed.pdf", "application/pdf"),
    mediaAsset("encrypted", "encrypted.pdf", "application/pdf"),
    mediaAsset("broken", "broken.pdf", "application/pdf"),
    mediaAsset("many", "many-pages.pdf", "application/pdf"),
    mediaAsset("large", "too-large.pdf", "application/pdf", 25 * 1024 * 1024 + 1),
  ];
  await routeAssetList(page, fixtures);
  const dialogs: string[] = [];
  const externalRequests: string[] = [];
  const largeMethods: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  page.on("request", (request) => {
    if (request.url().includes("evil.example.test")) {
      externalRequests.push(request.url());
    }
    if (request.url().endsWith("/files/too-large.pdf/preview")) {
      largeMethods.push(request.method());
    }
  });

  await page.goto("/assets");
  await expect(page.getByRole("img", {
    name: "Page 1 of 1: scripted.pdf",
  })).toBeVisible();
  await expect(page.locator("iframe, object, embed")).toHaveCount(0);
  await expect(page.getByRole("link", {
    name: /evil\.example\.test/,
  })).toHaveCount(0);
  expect(dialogs).toEqual([]);
  expect(externalRequests).toEqual([]);

  await page.getByRole("button", { name: /spoofed\.pdf/ }).click();
  await expect(page.getByRole("heading", {
    name: "No preview available",
  })).toBeVisible();

  await page.getByRole("button", { name: /encrypted\.pdf/ }).click();
  await expect(page.getByRole("heading", {
    name: "Password-protected PDF cannot be previewed",
  })).toBeVisible();

  await page.getByRole("button", { name: /broken\.pdf/ }).click();
  await expect(page.getByRole("heading", {
    name: "PDF preview unavailable",
  })).toBeVisible();

  await page.getByRole("button", { name: /many-pages\.pdf/ }).click();
  await expect(page.getByRole("heading", {
    name: "PDF exceeds preview limits",
  })).toBeVisible();

  await page.getByRole("button", { name: /too-large\.pdf/ }).click();
  await expect(page.getByRole("heading", {
    name: "PDF is too large to preview safely",
  })).toBeVisible();
  expect(largeMethods).toContain("HEAD");
  expect(largeMethods).not.toContain("GET");
  await expect(page.getByRole("link", {
    name: /Open file.*too-large\.pdf/,
  })).toBeVisible();
  runtimeErrorMonitor.errors = runtimeErrorMonitor.errors.filter((message) => (
    !message.includes("status of 415")
    && !message.includes("status of 413")
  ));
});

test("video and audio load only when selected, never autoplay, and cleanly switch", async ({
  page,
}) => {
  const mediaRequests: Array<{
    file: "video" | "audio";
    method: string;
    range: string | undefined;
  }> = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.endsWith("/files/demo.webm/preview")) {
      mediaRequests.push({
        file: "video",
        method: request.method(),
        range: request.headers().range,
      });
    } else if (url.endsWith("/files/note.wav/preview")) {
      mediaRequests.push({
        file: "audio",
        method: request.method(),
        range: request.headers().range,
      });
    }
  });

  await page.goto("/assets");
  await expect(page.getByRole("img", {
    name: "Page 1 of 2: launch-plan.pdf",
  })).toBeVisible();
  expect(mediaRequests).toEqual([]);

  await page.getByRole("button", { name: /demo\.webm/ }).click();
  const video = page.getByLabel("Preview demo.webm");
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute("controls", "");
  await expect(video).toHaveAttribute("preload", "metadata");
  await expect(video).not.toHaveAttribute("autoplay", /.*/);
  await expect.poll(() => video.evaluate((element) => (
    Number.isFinite((element as HTMLVideoElement).duration)
      ? (element as HTMLVideoElement).duration
      : 0
  ))).toBeGreaterThan(0);
  expect(await video.evaluate((element) => (element as HTMLVideoElement).paused)).toBe(true);
  await video.evaluate(async (element) => {
    const media = element as HTMLVideoElement;
    await media.play();
    media.currentTime = Math.min(0.1, media.duration / 2);
    media.pause();
  });
  expect(await video.evaluate((element) => (element as HTMLVideoElement).paused)).toBe(true);

  await page.getByRole("button", { name: /note\.wav/ }).click();
  const audio = page.getByLabel("Preview note.wav");
  await expect(audio).toBeVisible();
  await expect(audio).toHaveAttribute("controls", "");
  await expect(audio).toHaveAttribute("preload", "metadata");
  await expect(audio).not.toHaveAttribute("autoplay", /.*/);
  await expect(page.getByText("note.wav", { exact: true }).last()).toBeVisible();
  await expect.poll(() => audio.evaluate((element) => (
    Number.isFinite((element as HTMLAudioElement).duration)
      ? (element as HTMLAudioElement).duration
      : 0
  ))).toBeGreaterThan(0);
  expect(await audio.evaluate((element) => (element as HTMLAudioElement).paused)).toBe(true);

  for (const file of ["video", "audio"] as const) {
    const requests = mediaRequests.filter((request) => request.file === file);
    expect(requests[0]?.method).toBe("HEAD");
    expect(requests.some((request) => request.method === "GET")).toBe(true);
    for (const request of requests) expect(request.range || "").not.toContain(",");
  }

  await page.getByRole("button", { name: /launch-plan\.pdf/ }).click();
  await page.getByRole("button", { name: /demo\.webm/ }).click();
  await page.getByRole("button", { name: /note\.wav/ }).click();
  await expect(page.getByLabel("Preview note.wav")).toBeVisible();
  await expect(page.getByLabel("Preview demo.webm")).toHaveCount(0);
  await expect(page.getByRole("region", {
    name: "PDF preview: launch-plan.pdf",
  })).toHaveCount(0);
});

test("preview errors can be retried without losing asset details", async ({
  page,
  runtimeErrorMonitor,
}) => {
  let failProbes = true;
  await page.route("**/api/v1/files/launch-plan.pdf/preview", async (route) => {
    if (failProbes && route.request().method() === "HEAD") {
      await route.fulfill({ status: 503 });
      return;
    }
    await route.fallback();
  });

  await page.goto("/assets");
  await expect(page.getByRole("heading", {
    name: "Preview unavailable",
  })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
  failProbes = false;
  await page.getByRole("button", { name: "Retry preview" }).click();
  await expect(page.getByRole("img", {
    name: "Page 1 of 2: launch-plan.pdf",
  })).toBeVisible();
  runtimeErrorMonitor.errors = runtimeErrorMonitor.errors.filter(
    (message) => !message.includes("status of 503"),
  );
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
    content_type: "application/x-mnote-fixture",
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
