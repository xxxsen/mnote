"use client";

import { useEffect, useRef, useState, memo } from "react";
import mermaid from "mermaid";

interface MermaidProps {
  chart: string;
}

const svgCache = new Map<string, string>();

const Mermaid = memo(({ chart }: MermaidProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>(() => svgCache.get(chart) || "");
  const [error, setError] = useState<boolean>(false);
  const [isRendered, setIsRendered] = useState(() => svgCache.has(chart));
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
    
    if (svgCache.has(chart) && svg === svgCache.get(chart)) {
      return;
    }

    const id = `mermaid-${Math.random().toString(36).slice(2, 11)}`;
    const normalized = chart.trim();

    let isMounted = true;

    mermaid
      .render(id, normalized)
      .then(({ svg: renderedSvg }) => {
        if (!isMounted) return;
        svgCache.set(chart, renderedSvg);
        setSvg(renderedSvg);
        setError(false);
        setIsRendered(true);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("Mermaid render error:", err);
        setError(true);
      });

    return () => {
      isMounted = false;
    };
  }, [chart, svg]);

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
      className="mermaid-container flex justify-center w-full overflow-hidden"
      style={{ 
        minHeight: isRendered ? "auto" : "120px",
        transition: "min-height 0.3s ease" 
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
});

Mermaid.displayName = "Mermaid";

export default Mermaid;
