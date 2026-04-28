import type React from "react";
import type { AdmonitionType } from "./types";

export const tocTokenRegex = /^\[(toc|TOC)]$/;

export const allowedHtmlTags = new Set([
  "span", "u", "br", "details", "summary", "center", "font", "div", "a",
]);

export const ADMONITION_TYPE_ALIASES: Partial<Record<string, AdmonitionType>> = {
  warning: "warning",
  error: "error",
  danger: "error",
  info: "info",
  note: "info",
  tip: "tip",
  success: "tip",
};

export const ADMONITION_STYLES: Record<AdmonitionType, React.CSSProperties> = {
  warning: {
    borderLeft: "4px solid #f59e0b",
    backgroundColor: "#fffbeb",
    color: "#78350f",
    padding: "0.8em 1em",
    borderRadius: "0 var(--radius-md, 4px) var(--radius-md, 4px) 0",
    marginBottom: "0.8em",
  },
  error: {
    borderLeft: "4px solid #ef4444",
    backgroundColor: "#fef2f2",
    color: "#7f1d1d",
    padding: "0.8em 1em",
    borderRadius: "0 var(--radius-md, 4px) var(--radius-md, 4px) 0",
    marginBottom: "0.8em",
  },
  info: {
    borderLeft: "4px solid #3b82f6",
    backgroundColor: "#eff6ff",
    color: "#1e3a5f",
    padding: "0.8em 1em",
    borderRadius: "0 var(--radius-md, 4px) var(--radius-md, 4px) 0",
    marginBottom: "0.8em",
  },
  tip: {
    borderLeft: "4px solid #22c55e",
    backgroundColor: "#f0fdf4",
    color: "#14532d",
    padding: "0.8em 1em",
    borderRadius: "0 var(--radius-md, 4px) var(--radius-md, 4px) 0",
    marginBottom: "0.8em",
  },
};

export const FONT_SIZE_MAP: Record<string, string> = {
  "1": "0.625rem",
  "2": "0.8125rem",
  "3": "1rem",
  "4": "1.125rem",
  "5": "1.5rem",
  "6": "2rem",
  "7": "3rem",
};

export const RUNNABLE_LANGS = [
  "go", "golang", "js", "javascript", "py", "python", "lua", "c",
];
