import { expect, type Page } from "@playwright/test";

const API_BASE = "http://127.0.0.1:8850/api/v1";

type ApiEnvelope<T> = { code: number; message?: string; data: T };
export type TestDocument = {
  id: string;
  title: string;
  content: string;
  content_revision: number;
};

let cachedSession: { token: string; email: string } | null = null;

async function unwrap<T>(response: { json: () => Promise<unknown>; ok: () => boolean }): Promise<T> {
  const body = await response.json() as ApiEnvelope<T>;
  if (!response.ok() || body.code !== 0) throw new Error(body.message || `API error ${body.code}`);
  return body.data;
}

export async function loginTestUser(page: Page): Promise<string> {
  if (!cachedSession) {
    const response = await page.request.post(`${API_BASE}/auth/login`, {
      data: { email: "test@test.com", password: "test" },
    });
    const data = await unwrap<{ token: string; user: { email: string } }>(response);
    cachedSession = { token: data.token, email: data.user.email };
  }

  await page.goto("/login");
  await page.evaluate(({ token, email }) => {
    localStorage.setItem("mnote_token", token);
    localStorage.setItem("mnote_email", email);
  }, cachedSession);
  return cachedSession.token;
}

export async function createDocument(page: Page, token: string, content: string): Promise<TestDocument> {
  const title = content.match(/^#\s+(.+)$/m)?.[1] || `E2E ${Date.now()}`;
  const response = await page.request.post(`${API_BASE}/documents`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { title, content },
  });
  return unwrap<TestDocument>(response);
}

export async function deleteDocument(page: Page, token: string, id: string): Promise<void> {
  await page.request.delete(`${API_BASE}/documents/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function openEditor(page: Page, id: string): Promise<void> {
  await page.goto("/docs/" + id);
  await expect(page.locator(".cm-content")).toHaveCount(1);
  await expect(page.locator(".cm-content")).toBeVisible();
}

export async function replaceEditorContent(page: Page, content: string): Promise<void> {
  const editor = page.locator(".cm-content");
  await editor.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.insertText(content);
}
