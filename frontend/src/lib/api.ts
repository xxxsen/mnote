const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080/api/v1";

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

export const removeAuthToken = () => {
  if (typeof window !== "undefined") {
    localStorage.removeItem("mnote_token");
  }
};

interface FetchOptions extends RequestInit {
  requireAuth?: boolean;
}

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
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const message = errorData?.error?.message || errorData?.message || `API Error: ${res.status}`;
    throw new Error(message);
  }

  if (res.status === 204) return {} as T;

  const data = await res.json();
  if (data && typeof data === "object" && "data" in data) {
    return data.data as T;
  }
  return data as T;
}
