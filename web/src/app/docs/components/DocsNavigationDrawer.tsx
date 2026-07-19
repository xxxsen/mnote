"use client";

import Link from "next/link";

import { AppNavigationDrawer } from "@/components/app-navigation";

import type { DocumentWithTags, TagSummary } from "../types";

type DocsNavigationDrawerProps = {
  open: boolean;
  activeHref: string;
  selectedTag: string;
  recentDocs: DocumentWithTags[];
  tags: TagSummary[];
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onNavigate: (href: string) => void;
  onSelectTag: (id: string) => void;
};

export function DocsNavigationDrawer({
  open,
  activeHref,
  selectedTag,
  recentDocs,
  tags,
  returnFocusRef,
  onClose,
  onNavigate,
  onSelectTag,
}: DocsNavigationDrawerProps) {
  return (
    <AppNavigationDrawer
      open={open}
      activeHref={activeHref}
      returnFocusRef={returnFocusRef}
      onClose={onClose}
      onNavigateRequest={onNavigate}
    >
      <section aria-labelledby="mobile-recent-heading">
        <h2 id="mobile-recent-heading" className="mb-2 text-xs font-semibold text-muted-foreground">
          Recent
        </h2>
        {recentDocs.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">No recent notes</p>
        ) : (
          <div className="space-y-1">
            {recentDocs.slice(0, 5).map((doc) => (
              <Link
                key={doc.id}
                href={`/docs/${doc.id}`}
                onClick={onClose}
                className="block min-h-11 truncate rounded-md px-3 py-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {doc.title || "Untitled"}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="mobile-tags-heading">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 id="mobile-tags-heading" className="text-xs font-semibold text-muted-foreground">
            Tags
          </h2>
          <Link
            href="/tags?return=%2Fdocs"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Manage all
          </Link>
        </div>
        {tags.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">No tags</p>
        ) : (
          <div className="space-y-1">
            {tags.slice(0, 10).map((tag) => (
              <button
                key={tag.id}
                type="button"
                aria-current={selectedTag === tag.id ? "page" : undefined}
                onClick={() => {
                  onSelectTag(tag.id);
                  onClose();
                }}
                className={`flex min-h-11 w-full items-center justify-between rounded-md px-3 text-sm font-medium ${
                  selectedTag === tag.id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <span className="truncate">#{tag.name}</span>
                <span className="ml-2 text-xs">{tag.count}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </AppNavigationDrawer>
  );
}
