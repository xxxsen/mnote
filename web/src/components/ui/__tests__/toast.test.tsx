import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, renderHook, screen } from "@testing-library/react";
import React from "react";

import { ToastProvider, useToast } from "../toast";
import { ApiError } from "@/lib/api";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ToastProvider>{children}</ToastProvider>
);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ToastProvider + useToast", () => {
  it("throws if used outside provider", () => {
    expect(() => renderHook(() => useToast())).toThrow(
      "useToast must be used within ToastProvider",
    );
  });

  it("announces polite and error notifications without exposing API codes", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current.toast({ description: "Saved", variant: "success" });
      vi.advanceTimersByTime(1100);
      result.current.toast({ description: new ApiError("Not found", 404), variant: "error" });
    });

    expect(screen.getByRole("status").textContent).toContain("Saved");
    expect(screen.getByRole("alert").textContent).toContain("Not found");
    expect(screen.getByRole("alert").textContent).not.toContain("404");
  });

  it("deduplicates within one second and caps the visible stack at three", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current.toast({ description: "Same" });
      result.current.toast({ description: "Same" });
      result.current.toast({ description: "Two" });
      result.current.toast({ description: "Three" });
      result.current.toast({ description: "Four" });
    });

    expect(screen.getAllByRole("status")).toHaveLength(3);
    expect(screen.queryByText("Same")).toBeNull();
    expect(screen.getByText("Four")).toBeTruthy();
  });

  it("auto-removes and pauses while hovered", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => result.current.toast({ description: "Temporary", duration: 1000 }));
    const item = screen.getByRole("status");

    act(() => {
      vi.advanceTimersByTime(400);
      fireEvent.mouseEnter(item);
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("Temporary")).toBeTruthy();

    act(() => {
      fireEvent.mouseLeave(item);
      vi.advanceTimersByTime(700);
    });
    expect(screen.queryByText("Temporary")).toBeNull();
  });

  it("close button removes a notification", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => result.current.toast({ description: new Error("Removable") }));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(screen.queryByText("Removable")).toBeNull();
  });
});
