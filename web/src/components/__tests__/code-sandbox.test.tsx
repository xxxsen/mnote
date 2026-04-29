import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, title, disabled, ...props }: React.PropsWithChildren<{ onClick?: () => void; title?: string; disabled?: boolean }>) => (
    <button onClick={onClick} title={title} disabled={disabled} {...props}>{children}</button>
  ),
}));
vi.mock("react-syntax-highlighter", () => ({
  Prism: ({ children }: { children: string }) => <code>{children}</code>,
}));
vi.mock("react-syntax-highlighter/dist/esm/styles/prism/one-light", () => ({
  default: {},
}));
vi.mock("@/lib/sandbox-registry", () => ({
  sandboxRegistry: { run: vi.fn() },
}));

import { CodeSandbox } from "../code-sandbox";
import { sandboxRegistry } from "@/lib/sandbox-registry";

const mockRun = vi.mocked(sandboxRegistry.run);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
});

describe("CodeSandbox", () => {
  it("renders code content", () => {
    render(<CodeSandbox code="console.log('hi')" language="javascript" />);
    expect(screen.getByText("console.log('hi')")).toBeTruthy();
  });

  it("has run code button", () => {
    const { container } = render(<CodeSandbox code="code" language="javascript" />);
    const btn = container.querySelector("button[title='Run Code']");
    expect(btn).toBeTruthy();
  });

  it("has copy button", () => {
    const { container } = render(<CodeSandbox code="code" language="javascript" />);
    const btn = container.querySelector("button[title='Copy Code']");
    expect(btn).toBeTruthy();
  });

  it("calls sandboxRegistry.run on Run click", () => {
    const { container } = render(<CodeSandbox code="let x = 1" language="javascript" />);
    const btn = container.querySelector("button[title='Run Code']")!;
    fireEvent.click(btn);
    expect(mockRun).toHaveBeenCalledWith(expect.objectContaining({
      code: "let x = 1",
      language: "javascript",
    }));
  });

  it("shows display title with fileName", () => {
    render(<CodeSandbox code="code" language="js" fileName="test.js" />);
    expect(screen.getByText("test.js")).toBeTruthy();
  });

  it("shows sandbox title without fileName", () => {
    render(<CodeSandbox code="code" language="python" />);
    expect(screen.getByText("python Sandbox")).toBeTruthy();
  });

  it("prepends package main for Go code", async () => {
    const { container } = render(<CodeSandbox code='func main() {}' language="go" />);
    await vi.waitFor(() => {
      const btn = container.querySelector("button[title='Run Code']") as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });
    const btn = container.querySelector("button[title='Run Code']")!;
    fireEvent.click(btn);
    expect(mockRun).toHaveBeenCalledWith(expect.objectContaining({
      code: "package main\nfunc main() {}",
    }));
  });

  it("copy button copies code to clipboard", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const { container } = render(<CodeSandbox code="hello" language="javascript" />);
    const btn = container.querySelector("button[title='Copy Code']")!;
    fireEvent.click(btn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("hello");
  });

  it("copy handles clipboard error", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    const { container } = render(<CodeSandbox code="hello" language="javascript" />);
    const btn = container.querySelector("button[title='Copy Code']")!;
    fireEvent.click(btn);
  });

  it("run handler receives done message", () => {
    const { container } = render(<CodeSandbox code="code" language="javascript" />);
    const btn = container.querySelector("button[title='Run Code']")!;
    fireEvent.click(btn);
    const call = mockRun.mock.calls[0][0];
    call.onMessage({ type: "stdout", content: "output" });
    call.onMessage({ type: "done", content: "" });
  });

  it("run handler receives error message", () => {
    const { container } = render(<CodeSandbox code="code" language="javascript" />);
    const btn = container.querySelector("button[title='Run Code']")!;
    fireEvent.click(btn);
    const call = mockRun.mock.calls[0][0];
    call.onMessage({ type: "error", content: "runtime error" });
  });

  it("go env check sets goEnvReady false on fetch fail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const { container } = render(<CodeSandbox code="func main() {}" language="go" />);
    await vi.waitFor(() => {
      const btn = container.querySelector("button[title='Run Code']") as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  it("displays js as javascript", () => {
    render(<CodeSandbox code="x" language="js" />);
    expect(screen.getAllByText("javascript Sandbox").length).toBeGreaterThan(0);
  });

  it("displays py as python", () => {
    render(<CodeSandbox code="x" language="py" />);
    expect(screen.getAllByText("python Sandbox").length).toBeGreaterThan(0);
  });
});
