import type { Tag } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ImportSource } from "../types";
import { ChevronDown, ChevronRight, Download, FileArchive, Images, LogOut, Search, Settings, Upload, X } from "lucide-react";

export interface HeaderBarProps {
  search: string;
  selectedTag: string;
  tagIndex: Partial<Record<string, Tag>>;
  showTagSelector: boolean;
  activeTagIndex: number;
  filteredTags: Tag[];
  showUserMenu: boolean;
  showCreateMenu: boolean;
  showImportMenu: boolean;
  avatarUrl: string;
  userEmail: string;
  menuRef: React.RefObject<HTMLDivElement | null>;
  tagSelectorRef: React.RefObject<HTMLDivElement | null>;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  onSetSelectedTag: (id: string) => void;
  onSetShowTagSelector: (show: boolean) => void;
  onSetActiveTagIndex: (fn: (prev: number) => number) => void;
  onSetShowStarred: (val: boolean) => void;
  onSetShowShared: (val: boolean) => void;
  onSetShowUserMenu: (fn: (prev: boolean) => boolean) => void;
  onSetShowCreateMenu: (fn: (prev: boolean) => boolean) => void;
  onSetShowImportMenu: (fn: (prev: boolean) => boolean) => void;
  onNavigate: (path: string) => void;
  onCreate: () => void;
  onLogout: () => void;
  onOpenImport: (source: ImportSource) => void;
  onOpenExport: () => void;
}

function TagSelectorDropdown({ tagSelectorRef, filteredTags, activeTagIndex, search, onSelect }: {
  tagSelectorRef: React.RefObject<HTMLDivElement | null>;
  filteredTags: Tag[];
  activeTagIndex: number;
  search: string;
  onSelect: (tag: Tag) => void;
}) {
  return (
    <div ref={tagSelectorRef} className="absolute top-full left-0 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
      <div className="p-1">
        {filteredTags.map((tag, index) => (
          <button
            key={tag.id}
            onClick={() => onSelect(tag)}
            className={`flex w-full items-center px-3 py-2 text-sm rounded-md text-left transition-colors ${index === activeTagIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/50 hover:text-accent-foreground"}`}
          >
            <span className="font-mono text-muted-foreground mr-2">#</span>
            {tag.name}
          </button>
        ))}
        {search.slice(1).trim() !== "" && filteredTags.length === 0 && (
          <div className="px-3 py-2 text-sm text-muted-foreground italic">No tags found</div>
        )}
      </div>
    </div>
  );
}

function UserMenu({ userEmail, showImportMenu, onNavigate, onSetShowUserMenu, onSetShowImportMenu, onOpenImport, onOpenExport, onLogout }: {
  userEmail: string;
  showImportMenu: boolean;
  onNavigate: (path: string) => void;
  onSetShowUserMenu: (fn: (prev: boolean) => boolean) => void;
  onSetShowImportMenu: (fn: (prev: boolean) => boolean) => void;
  onOpenImport: (source: ImportSource) => void;
  onOpenExport: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="absolute right-0 top-full mt-2 w-48 rounded-md border border-border bg-popover p-1 shadow-md z-[100] animate-in fade-in zoom-in-95 duration-200">
      <div className="px-2 py-1.5 text-xs text-muted-foreground truncate border-b border-border/50 mb-1">{userEmail || "Signed in"}</div>
      <button
        onClick={() => { onSetShowUserMenu(() => false); onNavigate("/settings?return=/docs"); }}
        className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
      >
        <Settings className="mr-2 h-4 w-4" /><span>Account Settings</span>
      </button>
      <div className="relative" onMouseEnter={() => onSetShowImportMenu(() => true)} onMouseLeave={() => onSetShowImportMenu(() => false)}>
        <button
          onClick={() => onSetShowImportMenu((prev) => !prev)}
          className="relative flex w-full cursor-default select-none items-center justify-between rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
        >
          <span className="flex items-center"><Download className="mr-2 h-4 w-4" />Import</span>
          <ChevronRight className="h-3.5 w-3.5 opacity-70" />
        </button>
        {showImportMenu && (
          <div className="absolute right-full top-0 mr-1 w-44 rounded-md border border-border bg-popover p-1 shadow-md">
            <button
              onClick={() => { onSetShowUserMenu(() => false); onSetShowImportMenu(() => false); onOpenImport("hedgedoc"); }}
              className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
            >
              <FileArchive className="mr-2 h-4 w-4" />HedgeDoc
            </button>
            <button
              onClick={() => { onSetShowUserMenu(() => false); onSetShowImportMenu(() => false); onOpenImport("notes"); }}
              className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
            >
              <FileArchive className="mr-2 h-4 w-4" />MicroNote
            </button>
          </div>
        )}
      </div>
      <button onClick={onOpenExport} className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground">
        <Upload className="mr-2 h-4 w-4" /><span>Export</span>
      </button>
      <button onClick={onLogout} className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground">
        <LogOut className="mr-2 h-4 w-4" /><span>Sign out</span>
      </button>
    </div>
  );
}

export function HeaderBar(props: HeaderBarProps) {
  const {
    search, selectedTag, tagIndex, showTagSelector, activeTagIndex, filteredTags,
    showUserMenu, showCreateMenu, showImportMenu, avatarUrl, userEmail,
    menuRef, tagSelectorRef,
    onSearchChange, onClearSearch, onSetSelectedTag, onSetShowTagSelector,
    onSetActiveTagIndex, onSetShowStarred, onSetShowShared,
    onSetShowUserMenu, onSetShowCreateMenu, onSetShowImportMenu,
    onNavigate, onCreate, onLogout, onOpenImport, onOpenExport,
  } = props;

  const selectTag = (tag: Tag) => {
    onSetSelectedTag(tag.id);
    onSetShowStarred(false);
    onSetShowShared(false);
    onSearchChange("");
    onSetShowTagSelector(false);
  };

  return (
    <header className="relative h-14 border-b border-border flex items-center px-4 gap-4 justify-between bg-background z-40">
      <div className="flex items-center gap-2 flex-1 max-w-md relative">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {selectedTag && (
            <div className="flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap">
              #{tagIndex[selectedTag]?.name ?? "tag"}
              <button onClick={() => onSetSelectedTag("")} className="hover:text-primary/70"><X className="h-2.5 w-2.5" /></button>
            </div>
          )}
          <Input
            placeholder={selectedTag ? "Search in tag..." : "Search... (type / for tags)"}
            className="border-none shadow-none focus-visible:ring-0 px-0 h-9 flex-1 min-w-[50px]"
            value={search}
            onChange={(e) => {
              onSearchChange(e.target.value);
              onSetShowTagSelector(e.target.value.startsWith("/"));
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                onSetShowTagSelector(false);
              } else if ((e.key === "Backspace" || e.key === "Delete") && search === "" && selectedTag) {
                e.preventDefault();
                onSetSelectedTag("");
              } else if (showTagSelector) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  onSetActiveTagIndex(prev => (prev + 1) % (filteredTags.length || 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  onSetActiveTagIndex(prev => (prev - 1 + (filteredTags.length || 1)) % (filteredTags.length || 1));
                } else if (e.key === "Enter" && filteredTags.length > 0) {
                  e.preventDefault();
                  selectTag(filteredTags[activeTagIndex]);
                }
              }
            }}
          />
        </div>
        {search && !showTagSelector && (
          <button onClick={onClearSearch} className="shrink-0"><X className="h-4 w-4 text-muted-foreground hover:text-foreground" /></button>
        )}
        {showTagSelector && (
          <TagSelectorDropdown tagSelectorRef={tagSelectorRef} filteredTags={filteredTags} activeTagIndex={activeTagIndex} search={search} onSelect={selectTag} />
        )}
      </div>
      <div className="flex items-center gap-3 relative" ref={menuRef}>
        <Button onClick={() => onNavigate("/assets")} variant="outline" size="sm" className="rounded-xl text-xs font-semibold">
          <Images className="mr-1.5 h-3.5 w-3.5" />Assets
        </Button>
        <div className="relative flex items-center">
          <Button onClick={onCreate} size="sm" className="rounded-r-none rounded-l-xl bg-[#6366f1] hover:bg-[#4f46e5] text-white border-none font-bold tracking-wide">+ NEW</Button>
          <Button onClick={() => onSetShowCreateMenu((prev) => !prev)} size="sm" className="rounded-l-none rounded-r-xl bg-[#6366f1] hover:bg-[#4f46e5] text-white border-none px-2">
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          {showCreateMenu && (
            <div className="absolute right-0 top-full mt-2 w-44 rounded-xl border border-border bg-popover p-1 shadow-md z-[100] animate-in fade-in zoom-in-95 duration-200">
              <button
                onClick={() => { onSetShowCreateMenu(() => false); onNavigate("/templates"); }}
                className="relative flex w-full cursor-default select-none items-center justify-center text-center rounded-lg px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
              >
                TEMPLATE
              </button>
            </div>
          )}
        </div>
        <button
          onClick={() => { onSetShowCreateMenu(() => false); onSetShowUserMenu((prev) => !prev); }}
          className="w-8 h-8 rounded-full overflow-hidden border border-border hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          title={userEmail || "User menu"}
        >
          <img src={avatarUrl} alt="User" className="w-full h-full object-cover" style={{ imageRendering: "pixelated" }} />
        </button>
        {showUserMenu && (
          <UserMenu
            userEmail={userEmail}
            showImportMenu={showImportMenu}
            onNavigate={onNavigate}
            onSetShowUserMenu={onSetShowUserMenu}
            onSetShowImportMenu={onSetShowImportMenu}
            onOpenImport={onOpenImport}
            onOpenExport={onOpenExport}
            onLogout={onLogout}
          />
        )}
      </div>
    </header>
  );
}
