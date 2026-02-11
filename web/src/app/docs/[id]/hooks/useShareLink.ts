"use client";

import { useCallback, useState } from "react";
import type { Share } from "@/types";
import { useDocumentActions } from "./useDocumentActions";

type UseShareLinkOptions = {
  docId: string;
  onError?: (err: unknown) => void;
};

export function useShareLink({ docId, onError }: UseShareLinkOptions) {
  const documentActions = useDocumentActions(docId);
  const [shareUrl, setShareUrl] = useState("");
  const [activeShare, setActiveShare] = useState<Share | null>(null);
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    try {
      const res = await documentActions.createShare();
      setActiveShare(res);
      setShareUrl(`${window.location.origin}/share/${res.token}`);
    } catch (err) {
      onError?.(err);
    }
  }, [documentActions, onError]);

  const loadShare = useCallback(async () => {
    try {
      const res = await documentActions.getShare();
      if (res.share) {
        setActiveShare(res.share);
        setShareUrl(`${window.location.origin}/share/${res.share.token}`);
      } else {
        setActiveShare(null);
        setShareUrl("");
      }
    } catch (err) {
      setActiveShare(null);
      setShareUrl("");
      onError?.(err);
    }
  }, [documentActions, onError]);

  const handleRevokeShare = useCallback(async () => {
    try {
      await documentActions.revokeShare();
      setActiveShare(null);
      setShareUrl("");
    } catch (err) {
      onError?.(err);
    }
  }, [documentActions, onError]);

  const handleCopyLink = useCallback(() => {
    if (!shareUrl) return;

    const fallbackCopy = () => {
      const textarea = document.createElement("textarea");
      textarea.value = shareUrl;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    };

    const copyPromise =
      typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function"
        ? navigator.clipboard.writeText(shareUrl).then(() => true).catch(() => fallbackCopy())
        : Promise.resolve(fallbackCopy());

    void copyPromise.then((ok) => {
      if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [shareUrl]);

  return {
    shareUrl,
    activeShare,
    copied,
    handleShare,
    loadShare,
    handleRevokeShare,
    handleCopyLink,
  };
}
