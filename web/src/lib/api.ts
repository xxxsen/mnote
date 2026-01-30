const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api/v1";

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

interface FetchOptions extends RequestInit {
  requireAuth?: boolean;
}

const ERR_UNAUTHORIZED = 10000001;

export async function apiFetch<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { requireAuth = true, headers = {}, ...rest } = options;
  
  const authHeaders: Record<string, string> = {};
  if (requireAuth) {
    const token = getAuthToken();
    if (token) {
      authHeaders["Authorization"] = `Bearer ${token}`;
    }
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...headers,
    },
    ...rest,
  });

  if (res.status === 401 && requireAuth) {
    removeAuthToken();
    removeAuthEmail();
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (res.status === 204) return {} as T;

  const payload = await res.json().catch(() => ({}));
  if (!payload || typeof payload !== "object") {
    throw new Error(`API Error: ${res.status}`);
  }
  const code = (payload as { code?: number }).code;
  if (typeof code !== "number") {
    if (!res.ok) {
      throw new Error(`API Error: ${res.status}`);
    }
    return payload as T;
  }
  if (code !== 0) {
    if (code === ERR_UNAUTHORIZED && requireAuth) {
      removeAuthToken();
      removeAuthEmail();
      window.location.href = "/login";
      throw new Error("Unauthorized");
    }
  const msg = (payload as { msg?: string; message?: string }).msg || (payload as { message?: string }).message || "API Error";
    throw new Error(msg);
  }
  return (payload as { data?: T }).data as T;
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
    removeAuthToken();
    removeAuthEmail();
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  const data = await res.json();
  if (!data || typeof data !== "object") {
    throw new Error(`API Error: ${res.status}`);
  }
  const code = (data as { code?: number }).code;
  if (typeof code === "number" && code !== 0) {
    if (code === ERR_UNAUTHORIZED) {
      removeAuthToken();
      removeAuthEmail();
      window.location.href = "/login";
      throw new Error("Unauthorized");
    }
    const msg = (data as { msg?: string; message?: string }).msg || (data as { message?: string }).message || "API Error";
    throw new Error(msg);
  }
  if (data && typeof data === "object" && "data" in data) {
    return (data as { data?: UploadResult }).data as UploadResult;
  }
  return data as UploadResult;
}
