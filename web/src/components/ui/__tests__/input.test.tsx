import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { Input } from "../input";

describe("Input", () => {
  it("renders input element", () => {
    render(<Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText("Enter text")).toBeTruthy();
  });

  it("handles change", () => {
    const onChange = vi.fn();
    render(<Input onChange={onChange} placeholder="type" />);
    fireEvent.change(screen.getByPlaceholderText("type"), { target: { value: "hello" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("forwards ref", () => {
    const ref = React.createRef<HTMLInputElement>();
    render(<Input ref={ref} />);
    expect(ref.current?.tagName).toBe("INPUT");
  });

  it("applies custom className", () => {
    const { container } = render(<Input className="custom" />);
    expect(container.querySelector("input")?.className).toContain("custom");
  });

  it("sets type attribute", () => {
    const { container } = render(<Input type="password" />);
    expect(container.querySelector("input")?.type).toBe("password");
  });

  it("supports disabled state", () => {
    const { container } = render(<Input disabled />);
    expect(container.querySelector("input")?.disabled).toBe(true);
  });
});
