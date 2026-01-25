import type * as React from "react";

declare module "react-syntax-highlighter" {
  interface SyntaxHighlighterProps {
    style?: React.CSSProperties | { [key: string]: React.CSSProperties };
  }
}
