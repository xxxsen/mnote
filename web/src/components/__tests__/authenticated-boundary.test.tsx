import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace }),
}));

import { AuthenticatedBoundary } from "../authenticated-boundary";

beforeEach(() => {
  localStorage.clear();
  navigation.replace.mockReset();
  window.history.replaceState({}, "", "/templates?q=meeting");
});

afterEach(cleanup);

describe("AuthenticatedBoundary", () => {
  it("shows a stable authentication state and replaces with a safe return path", async () => {
    render(<AuthenticatedBoundary><div>Private content</div></AuthenticatedBoundary>);
    expect(screen.getByRole("status").textContent).toContain("Checking your session");
    expect(screen.queryByText("Private content")).toBeNull();
    await waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith(
        "/login?return=%2Ftemplates%3Fq%3Dmeeting",
      );
    });
  });

  it("renders children without redirect when a token is present", () => {
    localStorage.setItem("mnote_token", "valid-token");
    render(<AuthenticatedBoundary><div>Private content</div></AuthenticatedBoundary>);
    expect(screen.getByText("Private content")).toBeTruthy();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("does not redirect a valid session while hydrating the server loading state", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = renderToString(
      <AuthenticatedBoundary><div>Private content</div></AuthenticatedBoundary>,
    );
    localStorage.setItem("mnote_token", "valid-token");

    const root = hydrateRoot(
      container,
      <AuthenticatedBoundary><div>Private content</div></AuthenticatedBoundary>,
    );
    await act(async () => undefined);

    expect(screen.getByText("Private content")).toBeTruthy();
    expect(navigation.replace).not.toHaveBeenCalled();
    root.unmount();
    container.remove();
  });

  it("reacts consistently when the token is removed", async () => {
    localStorage.setItem("mnote_token", "expired-token");
    render(<AuthenticatedBoundary><div>Private content</div></AuthenticatedBoundary>);
    act(() => {
      localStorage.removeItem("mnote_token");
      window.dispatchEvent(new Event("mnote-auth-change"));
    });
    expect(screen.getByRole("status")).toBeTruthy();
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledOnce());
  });
});
