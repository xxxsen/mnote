import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import { GithubIcon, GoogleIcon } from "../brand-icons";

describe("GithubIcon", () => {
  it("renders svg", () => {
    const { container } = render(<GithubIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("passes props", () => {
    const { container } = render(<GithubIcon className="icon" data-testid="gh" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("class")).toBe("icon");
  });
});

describe("GoogleIcon", () => {
  it("renders svg", () => {
    const { container } = render(<GoogleIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("passes props", () => {
    const { container } = render(<GoogleIcon width={24} height={24} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("24");
  });
});
