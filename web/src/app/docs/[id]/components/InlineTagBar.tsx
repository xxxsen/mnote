import React from "react";
import { createPortal } from "react-dom";
import { Tags, Command, X } from "lucide-react";
import type { Tag } from "@/types";
import type { InlineTagDropdownItem } from "../types";
import { MAX_TAGS } from "../constants";

type InlineTagBarProps = {
  selectedTags: Tag[];
  toggleTag: (tagID: string) => void;
  inlineTagMode: boolean;
  setInlineTagMode: (v: boolean) => void;
  inlineTagValue: string;
  setInlineTagValue: (v: string) => void;
  inlineTagLoading: boolean;
  inlineTagIndex: number;
  setInlineTagIndex: (v: number) => void;
  inlineTagMenuPos: { left: number; top: number; width: number } | null;
  inlineTagInputRef: React.RefObject<HTMLInputElement | null>;
  inlineTagComposeRef: React.RefObject<boolean>;
  inlineTagDropdownItems: InlineTagDropdownItem[];
  handleInlineAddTag: () => void;
  handleInlineTagSelect: (item: InlineTagDropdownItem) => void;
  handleOpenQuickOpen: () => void;
};

export function InlineTagBar(props: InlineTagBarProps) {
  const {
    selectedTags, toggleTag, inlineTagMode, setInlineTagMode,
    inlineTagValue, setInlineTagValue, inlineTagLoading,
    inlineTagIndex, setInlineTagIndex, inlineTagMenuPos,
    inlineTagInputRef, inlineTagComposeRef, inlineTagDropdownItems,
    handleInlineAddTag, handleInlineTagSelect, handleOpenQuickOpen,
  } = props;

  return (
    <>
      <div className="relative z-20 flex items-center bg-background border-b border-border shrink-0 px-3 h-8 gap-1.5 overflow-x-auto overflow-y-visible no-scrollbar">
        {selectedTags.length > 0 && selectedTags.map((tag) => (
          <span key={tag.id} className="relative inline-flex h-6 items-center whitespace-nowrap rounded-full border border-border bg-muted pl-2.5 pr-7 text-xs font-medium text-foreground" title={`#${tag.name}`}>
            {tag.name}
            <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleTag(tag.id); }} className="absolute right-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Remove ${tag.name}`} title="Remove tag">
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        {selectedTags.length < MAX_TAGS && (
          inlineTagMode ? (
            <div>
              <input
                ref={inlineTagInputRef}
                value={inlineTagValue}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (inlineTagComposeRef.current) { setInlineTagValue(raw); return; }
                  setInlineTagValue(raw.replace(/[^\p{Script=Han}A-Za-z0-9]/gu, "").slice(0, 16));
                }}
                onCompositionStart={() => { inlineTagComposeRef.current = true; }}
                onCompositionEnd={(e) => {
                  inlineTagComposeRef.current = false;
                  setInlineTagValue(e.currentTarget.value.replace(/[^\p{Script=Han}A-Za-z0-9]/gu, "").slice(0, 16));
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); if (inlineTagDropdownItems.length === 0) return; setInlineTagIndex((inlineTagIndex + 1) % inlineTagDropdownItems.length); return; }
                  if (e.key === "ArrowUp") { e.preventDefault(); if (inlineTagDropdownItems.length === 0) return; setInlineTagIndex((inlineTagIndex - 1 + inlineTagDropdownItems.length) % inlineTagDropdownItems.length); return; }
                  if (e.key === "Enter") { e.preventDefault(); if (inlineTagDropdownItems.length > 0) { handleInlineTagSelect(inlineTagDropdownItems[inlineTagIndex]); return; } handleInlineAddTag(); return; }
                  if (e.key === "Escape") { e.preventDefault(); setInlineTagMode(false); setInlineTagValue(""); }
                }}
                onBlur={() => { window.setTimeout(() => { setInlineTagMode(false); setInlineTagValue(""); }, 120); }}
                placeholder="Tag name"
                aria-label="Tag name"
                maxLength={16}
                className="h-6 w-28 rounded-full border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          ) : (
            <button type="button" onClick={() => setInlineTagMode(true)} className="inline-flex min-h-6 items-center gap-1 whitespace-nowrap rounded-md px-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title="Add tag">
              <Tags className="h-3.5 w-3.5" aria-hidden="true" />Add tag
            </button>
          )
        )}
        <div className="flex-1" />
        <button type="button" onClick={handleOpenQuickOpen} className="hidden min-h-6 items-center gap-1 whitespace-nowrap rounded-md px-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:inline-flex" title="Quick Open (Cmd+K)">
          <Command className="h-3 w-3" aria-hidden="true" />Open
        </button>
      </div>

      {typeof window !== "undefined" && inlineTagMode && inlineTagMenuPos && (inlineTagLoading || inlineTagDropdownItems.length > 0) && createPortal(
        <div className="fixed z-[220] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg" style={{ left: inlineTagMenuPos.left, top: inlineTagMenuPos.top, width: inlineTagMenuPos.width }}>
          {inlineTagLoading ? (
            <div role="status" className="px-2 py-1.5 text-xs text-muted-foreground">Searching…</div>
          ) : inlineTagDropdownItems.map((item, index) => (
            <button type="button" key={item.key} onMouseDown={(e) => { e.preventDefault(); handleInlineTagSelect(item); }} className={`w-full rounded px-2 py-1.5 text-left text-xs ${index === inlineTagIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground"}`}>
              {item.type === "create" ? `Create #${item.name || ""}` : `#${item.tag?.name || ""}`}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
