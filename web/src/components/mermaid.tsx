"use client";

import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

interface MermaidProps {
  chart: string;
}

export default function Mermaid({ chart }: MermaidProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<boolean>(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      mermaid.initialize({
        startOnLoad: false,
        theme: "neutral",
        securityLevel: "loose",
        fontFamily: "var(--font-mono)",
      });
      initialized.current = true;
    }
  }, []);

  useEffect(() => {
    if (!chart || !ref.current) return;

    const id = `mermaid-${Math.random().toString(36).slice(2, 11)}`;
    const normalized = chart.trim();

    mermaid
      .render(id, normalized)
      .then(({ svg }) => {
        setSvg(svg);
        setError(false);
      })
      .catch((err) => {
        console.error("Mermaid render error:", err);
        setError(true);
      });
  }, [chart]);

  if (error) {
    return (
      <div className="border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive font-mono whitespace-pre-wrap">
        Invalid Mermaid Syntax
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="mermaid-container flex justify-center w-full overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
