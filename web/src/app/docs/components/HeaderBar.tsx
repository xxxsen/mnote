"use client";

import {
  ChevronDown,
  Download,
  FileArchive,
  Images,
  LogOut,
  Menu as MenuIcon,
  Settings,
  Upload,
} from "lucide-react";

import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Menu } from "@/components/ui/menu";
import type { Tag } from "@/types";

import type { ImportSource } from "../types";

export interface HeaderBarProps {
  search: string;
  selectedTag: string;
  tagIndex: Partial<Record<string, Tag>>;
  filteredTags: Tag[];
  avatarUrl: string;
  userEmail: string;
  creating: boolean;
  navigationButtonRef: React.RefObject<HTMLButtonElement | null>;
  onOpenNavigation: () => void;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  onSetSelectedTag: (id: string) => void;
  onSetShowStarred: (value: boolean) => void;
  onSetShowShared: (value: boolean) => void;
  onNavigate: (path: string) => void;
  onCreate: () => void;
  onLogout: () => void;
  onOpenImport: (source: ImportSource) => void;
  onOpenExport: () => void;
}

export function HeaderBar({
  search,
  selectedTag,
  tagIndex,
  filteredTags,
  avatarUrl,
  userEmail,
  creating,
  navigationButtonRef,
  onOpenNavigation,
  onSearchChange,
  onClearSearch,
  onSetSelectedTag,
  onSetShowStarred,
  onSetShowShared,
  onNavigate,
  onCreate,
  onLogout,
  onOpenImport,
  onOpenExport,
}: HeaderBarProps) {
  const selectTag = (id: string) => {
    onSetSelectedTag(id);
    onSetShowStarred(false);
    onSetShowShared(false);
    onSearchChange("");
  };

  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-2 sm:px-4">
      <IconButton
        ref={navigationButtonRef}
        label="Open application navigation"
        variant="ghost"
        className="shrink-0 lg:hidden"
        onClick={onOpenNavigation}
      >
        <MenuIcon className="h-5 w-5" aria-hidden="true" />
      </IconButton>

      <Combobox
        label="Search notes"
        value={search}
        options={filteredTags.map((tag) => ({
          id: tag.id,
          label: `#${tag.name}`,
          description: "Filter notes by tag",
        }))}
        enabled={search.startsWith("/")}
        emptyLabel={search.slice(1).trim() ? "No tags found" : "Type a tag name"}
        placeholder={selectedTag
          ? `Search in #${tagIndex[selectedTag]?.name ?? "tag"}`
          : "Search notes or type / for tags"}
        className="min-w-[120px] max-w-md flex-1"
        inputClassName="h-11 sm:h-10"
        onValueChange={onSearchChange}
        onClear={onClearSearch}
        onSelect={(option) => selectTag(option.id)}
      />

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="hidden shrink-0 gap-2 lg:inline-flex"
          onClick={() => onNavigate("/assets")}
        >
          <Images className="h-4 w-4" aria-hidden="true" />
          Assets
        </Button>

        <div className="flex shrink-0 items-center">
          <Button
            type="button"
            aria-label="New note"
            className="gap-2 rounded-r-none px-3 min-[360px]:px-4"
            onClick={onCreate}
            isLoading={creating}
          >
            <span aria-hidden="true">+</span>
            <span className="hidden min-[360px]:inline">New</span>
          </Button>
          <Menu
            label="New note options"
            trigger={<ChevronDown className="h-4 w-4" aria-hidden="true" />}
            triggerVariant="default"
            triggerSize="icon"
            triggerClassName="rounded-l-none border-l border-primary-foreground/20"
            entries={[
              {
                id: "template",
                label: "Use a template",
                onSelect: () => onNavigate("/templates"),
              },
            ]}
          />
        </div>

        <Menu
          label={userEmail ? `User menu for ${userEmail}` : "User menu"}
          trigger={avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="h-full w-full object-cover"
              style={{ imageRendering: "pixelated" }}
            />
          ) : (
            <span aria-hidden="true" className="text-xs font-medium">
              {(userEmail[0] || "U").toUpperCase()}
            </span>
          )}
          triggerClassName="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-border bg-muted p-0 sm:h-10 sm:w-10"
          entries={[
            {
              id: "settings",
              label: "Account settings",
              icon: <Settings className="h-4 w-4" />,
              onSelect: () => onNavigate("/settings?return=/docs"),
            },
            {
              id: "import",
              label: "Import",
              icon: <Download className="h-4 w-4" />,
              children: [
                {
                  id: "import-hedgedoc",
                  label: "HedgeDoc archive",
                  icon: <FileArchive className="h-4 w-4" />,
                  onSelect: () => onOpenImport("hedgedoc"),
                },
                {
                  id: "import-micronote",
                  label: "Micro Note archive",
                  icon: <FileArchive className="h-4 w-4" />,
                  onSelect: () => onOpenImport("notes"),
                },
              ],
            },
            {
              id: "export",
              label: "Export notes",
              icon: <Upload className="h-4 w-4" />,
              onSelect: onOpenExport,
            },
            {
              id: "logout",
              label: "Sign out",
              icon: <LogOut className="h-4 w-4" />,
              onSelect: onLogout,
            },
          ]}
        />
      </div>
    </header>
  );
}
