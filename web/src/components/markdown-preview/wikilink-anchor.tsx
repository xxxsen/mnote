"use client";

import React, { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { FileText } from "lucide-react";

const WikilinkAnchor = ({
  title,
  idHref,
  onPreviewEnter,
  onPreviewLeave,
}: {
  title: string;
  idHref?: string;
  onPreviewEnter?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  onPreviewLeave?: () => void;
}) => {
  const router = useRouter();
  const [resolving, setResolving] = useState(false);

  /* v8 ignore start -- navigation/routing logic requires real browser environment */
  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      if (idHref && idHref.startsWith("/docs/")) {
        router.push(idHref);
        return;
      }

      if (resolving) return;
      setResolving(true);
      try {
        const docs = await apiFetch<{ id: string; title: string }[]>(
          `/documents?q=${encodeURIComponent(title)}&limit=5`
        );
        const exact = docs.find((d) => d.title === title);
        if (exact) {
          router.push(`/docs/${exact.id}`);
        } else if (docs.length > 0) {
          router.push(`/docs/${docs[0].id}`);
        } else {
          router.push(`/docs?q=${encodeURIComponent(title)}`);
        }
      } catch {
        router.push(`/docs?q=${encodeURIComponent(title)}`);
      } finally {
        setResolving(false);
      }
    },
    [title, router, resolving, idHref]
  );
  /* v8 ignore stop */

  return (
    <a
      href={idHref || `/docs?wikilink=${encodeURIComponent(title)}`}
      onClick={handleClick}
      onMouseEnter={onPreviewEnter}
      onMouseLeave={onPreviewLeave}
      className="wikilink inline-flex items-center gap-1 leading-none align-middle"
      title={`Link to: ${title}`}
    >
      <FileText className="wikilink-icon h-3 w-3 flex-shrink-0" />
      <span className="truncate">{title}</span>
    </a>
  );
};

export default WikilinkAnchor;
