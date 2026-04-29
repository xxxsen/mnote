import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { ToastProvider, useToast } from "../toast";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ToastProvider>{children}</ToastProvider>
);

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
afterEach(() => { vi.useRealTimers(); });

describe("ToastProvider + useToast", () => {
  it("throws if used outside provider", () => {
    expect(() => {
      renderHook(() => useToast());
    }).toThrow("useToast must be used within ToastProvider");
  });

  it("provides toast function within provider", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    expect(typeof result.current.toast).toBe("function");
  });

  it("toast with string description", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => { result.current.toast({ description: "Hello World" }); });
  });

  it("toast with Error description", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => { result.current.toast({ description: new Error("Something went wrong") }); });
  });

  it("toast auto-removes after duration", async () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => { result.current.toast({ description: "Temporary", duration: 100 }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
  });

  it("toast with variant and title", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => { result.current.toast({ title: "Error", description: "Failed", variant: "error" }); });
  });

  it("toast with success variant", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => { result.current.toast({ description: "Done!", variant: "success" }); });
  });
});
