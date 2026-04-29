"use client";

import { useCallback, useState } from "react";
import type { Share } from "@/types";
import { useDocumentActions } from "./useDocumentActions";

type UseShareLinkOptions = {
  docId: string;
  onError?: (err: unknown) => void;
};

export type ShareConfigPayload = {
  expires_at: number;
  password?: string;
  clear_password?: boolean;
  permission: "view" | "comment";
  allow_download: boolean;
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

  const updateShareConfig = useCallback(
    async (payload: ShareConfigPayload) => {
      try {
        const res = await documentActions.updateShareConfig(payload);
        setActiveShare(res);
        setShareUrl(`${window.location.origin}/share/${res.token}`);
      } catch (err) {
        onError?.(err);
      }
    },
    [documentActions, onError]
  );

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
    /* v8 ignore next */ if (typeof navigator === "undefined") return;

    void navigator.clipboard.writeText(shareUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => { /* clipboard write failed */ });
  }, [shareUrl]);

  return {
    shareUrl,
    activeShare,
    copied,
    handleShare,
    loadShare,
    updateShareConfig,
    handleRevokeShare,
    handleCopyLink,
  };
}
