import type { Page, Route } from "@playwright/test";

export type UiApiState = {
  docsEmpty: boolean;
  loginFails: boolean;
};

const timestamp = 1_784_426_400;
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
  summary: "Launch decisions and follow-up actions.",
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
const assetFixture = {
  id: "asset-1",
  user_id: "user-1",
  file_key: "launch-plan.pdf",
  url: "https://assets.example.test/fixtures/launch-plan.pdf",
  name: "launch-plan.pdf",
  content_type: "application/pdf",
  size: 245_760,
  ctime: timestamp,
  mtime: timestamp,
  ref_count: 1,
};

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
  if (path.endsWith("/summary")) {
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
  if (path === "/api/v1/assets") return ok(route, [assetFixture]);
  if (path === "/api/v1/assets/asset-1/references") {
    return ok(route, [{ document_id: "doc-1", title: documentFixture.title, mtime: timestamp }]);
  }
  if (path.startsWith("/api/v1/auth/")) return ok(route, {});
  return ok(route, {});
}

export async function installUiApi(page: Page, overrides: Partial<UiApiState> = {}) {
  const state: UiApiState = {
    docsEmpty: false,
    loginFails: false,
    ...overrides,
  };
  await page.route("**/api/v1/**", (route) => handleApi(route, state));
  return state;
}
