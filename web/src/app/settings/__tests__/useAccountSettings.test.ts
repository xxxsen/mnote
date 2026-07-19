import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

import { ApiError, apiFetch } from "@/lib/api";
import { useAccountSettings } from "../hooks/useAccountSettings";

const mockApiFetch = vi.mocked(apiFetch);
const toast = vi.fn();

function mockInitialLoad() {
  mockApiFetch.mockImplementation((endpoint) => {
    if (endpoint === "/auth/oauth/bindings") {
      return Promise.resolve({ bindings: [{ provider: "github", email: "user@example.com" }] });
    }
    if (endpoint === "/properties") {
      return Promise.resolve({
        properties: {
          enable_github_oauth: true,
          enable_google_oauth: true,
        },
      });
    }
    return Promise.resolve({});
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockInitialLoad();
});

describe("useAccountSettings", () => {
  it("loads bindings and deployment provider properties together", async () => {
    const { result } = renderHook(() => useAccountSettings(toast));
    await waitFor(() => { expect(result.current.loading).toBe(false); });

    expect(result.current.bindings.github).toEqual({
      bound: true,
      email: "user@example.com",
    });
    expect(result.current.properties?.enable_google_oauth).toBe(true);
  });

  it("shows a retryable page error when initial loading fails", async () => {
    mockApiFetch.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useAccountSettings(toast));
    await waitFor(() => { expect(result.current.loading).toBe(false); });

    expect(result.current.loadError).toBe(true);
    expect(toast).not.toHaveBeenCalled();
  });

  it("validates password confirmation before sending a request", async () => {
    const { result } = renderHook(() => useAccountSettings(toast));
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    mockApiFetch.mockClear();
    act(() => {
      result.current.setNewPassword("new-secret");
      result.current.setConfirmPassword("different");
    });

    await act(async () => { await result.current.updatePassword(); });

    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      description: expect.stringContaining("do not match"),
    }));
  });

  it("locks duplicate password updates and clears all fields after success", async () => {
    const { result } = renderHook(() => useAccountSettings(toast));
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    let resolveUpdate: (() => void) | undefined;
    mockApiFetch.mockImplementation((endpoint) => {
      if (endpoint === "/auth/password") {
        return new Promise<void>((resolve) => { resolveUpdate = resolve; });
      }
      return Promise.resolve({});
    });
    act(() => {
      result.current.setCurrentPassword("old");
      result.current.setNewPassword("new-secret");
      result.current.setConfirmPassword("new-secret");
    });

    let first: Promise<void> | undefined;
    act(() => {
      first = result.current.updatePassword();
      void result.current.updatePassword();
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(3);
    expect(result.current.savingPassword).toBe(true);
    await act(async () => {
      resolveUpdate?.();
      await first;
    });

    expect(result.current.currentPassword).toBe("");
    expect(result.current.newPassword).toBe("");
    expect(result.current.confirmPassword).toBe("");
  });

  it("requires confirmation and maps last-login-method conflicts to guidance", async () => {
    const { result } = renderHook(() => useAccountSettings(toast));
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.requestUnbind("github"); });
    expect(result.current.unbindTarget).toBe("github");
    mockApiFetch.mockRejectedValueOnce(new ApiError("conflict", 10000005));

    await act(async () => { await result.current.confirmUnbind(); });

    expect(result.current.unbindTarget).toBe("github");
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      description: expect.stringContaining("Set a password"),
    }));
  });

  it("locks duplicate unbind requests and updates only the selected provider", async () => {
    const { result } = renderHook(() => useAccountSettings(toast));
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    act(() => { result.current.requestUnbind("github"); });
    let resolveUnbind: (() => void) | undefined;
    mockApiFetch.mockImplementation((endpoint) => {
      if (endpoint === "/auth/oauth/github/bind") {
        return new Promise<void>((resolve) => { resolveUnbind = resolve; });
      }
      return Promise.resolve({});
    });

    let first: Promise<void> | undefined;
    act(() => {
      first = result.current.confirmUnbind();
      void result.current.confirmUnbind();
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(3);
    expect(result.current.pendingProviderAction).toEqual({
      provider: "github",
      action: "unbind",
    });
    await act(async () => {
      resolveUnbind?.();
      await first;
    });

    expect(result.current.bindings.github.bound).toBe(false);
    expect(result.current.bindings.google.bound).toBe(false);
    expect(result.current.unbindTarget).toBeNull();
  });
});
