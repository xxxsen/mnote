import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("react-syntax-highlighter", () => ({
  Prism: ({ children }: { children: string }) => <code>{children}</code>,
}));
vi.mock("react-syntax-highlighter/dist/esm/styles/prism/one-light", () => ({
  default: {},
}));
vi.mock("../helpers", () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

import CodeBlock from "../code-block";
import { copyToClipboard } from "../helpers";

beforeEach(() => { vi.clearAllMocks(); });

describe("CodeBlock", () => {
  it("renders with language label", () => {
    render(<CodeBlock language="javascript" fileName="" rawCode="console.log('hi')" />);
    expect(screen.getByText("JAVASCRIPT")).toBeTruthy();
  });

  it("renders code content", () => {
    render(<CodeBlock language="go" fileName="" rawCode="fmt.Println" />);
    expect(screen.getByText("fmt.Println")).toBeTruthy();
  });

  it("renders fileName when provided", () => {
    render(<CodeBlock language="ts" fileName="index.ts" rawCode="const x = 1" />);
    expect(screen.getByText("index.ts")).toBeTruthy();
  });

  it("has copy button", () => {
    const { container } = render(<CodeBlock language="js" fileName="" rawCode="code" />);
    const btn = container.querySelector("button[title='Copy']");
    expect(btn).toBeTruthy();
  });

  it("copy button triggers clipboard", async () => {
    const { container } = render(<CodeBlock language="js" fileName="" rawCode="code" />);
    const btn = container.querySelector("button[title='Copy']")!;
    fireEvent.click(btn);
    expect(copyToClipboard).toHaveBeenCalledWith("code");
  });
});
