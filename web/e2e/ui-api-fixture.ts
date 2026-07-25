import type { Page, Route } from "@playwright/test";
import { mkdir, open, writeFile } from "node:fs/promises";
import path from "node:path";

export type UiApiState = {
  docsEmpty: boolean;
  loginFails: boolean;
  mockFiles: boolean;
};

const timestamp = 1_784_426_400;
const PDF_PREVIEW_MAX_BYTES = 25 * 1024 * 1024;
const tag = {
  id: "tag-1",
  user_id: "user-1",
  name: "product",
  pinned: 1,
  ctime: timestamp,
  mtime: timestamp,
};
const documentFixture = {
  id: "doc-1",
  user_id: "user-1",
  title: "Product launch notes",
  content: [
    "# Product launch notes",
    "",
    "A stable fixture for the unified interface.",
    "",
    "## Decisions",
    "",
    "- Ship the responsive shell",
    "- Verify keyboard navigation",
    "",
    "## Follow-up",
    "",
    "Measure the experience after release.",
  ].join("\n"),
  state: 1,
  pinned: 1,
  starred: 1,
  ctime: timestamp - 3600,
  mtime: timestamp,
  content_hash: "fixture-hash",
  content_mtime: timestamp,
  content_revision: 3,
  tag_ids: ["tag-1"],
  tags: [tag],
};
const todoFixtures = [
  {
    id: "todo-1",
    user_id: "user-1",
    content: "Review the release checklist with the product team",
    due_date: "2026-07-19",
    done: 0,
    ctime: timestamp,
    mtime: timestamp,
  },
  {
    id: "todo-2",
    user_id: "user-1",
    content: "Publish the migration guide",
    due_date: "2026-07-19",
    done: 1,
    ctime: timestamp,
    mtime: timestamp,
  },
];
const templateFixture = {
  id: "template-1",
  user_id: "user-1",
  name: "Weekly review",
  description: "Capture outcomes and next steps.",
  content: "# {{TITLE}}\n\nDate: {{SYS:TODAY}}\n\n## Outcomes\n\n{{OUTCOMES}}",
  default_tag_ids: ["tag-1"],
  built_in: 0,
  ctime: timestamp,
  mtime: timestamp,
};
const VIDEO_BASE64 = "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAM4EU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEjTbuMU6uEHFO7a1OsggMi7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjEuNy4xMDJXQYxMYXZmNjEuNy4xMDJEiYhAgEAAAAAAABZUrmvIrgEAAAAAAAA/14EBc8WInnns70jmQ/ucgQAitZyDdW5kiIEAhoVWX1ZQOIOBASPjg4QCYloA4JCwgaC6gVqagQJVsIRVuYEBElTDZ/tzc59jwIBnyJlFo4dFTkNPREVSRIeMTGF2ZjYxLjcuMTAyc3PWY8CLY8WInnns70jmQ/tnyKFFo4dFTkNPREVSRIeUTGF2YzYxLjE5LjEwMSBsaWJ2cHhnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjAwLjUyMDAwMDAwMAAfQ7Z1QXnngQCjvYEAAIBQBQCdASqgAFoAAEcIhYWIhYSIAgIABigPCHVUmu4h1VJruIdVSa7iHVUmu4h1VJruIbwA/v+rUICjmIEAKAARAgABEBAAGAAYWC/0AAiAgQAAAKOYgQBQABECAAEQEAAYABhYL/QACICBAAAAo5iBAHgAEQIAARAQABgAGFgv9AAIgIEAAACjmIEAoAARAgABEBAAGAAYWC/0AAiAgQAAAKOYgQDIABECAAEQEAAYABhYL/QACICBAAAAo5iBAPAAEQIAARAQABgAGFgv9AAIgIEAAACjl4EBGADxAQABEBAUYABhYL/QACICBAAAo5iBAUAAEQIAARAQABgAGFgv9AAIgIEAAACjmIEBaAARAgABEBAAGAAYWC/0AAiAgQAAAKOYgQGQABECAAEQEAAYABhYL/QACICBAAAAo5iBAbgAEQIAARAQABgAGFgv9AAIgIEAAACjmIEB4AARAgABEBAAGAAYWC/0AAiAgQAAABxTu2uRu4+zgQC3iveBAfGCAaPwgQM=";
const AUDIO_BASE64 = "UklGRoYBAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAATElTVBoAAABJTkZPSVNGVA0AAABMYXZmNjEuNy4xMDIAAGRhdGFAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

const ENCRYPTED_PDF_BASE64 = "JVBERi0xLjMKJeLjz9MKMSAwIG9iago8PAovUHJvZHVjZXIgPDdlMmEwNWI5YWI+Cj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9UeXBlIC9QYWdlcwovQ291bnQgMQovS2lkcyBbIDQgMCBSIF0KPj4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDIgMCBSCj4+CmVuZG9iago0IDAgb2JqCjw8Ci9UeXBlIC9QYWdlCi9SZXNvdXJjZXMgPDwKPj4KL01lZGlhQm94IFsgMC4wIDAuMCA0MjAgNTk0IF0KL1BhcmVudCAyIDAgUgo+PgplbmRvYmoKNSAwIG9iago8PAovViAxCi9SIDIKL0xlbmd0aCA0MAovUCA0Mjk0OTY3MjkyCi9GaWx0ZXIgL1N0YW5kYXJkCi9PIDxlNWE4ZDI2ODdiZDlkMGNmZjk0NmI3YWM1NWY1MTA4MWRjZjBkMTE2NTU0YzRiZmNiMGE1ZTQ0NmY2OWVhNDhhPgovVSA8NjgxNDQwMGZjMGQ2OTA0OTMyOWFkYTE2Njk3YmIyMDQ3YjgyZTUxOTEzMDU4ZDhhMjZmMDU3NjIxMzIwNDExNj4KPj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxNSAwMDAwMCBuIAowMDAwMDAwMDU5IDAwMDAwIG4gCjAwMDAwMDAxMTggMDAwMDAgbiAKMDAwMDAwMDE2NyAwMDAwMCBuIAowMDAwMDAwMjYxIDAwMDAwIG4gCnRyYWlsZXIKPDwKL1NpemUgNgovUm9vdCAzIDAgUgovSW5mbyAxIDAgUgovSUQgWyA8NjYzMTM4NjI2MzY0NjMzNTM5MzMzMjM4MzQzNzYyMzk2MjY0MzE2NjMwNjMzMzM3MzkzODMxNjE2NDMwMzIzMD4gPDY2MzEzODYyNjM2NDYzMzUzOTMzMzIzODM0Mzc2MjM5NjI2NDMxNjYzMDYzMzMzNzM5MzgzMTYxNjQzMDMyMzA+IF0KL0VuY3J5cHQgNSAwIFIKPj4Kc3RhcnR4cmVmCjQ3NQolJUVPRgo=";

function buildPDFFixture(pageCount: number, activeContent = false) {
  const fontObject = 3 + pageCount * 2;
  const actionObject = activeContent ? fontObject + 1 : 0;
  const annotationObject = activeContent ? fontObject + 2 : 0;
  const objects: string[] = [];
  objects.push(
    activeContent
      ? `<< /Type /Catalog /Pages 2 0 R /OpenAction ${actionObject} 0 R >>`
      : "<< /Type /Catalog /Pages 2 0 R >>",
  );
  const pageObjects = Array.from({ length: pageCount }, (_, index) => 3 + index * 2);
  objects.push(`<< /Type /Pages /Kids [${pageObjects.map((value) => `${value} 0 R`).join(" ")}] /Count ${pageCount} >>`);
  for (let index = 0; index < pageCount; index += 1) {
    const pageObject = 3 + index * 2;
    const contentObject = pageObject + 1;
    const annotation = activeContent && index === 0
      ? ` /Annots [${annotationObject} 0 R]`
      : "";
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 594] /Resources << /Font << /F1 ${fontObject} 0 R >> >> /Contents ${contentObject} 0 R${annotation} >>`);
    const stream = `BT /F1 20 Tf 48 520 Td (Preview page ${index + 1}) Tj ET`;
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  if (activeContent) {
    objects.push("<< /S /JavaScript /JS (app.alert\\(1\\)) >>");
    objects.push("<< /Type /Annot /Subtype /Link /Rect [40 40 240 80] /A << /S /URI /URI (https://evil.example.test/) >> >>");
  }

  let output = "%PDF-1.7\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n`;
  output += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    output += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(output, "ascii");
}

const fileFixtures = new Map<string, { contentType: string; data: Buffer }>([
  ["launch-plan.pdf", { contentType: "application/pdf", data: buildPDFFixture(2) }],
  ["scripted.pdf", { contentType: "application/pdf", data: buildPDFFixture(1, true) }],
  ["many-pages.pdf", { contentType: "application/pdf", data: buildPDFFixture(501) }],
  ["broken.pdf", { contentType: "application/pdf", data: Buffer.from("%PDF-1.7\nbroken", "ascii") }],
  ["encrypted.pdf", { contentType: "application/pdf", data: Buffer.from(ENCRYPTED_PDF_BASE64, "base64") }],
  ["spoofed.pdf", { contentType: "text/html", data: Buffer.from("<!doctype html><script>alert(1)</script>", "ascii") }],
  ["demo.webm", { contentType: "video/webm", data: Buffer.from(VIDEO_BASE64, "base64") }],
  ["note.wav", { contentType: "audio/wav", data: Buffer.from(AUDIO_BASE64, "base64") }],
]);

const assetFixtures = [
  {
    id: "asset-1",
    user_id: "user-1",
    file_key: "launch-plan.pdf",
    url: "https://assets.example.test/fixtures/launch-plan.pdf",
    name: "launch-plan.pdf",
    content_type: "application/pdf",
    size: fileFixtures.get("launch-plan.pdf")?.data.length || 0,
    ctime: timestamp,
    mtime: timestamp,
    ref_count: 1,
  },
  {
    id: "asset-2",
    user_id: "user-1",
    file_key: "demo.webm",
    url: "https://assets.example.test/fixtures/demo.webm",
    name: "demo.webm",
    content_type: "video/webm",
    size: fileFixtures.get("demo.webm")?.data.length || 0,
    ctime: timestamp,
    mtime: timestamp,
    ref_count: 0,
  },
  {
    id: "asset-3",
    user_id: "user-1",
    file_key: "note.wav",
    url: "https://assets.example.test/fixtures/note.wav",
    name: "note.wav",
    content_type: "audio/wav",
    size: fileFixtures.get("note.wav")?.data.length || 0,
    ctime: timestamp,
    mtime: timestamp,
    ref_count: 0,
  },
];

export async function prepareMediaFixtures() {
  const uploadDir = path.resolve(__dirname, "../../.dev-data/uploads");
  await mkdir(uploadDir, { recursive: true });
  await Promise.all(Array.from(fileFixtures, ([fileKey, fixture]) => (
    writeFile(path.join(uploadDir, fileKey), fixture.data)
  )));

  const largePDF = await open(path.join(uploadDir, "too-large.pdf"), "w");
  try {
    await largePDF.write(Buffer.from("%PDF-1.7\n", "ascii"), 0);
    await largePDF.truncate(PDF_PREVIEW_MAX_BYTES + 1);
  } finally {
    await largePDF.close();
  }
}

function ok(route: Route, data: unknown) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 0, data }),
  });
}

function apiError(route: Route, code: number, message: string) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code, msg: message }),
  });
}

function parseRange(value: string, size: number) {
  const match = /^bytes=(\d+)-(\d*)$/.exec(value);
  if (!match) return null;
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(start)
    || !Number.isSafeInteger(requestedEnd)
    || start < 0
    || requestedEnd < start
    || start >= size
  ) {
    return null;
  }
  return { start, end: Math.min(requestedEnd, size - 1) };
}

async function handleFile(route: Route, path: string, method: string) {
  const parts = path.split("/");
  const fileKey = decodeURIComponent(parts[4] || "");
  const preview = parts[5] === "preview";
  if (fileKey === "too-large.pdf" && preview) {
    return route.fulfill({ status: 413 });
  }
  const fixture = fileFixtures.get(fileKey);
  if (!fixture) return route.fulfill({ status: 404 });

  const pdf = fixture.contentType === "application/pdf";
  const disposition = pdf ? "attachment" : "inline";
  const headers: Record<string, string> = {
    "Content-Type": fixture.contentType,
    "Content-Disposition": `${disposition}; filename="${fileKey}"`,
    "Content-Length": String(fixture.data.length),
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-transform",
  };
  if (pdf) {
    headers["Content-Security-Policy"] =
      "sandbox; default-src 'none'; object-src 'none'; frame-ancestors 'none'";
  }
  if (method === "HEAD") {
    return route.fulfill({ status: 200, headers });
  }

  const rangeValue = route.request().headers()["range"];
  if (!rangeValue) {
    return route.fulfill({ status: 200, headers, body: fixture.data });
  }
  const range = parseRange(rangeValue, fixture.data.length);
  if (!range) {
    return route.fulfill({
      status: 416,
      headers: {
        ...headers,
        "Content-Range": `bytes */${fixture.data.length}`,
        "Content-Length": "0",
      },
    });
  }
  const body = fixture.data.subarray(range.start, range.end + 1);
  return route.fulfill({
    status: 206,
    headers: {
      ...headers,
      "Content-Length": String(body.length),
      "Content-Range": `bytes ${range.start}-${range.end}/${fixture.data.length}`,
    },
    body,
  });
}

function tagsSummary(url: URL) {
  const limit = Number(url.searchParams.get("limit") || "10");
  return Array.from({ length: Math.min(limit, 3) }, (_, index) => ({
    id: `tag-${index + 1}`,
    name: ["product", "research", "release"][index],
    pinned: index === 0 ? 1 : 0,
    count: [8, 5, 3][index],
  }));
}

async function handlePublicShare(route: Route, url: URL) {
  const token = url.pathname.split("/")[5] || "";
  if (token === "protected" && url.searchParams.get("password") !== "open-sesame") {
    return apiError(route, 10000002, "Password required");
  }
  if (token === "expired") {
    return apiError(route, 10000003, "Share unavailable");
  }
  if (url.pathname.endsWith("/comments")) {
    return ok(route, {
      items: [{
        id: "comment-1",
        share_id: "share-1",
        document_id: "doc-1",
        root_id: "",
        reply_to_id: "",
        author: "Guest #A11Y",
        content: "The responsive layout reads clearly.",
        reply_count: 0,
        state: 1,
        ctime: timestamp,
        mtime: timestamp,
      }],
      total: 1,
    });
  }
  return ok(route, {
    document: documentFixture,
    author: "reader@example.com",
    tags: [tag],
    permission: 2,
    allow_download: token === "no-download" ? 0 : 1,
    expires_at: timestamp + 86_400,
  });
}

async function handleDocuments(route: Route, url: URL, method: string, state: UiApiState) {
  const path = url.pathname;
  if (method === "GET" && path === "/api/v1/documents/summary") {
    return ok(route, {
      recent: state.docsEmpty ? [] : [documentFixture],
      tag_counts: { "tag-1": 1 },
      total: state.docsEmpty ? 0 : 1,
      starred_total: state.docsEmpty ? 0 : 1,
    });
  }
  if (path.endsWith("/versions/2")) {
    return ok(route, {
      id: "version-2",
      document_id: "doc-1",
      version: 2,
      title: "Product launch draft",
      content: "# Product launch draft\n\nEarlier copy.\n\n## Decisions\n\n- Validate mobile.",
      ctime: timestamp - 7200,
    });
  }
  if (path.endsWith("/versions")) {
    return ok(route, [{
      id: "version-2",
      document_id: "doc-1",
      version: 2,
      title: "Product launch draft",
      ctime: timestamp - 7200,
    }]);
  }
  if (path.endsWith("/backlinks")) return ok(route, []);
  if (path.endsWith("/similar")) return ok(route, { items: [] });
  if (path.endsWith("/share")) return ok(route, { share: null });
  if (path === "/api/v1/documents" && method === "GET") {
    return ok(route, state.docsEmpty ? [] : [documentFixture]);
  }
  if (path === "/api/v1/documents" && method === "POST") {
    return ok(route, documentFixture);
  }
  if (path === "/api/v1/documents/doc-1" && method === "PUT") {
    return ok(route, {
      id: "doc-1",
      accepted: true,
      reason: "",
      version: 4,
      content_revision: 4,
      content_hash: "saved-hash",
      content_mtime: timestamp,
      mtime: timestamp,
    });
  }
  if (path === "/api/v1/documents/doc-1" && url.searchParams.has("include")) {
    return ok(route, { document: documentFixture, tag_ids: ["tag-1"], tags: [tag] });
  }
  if (path === "/api/v1/documents/doc-1") {
    return ok(route, { document: documentFixture });
  }
  return ok(route, {});
}

async function handleApi(route: Route, state: UiApiState) {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;
  const method = request.method();

  if (path.startsWith("/api/v1/public/share/")) {
    return handlePublicShare(route, url);
  }
  if (path.startsWith("/api/v1/files/")) {
    return state.mockFiles
      ? handleFile(route, path, method)
      : route.fallback();
  }
  if (path === "/api/v1/properties") {
    return ok(route, {
      properties: {
        enable_github_oauth: true,
        enable_google_oauth: true,
        enable_user_register: true,
        enable_email_register: true,
      },
      banner: { enable: true, title: "Maintenance", wording: "No interruption expected." },
    });
  }
  if (path === "/api/v1/auth/login") {
    return state.loginFails
      ? apiError(route, 10000001, "Invalid credentials")
      : ok(route, { token: "e2e-token", user: { email: "reader@example.com" } });
  }
  if (path === "/api/v1/auth/oauth/bindings") {
    return ok(route, { bindings: [{ provider: "github", email: "reader@example.com" }] });
  }
  if (path.startsWith("/api/v1/documents")) {
    return handleDocuments(route, url, method, state);
  }
  if (path === "/api/v1/shares" || path === "/api/v1/shares/") {
    return ok(route, { items: [] });
  }
  if (path === "/api/v1/tags/ids") return ok(route, [tag]);
  if (path === "/api/v1/tags/summary") return ok(route, tagsSummary(url));
  if (path === "/api/v1/tags") return ok(route, [tag]);
  if (path === "/api/v1/todos" && method === "GET") return ok(route, todoFixtures);
  if (path.startsWith("/api/v1/todos/") || (path === "/api/v1/todos" && method !== "GET")) {
    return ok(route, todoFixtures[0]);
  }
  if (path === "/api/v1/templates/meta") {
    return ok(route, { items: [templateFixture], total: 1 });
  }
  if (path === "/api/v1/templates/template-1") return ok(route, templateFixture);
  if (path.startsWith("/api/v1/templates/")) return ok(route, {});
  if (path === "/api/v1/assets") return ok(route, assetFixtures);
  if (path.startsWith("/api/v1/assets/") && path.endsWith("/references")) {
    const references = path.includes("/asset-1/")
      ? [{ document_id: "doc-1", title: documentFixture.title, mtime: timestamp }]
      : [];
    return ok(route, references);
  }
  if (path.startsWith("/api/v1/auth/")) return ok(route, {});
  return ok(route, {});
}

export async function installUiApi(page: Page, overrides: Partial<UiApiState> = {}) {
  const state: UiApiState = {
    docsEmpty: false,
    loginFails: false,
    mockFiles: true,
    ...overrides,
  };
  await page.route("**/api/v1/**", (route) => handleApi(route, state));
  return state;
}
