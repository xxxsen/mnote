const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api/v1";

/* v8 ignore start -- SSR guards untestable in jsdom where window is always defined */
export const getAuthToken = () => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("mnote_token");
  }
  return null;
};

export const setAuthToken = (token: string) => {
  if (typeof window !== "undefined") {
    localStorage.setItem("mnote_token", token);
  }
};

export const getAuthEmail = () => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("mnote_email");
  }
  return null;
};

export const setAuthEmail = (email: string) => {
  if (typeof window !== "undefined") {
    localStorage.setItem("mnote_email", email);
  }
};

export const removeAuthToken = () => {
  if (typeof window !== "undefined") {
    localStorage.removeItem("mnote_token");
  }
};

export const removeAuthEmail = () => {
  if (typeof window !== "undefined") {
    localStorage.removeItem("mnote_email");
  }
};
/* v8 ignore stop */

interface FetchOptions extends RequestInit {
  requireAuth?: boolean;
}

const ERR_UNAUTHORIZED = 10000001;

export class ApiError extends Error {
  code: number;
  constructor(message: string, code: number) {
    super(message);
    this.code = code;
    this.name = "ApiError";
  }
}

function redirectToLogin(): never {
  removeAuthToken();
  removeAuthEmail();
  window.location.href = "/login";
  throw new ApiError("Unauthorized", 401);
}

function extractErrorMessage(payload: unknown): string {
  const p = payload as { msg?: string; message?: string };
  return p.msg || p.message || "API Error";
}

function parsePayload(payload: unknown, res: Response, requireAuth: boolean): unknown {
  if (!payload || typeof payload !== "object") {
    throw new ApiError(`API Error: ${res.status}`, res.status);
  }
  const code = (payload as { code?: number }).code;
  if (typeof code !== "number") {
    if (!res.ok) {
      throw new ApiError(`API Error: ${res.status}`, res.status);
    }
    return payload;
  }
  if (code !== 0) {
    if (code === ERR_UNAUTHORIZED && requireAuth) {
      redirectToLogin();
    }
    throw new ApiError(extractErrorMessage(payload), code);
  }
  return (payload as { data?: unknown }).data;
}

export async function apiFetch<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { requireAuth = true, headers: headerInit = {}, ...rest } = options;

  const mergedHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = getAuthToken();
  if (token) {
    mergedHeaders["Authorization"] = `Bearer ${token}`;
  }
  Object.assign(mergedHeaders, headerInit as Record<string, string>);

  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: mergedHeaders,
    ...rest,
  });

  if (res.status === 401 && requireAuth) {
    redirectToLogin();
  }

  if (res.status === 204) return {} as T;

  const payload = await res.json().catch(() => ({}));
  return parsePayload(payload, res, requireAuth) as T;
}

export interface UploadResult {
  url: string;
  name: string;
  content_type: string;
}

export async function uploadFile(file: File): Promise<UploadResult> {
  const token = getAuthToken();
  const form = new FormData();
  form.append("file", file, file.name);

  const res = await fetch(`${API_BASE}/files/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  if (res.status === 401) {
    redirectToLogin();
  }

  const data: unknown = await res.json();
  if (!data || typeof data !== "object") {
    throw new ApiError(`API Error: ${res.status}`, res.status);
  }
  const code = (data as { code?: number }).code;
  if (typeof code === "number" && code !== 0) {
    if (code === ERR_UNAUTHORIZED) {
      redirectToLogin();
    }
    throw new ApiError(extractErrorMessage(data), code);
  }
  if ("data" in data) {
    return (data as { data?: UploadResult }).data as UploadResult;
  }
  return data as UploadResult;
}
