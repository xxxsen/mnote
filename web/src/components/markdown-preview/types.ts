import type React from "react";

export interface MarkdownPreviewProps {
  content: string;
  className?: string;
  showTocAside?: boolean;
  tocClassName?: string;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
  onTocLoaded?: (toc: string) => void;
  enableMentionHoverPreview?: boolean;
}

export type Heading = {
  level: number;
  text: string;
  id?: string;
};

export type AdmonitionType = "warning" | "error" | "info" | "tip";

export type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  properties?: Record<string, any>;
  children?: HastNode[];
  data?: {
    meta?: string;
  };
};

export type MdastNode = {
  type: string;
  value?: string;
  children?: MdastNode[];
};

export type InlineHtmlNode = {
  properties?: Record<string, unknown>;
};

export interface CodeBlockProps {
  language: string;
  fileName: string;
  rawCode: string;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  [key: string]: any;
}
