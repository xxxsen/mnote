import { vi } from "vitest";

export function mockRouter() {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
  };
}

export function mockToast() {
  return { toast: vi.fn() };
}

export function mockApiFetch() {
  return vi.fn();
}
