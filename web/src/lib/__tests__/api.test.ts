import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getAuthToken, setAuthToken, getAuthEmail, setAuthEmail,
  removeAuthToken, removeAuthEmail, ApiError, apiFetch, uploadFile,
} from "../api";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("localStorage helpers", () => {
  it("getAuthToken returns null when empty", () => {
    expect(getAuthToken()).toBeNull();
  });

  it("setAuthToken / getAuthToken round-trip", () => {
    setAuthToken("tok123");
    expect(getAuthToken()).toBe("tok123");
  });

  it("getAuthEmail returns null when empty", () => {
    expect(getAuthEmail()).toBeNull();
  });

  it("setAuthEmail / getAuthEmail round-trip", () => {
    setAuthEmail("a@b.com");
    expect(getAuthEmail()).toBe("a@b.com");
  });

  it("removeAuthToken clears stored token", () => {
    setAuthToken("tok");
    removeAuthToken();
    expect(getAuthToken()).toBeNull();
  });

  it("removeAuthEmail clears stored email", () => {
    setAuthEmail("e@e.com");
    removeAuthEmail();
    expect(getAuthEmail()).toBeNull();
  });
});

describe("ApiError", () => {
  it("has correct name and code", () => {
    const err = new ApiError("test", 42);
    expect(err.name).toBe("ApiError");
    expect(err.code).toBe(42);
    expect(err.message).toBe("test");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("apiFetch", () => {
  const mockFetch = (body: unknown, status = 200) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    }));
  };

  it("sends GET with auth header when token exists", async () => {
    setAuthToken("mytoken");
    mockFetch({ code: 0, data: { id: 1 } });
    const result = await apiFetch<{ id: number }>("/test");
    expect(result).toEqual({ id: 1 });
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1].headers["Authorization"]).toBe("Bearer mytoken");
  });

  it("sends request without auth header when no token", async () => {
    mockFetch({ code: 0, data: "ok" });
    await apiFetch("/test");
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1].headers["Authorization"]).toBeUndefined();
  });

  it("returns empty object for 204 status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 204, json: () => Promise.resolve(null),
    }));
    const result = await apiFetch("/test");
    expect(result).toEqual({});
  });

  it("throws ApiError for non-zero code", async () => {
    mockFetch({ code: 1001, msg: "bad request" });
    await expect(apiFetch("/test")).rejects.toThrow(ApiError);
    await expect(apiFetch("/test")).rejects.toHaveProperty("code", 1001);
  });

  it("throws ApiError when code is missing and response not ok", async () => {
    mockFetch({ msg: "fail" }, 500);
    await expect(apiFetch("/test")).rejects.toThrow("API Error: 500");
  });

  it("returns payload directly when no code field and response ok", async () => {
    mockFetch({ result: "yes" });
    const data = await apiFetch<{ result: string }>("/test");
    expect(data).toEqual({ result: "yes" });
  });

  it("throws on null payload", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 400, json: () => Promise.resolve(null),
    }));
    await expect(apiFetch("/test")).rejects.toThrow("API Error: 400");
  });

  it("handles json parse failure gracefully", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 502, json: () => Promise.reject(new Error("parse")),
    }));
    await expect(apiFetch("/test")).rejects.toThrow("API Error: 502");
  });

  it("redirects to login on 401 with requireAuth", async () => {
    const hrefSetter = vi.fn();
    Object.defineProperty(window, "location", {
      value: { href: "" },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window.location, "href", {
      set: hrefSetter,
      get: () => "",
      configurable: true,
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 401, json: () => Promise.resolve({}),
    }));
    await expect(apiFetch("/test")).rejects.toThrow();
    expect(hrefSetter).toHaveBeenCalledWith("/login");
  });

  it("uses requireAuth=false to skip redirect on 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 401, json: () => Promise.resolve({}),
    }));
    await expect(apiFetch("/test", { requireAuth: false })).rejects.toThrow("API Error: 401");
  });

  it("extracts message from msg or message field", async () => {
    mockFetch({ code: 99, message: "from message" });
    await expect(apiFetch("/test")).rejects.toThrow("from message");
  });

  it("defaults error message to API Error", async () => {
    mockFetch({ code: 99 });
    await expect(apiFetch("/test")).rejects.toThrow("API Error");
  });

  it("merges custom headers", async () => {
    mockFetch({ code: 0, data: null });
    await apiFetch("/test", { headers: { "X-Custom": "val" } });
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1].headers["X-Custom"]).toBe("val");
  });

  it("redirects on code 10000001 with requireAuth", async () => {
    const hrefSetter = vi.fn();
    Object.defineProperty(window, "location", {
      value: { href: "" },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window.location, "href", {
      set: hrefSetter,
      get: () => "",
      configurable: true,
    });
    mockFetch({ code: 10000001, msg: "unauth" });
    await expect(apiFetch("/test")).rejects.toThrow();
    expect(hrefSetter).toHaveBeenCalledWith("/login");
  });
});

describe("uploadFile", () => {
  it("uploads file and returns result", async () => {
    setAuthToken("tok");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({ code: 0, data: { url: "u", name: "n", content_type: "ct" } }),
    }));
    const file = new File(["data"], "test.txt", { type: "text/plain" });
    const result = await uploadFile(file);
    expect(result).toEqual({ url: "u", name: "n", content_type: "ct" });
  });

  it("uploads without auth header when no token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({ url: "u", name: "n", content_type: "ct" }),
    }));
    const file = new File(["data"], "f.txt");
    const result = await uploadFile(file);
    expect(result).toEqual({ url: "u", name: "n", content_type: "ct" });
  });

  it("throws on error code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({ code: 500, msg: "upload fail" }),
    }));
    const file = new File(["data"], "f.txt");
    await expect(uploadFile(file)).rejects.toThrow("upload fail");
  });

  it("throws on null response body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 500,
      json: () => Promise.resolve(null),
    }));
    const file = new File(["data"], "f.txt");
    await expect(uploadFile(file)).rejects.toThrow("API Error: 500");
  });

  it("redirects on 401", async () => {
    const hrefSetter = vi.fn();
    Object.defineProperty(window, "location", {
      value: { href: "" },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window.location, "href", {
      set: hrefSetter,
      get: () => "",
      configurable: true,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 401, json: () => Promise.resolve({}),
    }));
    const file = new File(["data"], "f.txt");
    await expect(uploadFile(file)).rejects.toThrow();
    expect(hrefSetter).toHaveBeenCalledWith("/login");
  });

  it("redirects on code 10000001", async () => {
    const hrefSetter = vi.fn();
    Object.defineProperty(window, "location", {
      value: { href: "" },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window.location, "href", {
      set: hrefSetter,
      get: () => "",
      configurable: true,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({ code: 10000001, msg: "unauth" }),
    }));
    const file = new File(["data"], "f.txt");
    await expect(uploadFile(file)).rejects.toThrow();
    expect(hrefSetter).toHaveBeenCalledWith("/login");
  });
});
