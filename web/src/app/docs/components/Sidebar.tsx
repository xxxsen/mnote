import type { Tag } from "@/types";
import { Input } from "@/components/ui/input";
import type { DocumentWithTags, TagSummary, SavedView } from "../types";
import { formatRelativeTime } from "../utils";
import { Bookmark, CalendarDays, ChevronDown, Pin, Plus, Search, Settings, Share2, Star, X } from "lucide-react";

export interface SidebarProps {
  selectedTag: string;
  showStarred: boolean;
  showShared: boolean;
  totalDocs: number;
  starredTotal: number;
  sharedTotal: number;
  recentDocs: DocumentWithTags[];
  tagIndex: Record<string, Tag>;
  savedViews: SavedView[];
  search: string;
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
  onNavigate: (path: string) => void;
  onTagSearchChange: (value: string) => void;
  onSaveCurrentView: () => void;
  onApplySavedView: (view: SavedView) => void;
  onRemoveSavedView: (id: string) => void;
  onToggleTagPin: (tag: TagSummary) => void;
  onAutoLoadTags: () => void;
}

function RecentDocsPanel({ recentDocs, onNavigate }: {
  recentDocs: DocumentWithTags[];
  onNavigate: (path: string) => void;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-bold uppercase text-muted-foreground">RECENT UPDATES</div>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-100%); } }
        .group:hover .marquee-text { animation: marquee 5s linear infinite; }
      `}} />
      <div className="flex flex-col gap-1">
        {recentDocs.length === 0 ? (
          <div className="px-2 py-1.5 text-sm text-muted-foreground italic opacity-50">No recent notes</div>
        ) : (
          recentDocs.map((doc) => (
            <button
              key={doc.id}
              onClick={() => onNavigate(`/docs/${doc.id}`)}
              className="group relative flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-all text-left overflow-hidden"
            >
              <div className="relative flex-1 overflow-hidden mr-2">
                <div className="truncate marquee-text w-fit">{doc.title || "Untitled"}</div>
                <div className="absolute left-0 top-full mt-1 z-50 hidden group-hover:block bg-popover text-popover-foreground text-[10px] px-2 py-1 rounded border shadow-md whitespace-nowrap pointer-events-none">
                  {doc.title || "Untitled"}
                </div>
              </div>
              <span className="shrink-0 text-[10px] bg-muted-foreground/10 px-1.5 py-0.5 rounded-lg opacity-70 group-hover:opacity-100 transition-opacity">
                {formatRelativeTime(doc.mtime)}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function TagsPanel({ selectedTag, sidebarTags, sidebarLoading, sidebarHasMore, tagSearch, sidebarScrollRef, tagListRef, onSelectTag, onTagSearchChange, onToggleTagPin, onAutoLoadTags, onManageTags }: {
  selectedTag: string;
  sidebarTags: TagSummary[];
  sidebarLoading: boolean;
  sidebarHasMore: boolean;
  tagSearch: string;
  sidebarScrollRef: React.RefObject<HTMLDivElement | null>;
  tagListRef: React.RefObject<HTMLDivElement | null>;
  onSelectTag: (id: string) => void;
  onTagSearchChange: (value: string) => void;
  onToggleTagPin: (tag: TagSummary) => void;
  onAutoLoadTags: () => void;
  onManageTags: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-bold uppercase text-muted-foreground">Tags</div>
        <button onClick={onManageTags} className="text-muted-foreground hover:text-foreground transition-colors" title="Manage Tags">
          <Settings className="h-3 w-3" />
        </button>
      </div>
      <div className="mb-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            placeholder="Filter tags..."
            value={tagSearch}
            onChange={(e) => onTagSearchChange(e.target.value)}
            className="h-7 text-xs pl-7 bg-background/50 border-border focus-visible:ring-0 focus-visible:outline-none focus-visible:ring-offset-0"
          />
        </div>
      </div>
      <div ref={sidebarScrollRef} onScroll={onAutoLoadTags} onWheel={onAutoLoadTags} className="flex-1 overflow-y-auto no-scrollbar">
        <div ref={tagListRef} className="flex flex-col gap-1">
          {sidebarTags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => onSelectTag(tag.id)}
              className={`group flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm font-medium transition-all ${selectedTag === tag.id ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              <span className="truncate">#{tag.name}</span>
              <div className="ml-2 flex items-center gap-1">
                <span
                  role="button" tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); onToggleTagPin(tag); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onToggleTagPin(tag); } }}
                  title={tag.pinned ? "Unpin tag" : "Pin tag"}
                  aria-label={tag.pinned ? "Unpin tag" : "Pin tag"}
                  className={`rounded p-1 transition-colors ${tag.pinned ? "text-primary opacity-100" : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground"}`}
                >
                  <Pin className={`h-3 w-3 ${tag.pinned ? "fill-current" : ""}`} />
                </span>
                <span className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] transition-colors ${selectedTag === tag.id ? "bg-background/20 text-accent-foreground" : "bg-muted text-muted-foreground group-hover:bg-background group-hover:text-foreground"}`}>
                  {tag.count}
                </span>
              </div>
            </button>
          ))}
          {sidebarLoading && <div className="px-2 py-2 text-xs text-muted-foreground">Loading tags...</div>}
          {!sidebarLoading && sidebarHasMore && (
            <div className="flex items-center gap-1 px-2 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">
              <ChevronDown className="h-3 w-3 animate-bounce" />
              Scroll to load more
            </div>
          )}
          {!sidebarLoading && !sidebarHasMore && sidebarTags.length === 0 && (
            <div className="px-2 py-2 text-xs text-muted-foreground italic">No tags found</div>
          )}
        </div>
      </div>
    </>
  );
}

export function Sidebar(props: SidebarProps) {
  const {
    selectedTag, showStarred, showShared, totalDocs, starredTotal, sharedTotal,
    recentDocs, savedViews, search,
    sidebarTags, sidebarLoading, sidebarHasMore, tagSearch, sidebarScrollRef, tagListRef,
    onSelectTag, onShowAll, onShowStarred, onShowShared, onNavigate,
    onTagSearchChange, onSaveCurrentView, onApplySavedView, onRemoveSavedView,
    onToggleTagPin, onAutoLoadTags,
  } = props;

  return (
    <aside className="w-full md:w-64 border-r border-border p-4 flex-col gap-4 hidden md:flex">
      <div className="font-mono font-bold text-xl tracking-tighter mb-4">Micro Note</div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold uppercase text-muted-foreground">General</div>
          </div>
          <div className="flex flex-col gap-1">
            <button
              onClick={onShowAll}
              className={`group flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm font-medium transition-all ${selectedTag === "" && !showStarred && !showShared ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              <span>All Notes</span>
              <span className={`ml-2 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] transition-colors ${selectedTag === "" && !showStarred && !showShared ? "bg-background/20 text-accent-foreground" : "bg-muted text-muted-foreground group-hover:bg-background group-hover:text-foreground"}`}>
                {totalDocs}
              </span>
            </button>
            <button
              onClick={onShowStarred}
              className={`group flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm font-medium transition-all ${showStarred ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              <div className="flex items-center">
                <Star className={`mr-2 h-4 w-4 ${showStarred ? "fill-current" : ""}`} />
                <span>Starred</span>
              </div>
              <span className={`ml-2 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] transition-colors ${showStarred ? "bg-background/20 text-accent-foreground" : "bg-muted text-muted-foreground group-hover:bg-background group-hover:text-foreground"}`}>
                {starredTotal}
              </span>
            </button>
            <button
              onClick={onShowShared}
              className={`group flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm font-medium transition-all ${showShared ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              <div className="flex items-center">
                <Share2 className={`mr-2 h-4 w-4 ${showShared ? "fill-current" : ""}`} />
                <span>Shared</span>
              </div>
              <span className={`ml-2 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] transition-colors ${showShared ? "bg-background/20 text-accent-foreground" : "bg-muted text-muted-foreground group-hover:bg-background group-hover:text-foreground"}`}>
                {sharedTotal}
              </span>
            </button>
            <button
              onClick={() => onNavigate("/todos")}
              className="group flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm font-medium transition-all text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <div className="flex items-center">
                <CalendarDays className="mr-2 h-4 w-4" />
                <span>TODOs</span>
              </div>
            </button>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold uppercase text-muted-foreground">Saved Views</div>
            <button onClick={onSaveCurrentView} className="inline-flex h-5 w-5 items-center justify-center text-muted-foreground hover:text-foreground" title="Save current filters">
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {savedViews.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground italic opacity-60">No saved views</div>
            ) : (
              savedViews.map((view) => {
                const isActive = view.search === search && view.selectedTag === selectedTag && view.showStarred === showStarred && view.showShared === showShared;
                return (
                  <button
                    key={view.id}
                    onClick={() => onApplySavedView(view)}
                    className={`group flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm font-medium transition-all ${isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <Bookmark className={`h-3 w-3 shrink-0 ${isActive ? "fill-current" : ""}`} />
                      <span className="truncate">{view.name}</span>
                    </span>
                    <span
                      role="button" tabIndex={0}
                      className={`rounded p-1 transition-colors ${isActive ? "text-accent-foreground/80 hover:text-accent-foreground" : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground"}`}
                      onClick={(event) => { event.stopPropagation(); onRemoveSavedView(view.id); }}
                      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onRemoveSavedView(view.id); } }}
                      title="Delete saved view" aria-label="Delete saved view"
                    >
                      <X className="h-3 w-3" />
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <RecentDocsPanel recentDocs={recentDocs} onNavigate={onNavigate} />

        <TagsPanel
          selectedTag={selectedTag}
          sidebarTags={sidebarTags}
          sidebarLoading={sidebarLoading}
          sidebarHasMore={sidebarHasMore}
          tagSearch={tagSearch}
          sidebarScrollRef={sidebarScrollRef}
          tagListRef={tagListRef}
          onSelectTag={onSelectTag}
          onTagSearchChange={onTagSearchChange}
          onToggleTagPin={onToggleTagPin}
          onAutoLoadTags={onAutoLoadTags}
          onManageTags={() => onNavigate(`/tags?return=${encodeURIComponent("/docs")}`)}
        />
      </div>
    </aside>
  );
}
