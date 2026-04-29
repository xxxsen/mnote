import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "../button";

describe("Button", () => {
  it("renders children", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText("Click me")).toBeTruthy();
  });

  it("handles click", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByText("Click"));
    expect(onClick).toHaveBeenCalled();
  });

  it("renders loading state", () => {
    const { container } = render(<Button isLoading>Loading</Button>);
    expect(container.querySelector("button")?.disabled).toBe(true);
  });

  it("renders disabled state", () => {
    const { container } = render(<Button disabled>Disabled</Button>);
    expect(container.querySelector("button")?.disabled).toBe(true);
  });

  it("applies variant classes", () => {
    const { container: c1 } = render(<Button variant="destructive">Del</Button>);
    expect(c1.querySelector("button")?.className).toContain("destructive");

    const { container: c2 } = render(<Button variant="outline">Out</Button>);
    expect(c2.querySelector("button")?.className).toContain("border");

    const { container: c3 } = render(<Button variant="ghost">Ghost</Button>);
    expect(c3.querySelector("button")?.className).toContain("hover:bg-accent");

    const { container: c4 } = render(<Button variant="link">Link</Button>);
    expect(c4.querySelector("button")?.className).toContain("underline");
  });

  it("applies size classes", () => {
    const { container: c1 } = render(<Button size="sm">Small</Button>);
    expect(c1.querySelector("button")?.className).toContain("h-8");

    const { container: c2 } = render(<Button size="lg">Large</Button>);
    expect(c2.querySelector("button")?.className).toContain("h-10");

    const { container: c3 } = render(<Button size="icon">Icon</Button>);
    expect(c3.querySelector("button")?.className).toContain("w-9");
  });

  it("forwards ref", () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Ref</Button>);
    expect(ref.current).toBeTruthy();
    expect(ref.current?.tagName).toBe("BUTTON");
  });

  it("applies custom className", () => {
    const { container } = render(<Button className="custom-class">Custom</Button>);
    expect(container.querySelector("button")?.className).toContain("custom-class");
  });
});
