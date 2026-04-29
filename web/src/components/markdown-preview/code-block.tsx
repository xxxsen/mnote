"use client";

import React, { memo } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import oneLight from "react-syntax-highlighter/dist/esm/styles/prism/one-light";
import { Copy, Check } from "lucide-react";
import { copyToClipboard } from "./helpers";
import type { CodeBlockProps } from "./types";

type ThemedSyntaxHighlighterProps = Omit<
  React.ComponentProps<typeof SyntaxHighlighter>,
  "style"
> & {
  style?: React.CSSProperties | Record<string, React.CSSProperties>;
};

export const ThemedSyntaxHighlighter =
  SyntaxHighlighter as unknown as React.ComponentType<ThemedSyntaxHighlighterProps>;

const CodeBlock = memo(({ language, fileName, rawCode, ...rest }: CodeBlockProps) => {
  const [copied, setCopied] = React.useState(false);

  /* v8 ignore start -- clipboard interaction requires real browser API */
  const handleCopyLocal = React.useCallback(() => {
    void copyToClipboard(rawCode).then((ok) => {
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 1000);
      }
    });
  }, [rawCode]);
  /* v8 ignore stop */

  const displayLanguage = language.toUpperCase();
  const displayTitle = fileName || displayLanguage;

  return (
    <div
      className="group"
      style={{
        margin: 0,
        marginBottom: "1.5em",
        borderRadius: "var(--radius-md)",
        backgroundColor: "#f8f9fa",
        border: "1px solid rgba(0,0,0,0.06)",
        boxShadow: "none",
        position: "relative",
        overflow: "hidden"
      }}
    >
      <div className="flex items-center justify-between px-3 h-8 bg-black/[0.02] border-b border-black/[0.03]">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 font-mono">
          {displayTitle}
        </span>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            handleCopyLocal();
          }}
          className="h-6 w-6 flex items-center justify-center rounded-md border border-transparent hover:border-border hover:bg-background transition-all"
          title="Copy"
        >
          {copied ? (
            <Check className="h-3 w-3 text-green-500" />
          ) : (
            <Copy className="h-3 w-3 text-muted-foreground/50" />
          )}
        </button>
      </div>
      <div className="p-3 pt-2">
        <ThemedSyntaxHighlighter
          language={language}
          style={oneLight}
          PreTag="pre"
          customStyle={{
            margin: 0,
            padding: 0,
            background: "transparent",
            boxShadow: "none",
            border: "none",
            tabSize: 4,
            MozTabSize: 4,
          }}
          codeTagProps={{
            style: {
              border: "none",
              boxShadow: "none",
              background: "transparent",
              padding: 0,
              tabSize: 4,
              MozTabSize: 4,
            },
          }}
          {...rest}
        >
          {rawCode}
        </ThemedSyntaxHighlighter>
      </div>
    </div>
  );
});

CodeBlock.displayName = "CodeBlock";

export default CodeBlock;
