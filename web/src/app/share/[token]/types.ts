import type React from "react";
import type { ShareComment } from "@/types";

export interface SharedContentProps {
  previewRef: React.RefObject<HTMLDivElement | null>;
  content: string;
  handleTocLoaded: (toc: string) => void;
}

export interface CommentItemProps {
  comment: ShareComment;
  token: string;
  accessPassword: string;
  canAnnotate: boolean;
  replyingToId: string | null;
  setReplyingTo: (user: { id: string; author: string } | null) => void;
  inlineReplyContent: string;
  setInlineReplyContent: (val: string) => void;
  onToast: (message: string, durationMs?: number) => void;
  guestAuthor: string;
}
