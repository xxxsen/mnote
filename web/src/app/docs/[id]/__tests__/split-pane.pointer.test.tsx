import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SplitPane } from "../components/SplitPane";

afterEach(cleanup);

describe("SplitPane pointer input", () => {
  it.each(["mouse", "touch"])("resizes from %s pointer movement", (pointerType) => {
    const onRatioChange = vi.fn();
    render(
      <SplitPane
        ratio={50}
        onRatioChange={onRatioChange}
        left={<div />}
        right={<div />}
      />,
    );
    const separator = screen.getByRole("separator");
    const container = separator.parentElement as HTMLElement;
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
      x: 100,
      y: 0,
      left: 100,
      right: 1100,
      top: 0,
      bottom: 500,
      width: 1000,
      height: 500,
      toJSON: () => ({}),
    });
    Object.assign(separator, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
    });

    fireEvent.pointerDown(separator, {
      pointerId: 1,
      pointerType,
      clientX: 400,
    });
    fireEvent.pointerMove(separator, {
      pointerId: 1,
      pointerType,
      clientX: 800,
    });

    expect(onRatioChange.mock.calls.map((call) => call[0])).toEqual([30, 70]);
  });
});
