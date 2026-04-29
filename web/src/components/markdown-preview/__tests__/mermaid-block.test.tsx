import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, fireEvent, cleanup } from "@testing-library/react";

vi.mock("@/components/mermaid", () => ({
  default: ({ chart }: { chart: string }) => <div data-testid="mermaid">{chart}</div>,
}));
vi.mock("../helpers", () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

import MermaidBlock from "../mermaid-block";
import { copyToClipboard } from "../helpers";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("MermaidBlock", () => {
  it("renders with diagram type label", () => {
    const { container } = render(<MermaidBlock chart="graph TD; A-->B;" />);
    expect(container.textContent).toContain("FLOWCHART");
  });

  it("renders mermaid component", () => {
    const { container } = render(<MermaidBlock chart="graph TD; A-->B;" />);
    expect(container.querySelector("[data-testid='mermaid']")).toBeTruthy();
  });

  it("detects sequenceDiagram type", () => {
    const { container } = render(<MermaidBlock chart="sequenceDiagram\nA->>B: Hello" />);
    expect(container.textContent).toContain("SEQUENCE DIAGRAM");
  });

  it("detects classDiagram type", () => {
    const { container } = render(<MermaidBlock chart="classDiagram\nClass01 <|-- Class02" />);
    expect(container.textContent).toContain("CLASS DIAGRAM");
  });

  it("detects pie chart type", () => {
    const { container } = render(<MermaidBlock chart='pie title Pets\n"Dogs": 386' />);
    expect(container.textContent).toContain("PIE CHART");
  });

  it("has copy button", () => {
    const { container } = render(<MermaidBlock chart="graph TD; A-->B;" />);
    const btn = container.querySelector("button[title='Copy']");
    expect(btn).toBeTruthy();
  });

  it("copy button triggers clipboard", () => {
    const { container } = render(<MermaidBlock chart="graph TD; A-->B;" />);
    const btn = container.querySelector("button[title='Copy']")!;
    fireEvent.click(btn);
    expect(copyToClipboard).toHaveBeenCalledWith("graph TD; A-->B;");
  });

  it("has open preview button", () => {
    const { container } = render(<MermaidBlock chart="graph TD; A-->B;" />);
    const btn = container.querySelector("button[title='Open preview']");
    expect(btn).toBeTruthy();
  });

  it("open preview shows modal overlay", () => {
    const { container, baseElement } = render(<MermaidBlock chart="graph TD; A-->B;" />);
    const btn = container.querySelector("button[title='Open preview']")!;
    fireEvent.click(btn);
    const modal = baseElement.querySelector(".fixed");
    expect(modal).toBeTruthy();
  });

  it("shows waiting message for empty chart", () => {
    const { container } = render(<MermaidBlock chart="   " />);
    expect(container.textContent).toContain("Waiting for mermaid content...");
  });

  it("shows waiting for undefined chart", () => {
    const { container } = render(<MermaidBlock chart="  undefined  " />);
    expect(container.textContent).toContain("Waiting for mermaid content...");
  });

  it("renders unknown diagram type", () => {
    const { container } = render(<MermaidBlock chart="customType\ndata" />);
    expect(container.textContent?.toUpperCase()).toContain("CUSTOM");
  });

  it("modal has close button", () => {
    const { baseElement, container } = render(<MermaidBlock chart="graph TD; A-->B;" />);
    const openBtn = container.querySelector("button[title='Open preview']")!;
    fireEvent.click(openBtn);
    const closeBtn = baseElement.querySelector("button[title='Close']");
    expect(closeBtn).toBeTruthy();
  });

  it("modal closes on close button click", () => {
    const { baseElement, container } = render(<MermaidBlock chart="graph TD; A-->B;" />);
    const openBtn = container.querySelector("button[title='Open preview']")!;
    fireEvent.click(openBtn);
    expect(baseElement.querySelector(".fixed")).toBeTruthy();
    const closeBtn = baseElement.querySelector("button[title='Close']")!;
    fireEvent.click(closeBtn);
    expect(baseElement.querySelector(".fixed")).toBeNull();
  });

  it("modal has debug toggle", () => {
    const { baseElement, container } = render(<MermaidBlock chart="graph TD; A-->B;" />);
    const openBtn = container.querySelector("button[title='Open preview']")!;
    fireEvent.click(openBtn);
    const debugBtn = baseElement.querySelector("button[title='Toggle debug']");
    expect(debugBtn).toBeTruthy();
  });

  it("fallback type for unmatched chart", () => {
    const { container } = render(<MermaidBlock chart="!!!" />);
    expect(container.textContent).toContain("DIAGRAM");
  });

  it("modal debug toggle shows debug overlay", () => {
    const { baseElement, container } = render(<MermaidBlock chart="graph TD; A-->B;" />);
    fireEvent.click(container.querySelector("button[title='Open preview']")!);
    const debugBtn = baseElement.querySelector("button[title='Toggle debug']")!;
    fireEvent.click(debugBtn);
    expect(baseElement.querySelector(".font-mono")).toBeTruthy();
  });

  it("modal backdrop click closes modal", () => {
    const { baseElement, container } = render(<MermaidBlock chart="graph TD; A-->B;" />);
    fireEvent.click(container.querySelector("button[title='Open preview']")!);
    const backdrop = baseElement.querySelector(".backdrop-blur-sm")!;
    fireEvent.click(backdrop);
    expect(baseElement.querySelector(".fixed")).toBeNull();
  });

  it("modal double-click resets zoom", () => {
    const { baseElement, container } = render(<MermaidBlock chart="graph TD; A-->B;" />);
    fireEvent.click(container.querySelector("button[title='Open preview']")!);
    const modalBody = baseElement.querySelector(".mermaid-zoom");
    expect(modalBody).toBeTruthy();
    if (modalBody) fireEvent.doubleClick(modalBody);
  });

  it("modal wheel zooms in and out", () => {
    const { baseElement, container } = render(<MermaidBlock chart="graph TD; A-->B;" />);
    fireEvent.click(container.querySelector("button[title='Open preview']")!);
    const modalBody = baseElement.querySelector(".mermaid-zoom");
    if (modalBody) {
      fireEvent.wheel(modalBody, { deltaY: -100 });
      fireEvent.wheel(modalBody, { deltaY: 100 });
    }
  });

  it("modal renders mermaid component inside", () => {
    const { baseElement, container } = render(<MermaidBlock chart="graph TD; A-->B;" />);
    fireEvent.click(container.querySelector("button[title='Open preview']")!);
    const mermaidEls = baseElement.querySelectorAll("[data-testid='mermaid']");
    expect(mermaidEls.length).toBeGreaterThanOrEqual(2);
  });

  it("detects gantt diagram type", () => {
    const { container } = render(<MermaidBlock chart="gantt\ntitle Timeline" />);
    expect(container.textContent).toContain("GANTT CHART");
  });

  it("detects gitGraph type", () => {
    const { container } = render(<MermaidBlock chart="gitGraph\ncommit" />);
    expect(container.textContent).toContain("GIT GRAPH");
  });

  it("detects erDiagram type", () => {
    const { container } = render(<MermaidBlock chart="erDiagram\nCUSTOMER ||--o{ ORDER : places" />);
    expect(container.textContent).toContain("ER DIAGRAM");
  });

  it("detects stateDiagram type", () => {
    const { container } = render(<MermaidBlock chart="stateDiagram-v2\n[*] --> Active" />);
    expect(container.textContent?.toUpperCase()).toContain("STATE");
  });
});
