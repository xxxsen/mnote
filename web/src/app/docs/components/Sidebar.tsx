"use client";

import Link from "next/link";
import {
  Archive,
  CalendarDays,
  ChevronDown,
  FileText,
  LayoutTemplate,
  Pin,
  Search,
  Settings,
  Share2,
  Star,
  Tags,
} from "lucide-react";

import { Input } from "@/components/ui/input";

import type { DocumentWithTags, TagSummary } from "../types";
import { formatRelativeTime } from "../utils";

export interface SidebarProps {
  selectedTag: string;
  showStarred: boolean;
  showShared: boolean;
  totalDocs: number;
  starredTotal: number;
  sharedTotal: number;
  recentDocs: DocumentWithTags[];
  sidebarTags: TagSummary[];
  sidebarLoading: boolean;
  sidebarHasMore: boolean;
  tagSearch: string;
  sidebarScrollRef: React.RefObject<HTMLDivElement | null>;
  tagListRef: React.RefObject<HTMLDivElement | null>;
  onSelectTag: (id: string) => void;
  onShowAll: () => void;
  onShowStarred: () => void;
  onShowShared: () => void;
  onTagSearchChange: (value: string) => void;
  onToggleTagPin: (tag: TagSummary) => void;
  onAutoLoadTags: () => void;
}

function Count({ value }: { value: number }) {
  return (
    <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
      {value}
    </span>
  );
}

function FilterButton({
  current,
  label,
  count,
  icon,
  onClick,
}: {
  current: boolean;
  label: string;
  count: number;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={current ? "page" : undefined}
      onClick={onClick}
      className={`flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${
        current
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
      <Count value={count} />
    </button>
  );
}

function StaticNavigation() {
  const entries = [
    { href: "/todos", label: "Tasks", icon: CalendarDays },
    { href: "/templates", label: "Templates", icon: LayoutTemplate },
    { href: "/assets", label: "Assets", icon: Archive },
    { href: "/tags", label: "Tags", icon: Tags },
    { href: "/settings", label: "Settings", icon: Settings },
  ];
  return entries.map(({ href, label, icon: Icon }) => (
    <Link
      key={href}
      href={href}
      className="flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span>{label}</span>
    </Link>
  ));
}

function RecentDocsPanel({ recentDocs }: { recentDocs: DocumentWithTags[] }) {
  return (
    <section aria-labelledby="recent-notes-heading" className="mb-5">
      <h2 id="recent-notes-heading" className="mb-2 text-xs font-semibold text-muted-foreground">
        Recent
      </h2>
      <div className="space-y-1">
        {recentDocs.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">No recent notes</p>
        ) : recentDocs.map((doc) => (
          <Link
            key={doc.id}
            href={`/docs/${doc.id}`}
            title={doc.title || "Untitled"}
            className="flex min-h-9 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="min-w-0 flex-1 truncate">{doc.title || "Untitled"}</span>
            <span className="shrink-0 text-xs">{formatRelativeTime(doc.mtime)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

type TagsPanelProps = Pick<
  SidebarProps,
  | "selectedTag"
  | "sidebarTags"
  | "sidebarLoading"
  | "sidebarHasMore"
  | "tagSearch"
  | "sidebarScrollRef"
  | "tagListRef"
  | "onSelectTag"
  | "onTagSearchChange"
  | "onToggleTagPin"
  | "onAutoLoadTags"
>;

function TagsPanel({
  selectedTag,
  sidebarTags,
  sidebarLoading,
  sidebarHasMore,
  tagSearch,
  sidebarScrollRef,
  tagListRef,
  onSelectTag,
  onTagSearchChange,
  onToggleTagPin,
  onAutoLoadTags,
}: TagsPanelProps) {
  return (
    <section aria-labelledby="sidebar-tags-heading" className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="sidebar-tags-heading" className="text-xs font-semibold text-muted-foreground">
          Tags
        </h2>
        <Link
          href="/tags?return=%2Fdocs"
          aria-label="Manage tags"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Settings className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          aria-label="Filter sidebar tags"
          placeholder="Filter tags"
          value={tagSearch}
          onChange={(event) => onTagSearchChange(event.target.value)}
          className="h-9 bg-background pl-7 text-xs"
        />
      </div>
      <div
        ref={sidebarScrollRef}
        onScroll={onAutoLoadTags}
        onWheel={onAutoLoadTags}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div ref={tagListRef} className="space-y-1">
          {sidebarTags.map((tag) => {
            const current = selectedTag === tag.id;
            return (
              <div
                key={tag.id}
                className={`flex min-h-10 items-center rounded-md ${
                  current ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                }`}
              >
                <button
                  type="button"
                  aria-current={current ? "page" : undefined}
                  onClick={() => onSelectTag(tag.id)}
                  className="min-w-0 flex-1 truncate self-stretch rounded-l-md px-3 text-left text-sm font-medium hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  #{tag.name}
                </button>
                <span className="shrink-0 text-xs">{tag.count}</span>
                <button
                  type="button"
                  onClick={() => onToggleTagPin(tag)}
                  title={tag.pinned ? "Unpin tag" : "Pin tag"}
                  aria-label={`${tag.pinned ? "Unpin" : "Pin"} ${tag.name}`}
                  className={`mx-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    tag.pinned ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <Pin className={`h-3.5 w-3.5 ${tag.pinned ? "fill-current" : ""}`} aria-hidden="true" />
                </button>
              </div>
            );
          })}
          {sidebarLoading ? (
            <p role="status" className="px-2 py-2 text-xs text-muted-foreground">Loading tags…</p>
          ) : null}
          {!sidebarLoading && sidebarHasMore ? (
            <p className="flex items-center gap-1 px-2 py-2 text-xs text-muted-foreground">
              <ChevronDown className="h-3 w-3 motion-safe:animate-bounce" aria-hidden="true" />
              Scroll to load more
            </p>
          ) : null}
          {!sidebarLoading && !sidebarHasMore && sidebarTags.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">No tags found</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function Sidebar(props: SidebarProps) {
  const allCurrent = !props.selectedTag && !props.showStarred && !props.showShared;
  return (
    <aside className="hidden h-dvh w-64 shrink-0 flex-col gap-4 border-r border-border bg-background p-4 lg:flex">
      <div className="text-xl font-semibold">Micro Note</div>
      <nav aria-label="Notes and application" className="space-y-1">
        <FilterButton
          current={allCurrent}
          label="All Notes"
          count={props.totalDocs}
          icon={<FileText className="h-4 w-4" />}
          onClick={props.onShowAll}
        />
        <FilterButton
          current={props.showStarred}
          label="Starred"
          count={props.starredTotal}
          icon={<Star className={`h-4 w-4 ${props.showStarred ? "fill-current" : ""}`} />}
          onClick={props.onShowStarred}
        />
        <FilterButton
          current={props.showShared}
          label="Shared"
          count={props.sharedTotal}
          icon={<Share2 className="h-4 w-4" />}
          onClick={props.onShowShared}
        />
        <StaticNavigation />
      </nav>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <RecentDocsPanel recentDocs={props.recentDocs} />
        <TagsPanel {...props} />
      </div>
    </aside>
  );
}
