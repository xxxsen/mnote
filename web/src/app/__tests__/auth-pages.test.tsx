import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  replace: vi.fn(),
  setAuthEmail: vi.fn(),
  setAuthToken: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("@/lib/api", () => ({
  apiFetch: mocks.apiFetch,
  setAuthEmail: mocks.setAuthEmail,
  setAuthToken: mocks.setAuthToken,
}));

import LoginPage from "../login/page";
import OAuthCallbackPage from "../oauth/callback/page";
import RegisterPage from "../register/page";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function enabledProperties() {
  return {
    properties: {
      enable_email_register: true,
      enable_user_register: true,
    },
  };
}

beforeEach(() => {
  mocks.apiFetch.mockReset();
  mocks.replace.mockReset();
  mocks.setAuthEmail.mockReset();
  mocks.setAuthToken.mockReset();
  mocks.searchParams = new URLSearchParams();
  sessionStorage.clear();
});

afterEach(cleanup);

describe("LoginPage", () => {
  it("toggles password visibility without submitting the form", async () => {
    mocks.apiFetch.mockResolvedValueOnce(enabledProperties());
    render(<LoginPage />);

    const password = screen.getByLabelText("Password");
    expect(password.getAttribute("type")).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password.getAttribute("type")).toBe("text");
    expect(mocks.apiFetch).toHaveBeenCalledTimes(1);
  });

  it("locks duplicate submissions and navigates to a safe return", async () => {
    const login = deferred<{ token: string; user: { email: string } }>();
    mocks.searchParams = new URLSearchParams("return=%2Fdocs%3Ffilter%3Dstarred");
    mocks.apiFetch.mockImplementation((endpoint: string) => (
      endpoint === "/properties" ? Promise.resolve(enabledProperties()) : login.promise
    ));
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret" } });
    const form = screen.getByRole("button", { name: "Sign in" }).closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    fireEvent.submit(form!);

    expect(mocks.apiFetch.mock.calls.filter(([endpoint]) => endpoint === "/auth/login")).toHaveLength(1);
    login.resolve({ token: "token", user: { email: "user@example.com" } });
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/docs?filter=starred"));
    expect(mocks.setAuthToken).toHaveBeenCalledWith("token");
  });

  it("does not expose a backend error message", async () => {
    mocks.apiFetch.mockImplementation((endpoint: string) => (
      endpoint === "/properties"
        ? Promise.resolve(enabledProperties())
        : Promise.reject(new Error("code=10000005 internal detail"))
    ));
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Sign in failed");
    expect(alert.textContent).not.toContain("10000005");
  });
});

describe("RegisterPage", () => {
  it("shows a stable loading state before registration settings arrive", () => {
    mocks.apiFetch.mockReturnValue(new Promise(() => undefined));
    render(<RegisterPage />);
    expect(screen.getByRole("status").textContent).toContain("Loading registration settings");
    expect(screen.queryByRole("button", { name: "Create account" })).toBeNull();
  });

  it("does not submit when the password visibility button is used", async () => {
    mocks.apiFetch.mockResolvedValueOnce(enabledProperties());
    render(<RegisterPage />);
    await screen.findByRole("button", { name: "Create account" });
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password").getAttribute("type")).toBe("text");
    expect(mocks.apiFetch).toHaveBeenCalledTimes(1);
  });

  it("locks duplicate verification requests and announces success", async () => {
    const request = deferred<unknown>();
    mocks.apiFetch.mockImplementation((endpoint: string) => (
      endpoint === "/properties" ? Promise.resolve(enabledProperties()) : request.promise
    ));
    render(<RegisterPage />);
    await screen.findByRole("button", { name: "Create account" });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    const send = screen.getByRole("button", { name: "Send code" });
    fireEvent.click(send);
    fireEvent.click(send);

    expect(mocks.apiFetch.mock.calls.filter(([endpoint]) => endpoint === "/auth/register/code")).toHaveLength(1);
    request.resolve({});
    expect((await screen.findByRole("status")).textContent).toContain("Verification code sent");
    expect(screen.getByRole("button", { name: "60s" })).toBeTruthy();
  });
});

describe("OAuthCallbackPage", () => {
  it("rejects an unsafe stored return path after a successful exchange", async () => {
    mocks.searchParams = new URLSearchParams("code=oauth-code");
    sessionStorage.setItem("mnote_oauth_return", "//evil.example/path");
    mocks.apiFetch.mockResolvedValue({ token: "oauth-token", email: "user@example.com" });
    render(<OAuthCallbackPage />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/docs"));
    expect(sessionStorage.getItem("mnote_oauth_return")).toBeNull();
    expect(mocks.setAuthToken).toHaveBeenCalledWith("oauth-token");
  });

  it("renders provider conflicts without exposing an internal code", () => {
    mocks.searchParams = new URLSearchParams("error=conflict");
    render(<OAuthCallbackPage />);
    expect(screen.getByRole("heading", { name: "OAuth sign in failed" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).not.toContain("10000005");
  });
});
