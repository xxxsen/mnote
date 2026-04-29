import type React from "react";
import type { Heading, HastNode } from "./types";
import {
  tocTokenRegex,
  allowedHtmlTags,
  ADMONITION_TYPE_ALIASES,
  FONT_SIZE_MAP,
} from "./constants";

export const createSlugger = () => {
  const counts = new Map<string, number>();
  return (value: string) => {
    const base = value
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
    const normalized = base || "section";
    const count = counts.get(normalized) || 0;
    counts.set(normalized, count + 1);
    return count === 0 ? normalized : `${normalized}-${count}`;
  };
};

export const getHastText = (node: HastNode): string => {
  if (node.type === "text") return node.value || "";
  if (node.children) return node.children.map(getHastText).join("");
  return "";
};

/* eslint-disable no-param-reassign -- builds up a result accumulator by design */
function applyStyleProp(result: Record<string, string>, propName: string, propValue: unknown) {
  const prop = propName.trim().toLowerCase();
  const nextValue = typeof propValue === "string" ? propValue.trim() : "";
  if (!nextValue) return;
  if (prop === "color") result.color = nextValue;
  if (prop === "font-size" || prop === "fontsize") result.fontSize = nextValue;
}
/* eslint-enable no-param-reassign */

export const toSafeInlineStyle = (value: unknown): React.CSSProperties => {
  if (!value) return {};

  if (typeof value === "object") {
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      applyStyleProp(result, k, v);
    }
    return result;
  }

  if (typeof value !== "string") return {};

  const result: Record<string, string> = {};
  for (const piece of value.split(";")) {
    const declaration = piece.trim();
    if (!declaration) continue;
    const colonIdx = declaration.indexOf(":");
    if (colonIdx < 0) continue;
    const rawProp = declaration.slice(0, colonIdx);
    const rawVal = declaration.slice(colonIdx + 1);
    if (rawProp && rawVal) applyStyleProp(result, rawProp, rawVal);
  }
  return result;
};

export const toFontSize = (value?: string | number) => {
  if (value === undefined) return undefined;
  const normalized = String(value).trim();
  if (!normalized) return undefined;
  return FONT_SIZE_MAP[normalized] ?? normalized;
};

export const convertAdmonitions = (content: string) => {
  const lines = content.split("\n");
  const result: string[] = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      result.push(line);
      continue;
    }

    const admonMatch = !inCodeBlock && trimmed.match(/^:::\s*(\w+)\s*$/i);
    if (admonMatch) {
      const rawType = admonMatch[1].toLowerCase();
      const admonType = ADMONITION_TYPE_ALIASES[rawType];
      if (admonType) {
        const body: string[] = [];
        let j = i + 1;
        while (j < lines.length && lines[j].trim() !== ":::") {
          body.push(lines[j]);
          j += 1;
        }

        if (j < lines.length && lines[j].trim() === ":::") {
          result.push(`<div class="md-alert md-alert-${admonType}">`);
          result.push('');
          result.push(...body);
          result.push('');
          result.push("</div>");
          i = j;
          continue;
        }
      }
    }

    result.push(line);
  }

  return result.join("\n");
};

const decodeHtmlEntities = (val: string) =>
  val
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);?/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&colon;?/gi, ":")
    .replace(/&newline;?/gi, "\n")
    .replace(/&tab;?/gi, "\t");

const hasDangerousAttrs = (attrs: string) => {
  const lowerAttrs = attrs.toLowerCase();
  if (/\bon[a-z]+\s*=/.test(lowerAttrs)) return true;
  const normalized = decodeHtmlEntities(lowerAttrs).replace(/[\u0000-\u0020]+/g, "");
  return /(javascript|vbscript|data)\s*:/.test(normalized);
};

function sanitizeHtmlTag(match: string, slash: string, tagName: string, attrs: string) {
  const name = tagName.toLowerCase();
  if (allowedHtmlTags.has(name)) {
    if (hasDangerousAttrs(attrs)) return `<${slash}${name}>`;
    return match;
  }
  return match.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const escapeUnsupportedHtml = (content: string) => {
  const lines = content.split("\n");
  let inCodeBlock = false;
  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("```")) {
        inCodeBlock = !inCodeBlock;
        return line;
      }
      if (inCodeBlock) return line;
      return line.replace(/<(\/?)([a-zA-Z0-9-]+)([^>]*)>/g, sanitizeHtmlTag);
    })
    .join("\n");
};

export const convertWikilinks = (content: string) => {
  const lines = content.split("\n");
  let inCodeBlock = false;
  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("```")) {
        inCodeBlock = !inCodeBlock;
        return line;
      }
      if (inCodeBlock) return line;
      return line.replace(/\[\[([^\]]+)\]\]/g, (_, title) => {
        const escaped = title.replace(/"/g, "&quot;");
        return `<a href="/docs?wikilink=${encodeURIComponent(title)}" data-wikilink="${escaped}" class="wikilink">${escaped}</a>`;
      });
    })
    .join("\n");
};

type FenceState = {
  inCodeBlock: boolean;
  codeFenceMarker: "`" | "~" | null;
  codeFenceLength: number;
};

function tryOpenFence(_line: string, fenceMatch: RegExpMatchArray): FenceState | null {
  const fence = fenceMatch[1];
  const marker = fence[0];
  const isUniform = fence.split("").every((ch) => ch === marker);
  if (isUniform && (marker === "`" || marker === "~")) {
    return { inCodeBlock: true, codeFenceMarker: marker, codeFenceLength: fence.length };
  }
  return null;
}

function isClosingFence(fenceMatch: RegExpMatchArray, state: FenceState): boolean {
  if (!state.codeFenceMarker) return false;
  const fence = fenceMatch[1];
  const trailing = fenceMatch[2];
  const isUniform = fence.split("").every((ch) => ch === fence[0]);
  return isUniform && fence[0] === state.codeFenceMarker && fence.length >= state.codeFenceLength && trailing.trim() === "";
}

function classifyPlainLine(line: string): "list" | "blockquote" | "blank" | "indented" | "text" {
  const trimmed = line.trim();
  if (trimmed === "") return "blank";
  const isIndentedCode = /^(?: {4,}|\t+)\S/.test(line);
  if (isIndentedCode) return "text";
  if (/^\s*(?:>\s*)+/.test(line)) return "blockquote";
  if (/^\s*([-*])\s/.test(line) || /^\s*\d+\.\s/.test(line) || /^\s*-\s*\[[ xX]\]/.test(line)) return "list";
  if (/^\s{2,}\S/.test(line)) return "indented";
  return "text";
}

type LazyBreakContext = { inList: boolean; inBlockquote: boolean };

function processPlainLine(
  line: string, kind: ReturnType<typeof classifyPlainLine>, ctx: LazyBreakContext, result: string[],
): LazyBreakContext {
  if (kind === "blockquote") {
    result.push(line);
    return { inList: false, inBlockquote: true };
  }
  if (ctx.inBlockquote && kind !== "blank") {
    result.push("");
    result.push(line);
    return { inList: false, inBlockquote: false };
  }
  if (kind === "list") {
    result.push(line);
    return { inList: true, inBlockquote: ctx.inBlockquote };
  }
  if (ctx.inList && kind !== "blank" && kind !== "indented") {
    result.push("");
    result.push(line);
    return { inList: false, inBlockquote: ctx.inBlockquote };
  }
  result.push(line);
  if (kind === "blank") return { inList: false, inBlockquote: false };
  return ctx;
}

export const breakLazyListContinuation = (content: string): string => {
  const lines = content.split("\n");
  const result: string[] = [];
  let fenceState: FenceState = { inCodeBlock: false, codeFenceMarker: null, codeFenceLength: 0 };
  let ctx: LazyBreakContext = { inList: false, inBlockquote: false };

  for (const line of lines) {
    const fenceMatch = line.match(/^\s{0,3}([`~]{3,})(.*)$/);

    if (!fenceState.inCodeBlock && fenceMatch) {
      const opened = tryOpenFence(line, fenceMatch);
      if (opened) fenceState = opened;
      result.push(line);
      ctx = { inList: false, inBlockquote: false };
      continue;
    }

    if (fenceState.inCodeBlock) {
      if (fenceMatch && isClosingFence(fenceMatch, fenceState)) {
        fenceState = { inCodeBlock: false, codeFenceMarker: null, codeFenceLength: 0 };
        ctx = { inList: false, inBlockquote: false };
      }
      result.push(line);
      continue;
    }

    ctx = processPlainLine(line, classifyPlainLine(line), ctx, result);
  }

  return result.join("\n");
};

export const extractHeadings = (content: string) => {
  const headings: Heading[] = [];
  const lines = content.split("\n");
  let inCodeBlock = false;

  for (const line of lines) {
    const fenceMatch = line.trim().match(/^```/);
    if (fenceMatch) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    const match = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
    if (match) {
      headings.push({ level: match[1].length, text: match[2].trim() });
    }
  }
  return headings;
};

export const buildTocMarkdown = (headings: Heading[]) => {
  if (headings.length === 0) return "";
  const firstLevel = headings[0].level;
  const slugger = createSlugger();

  return headings
    .map((heading) => {
      const normalizedLevel = Math.max(1, heading.level - firstLevel + 1);
      const indent = "  ".repeat(normalizedLevel - 1);
      const slug = heading.id || slugger(heading.text);
      return `${indent}- [${heading.text}](#${slug})`;
    })
    .join("\n");
};

export const injectToc = (content: string, toc: string) => {
  if (!toc) return content.replace(/\[(toc|TOC)]/g, "");
  const lines = content.split("\n");
  let inCodeBlock = false;
  const result: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      result.push(line);
      continue;
    }
    if (!inCodeBlock && tocTokenRegex.test(trimmed)) {
      result.push("```toc\n" + toc + "\n```");
      continue;
    }
    result.push(line);
  }
  return result.join("\n");
};

export const copyToClipboard = (value: string): Promise<boolean> => {
  const fallbackCopy = () => {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  };

  try {
    return navigator.clipboard.writeText(value).then(() => true).catch(() => fallbackCopy());
  } catch {
    return Promise.resolve(fallbackCopy());
  }
};
