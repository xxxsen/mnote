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
          <span key={tag.id} className="group relative inline-flex items-center px-2.5 h-6 rounded-full border border-slate-200 bg-white text-[11px] font-medium text-slate-700 whitespace-nowrap" title={`#${tag.name}`}>
            {tag.name}
            <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleTag(tag.id); }} className="hidden group-hover:flex absolute -top-1 -right-1 h-3.5 w-3.5 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-400 hover:text-slate-700" aria-label={`Remove ${tag.name}`} title="Remove tag">
              <X className="h-2.5 w-2.5" />
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
                maxLength={16}
                className="h-6 w-28 rounded-full border border-slate-300 bg-white px-2 text-[11px] outline-none focus:border-slate-500"
              />
            </div>
          ) : (
            <button onClick={() => setInlineTagMode(true)} className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 transition-colors whitespace-nowrap" title="Add tag">
              <Tags className="h-3.5 w-3.5" />Add tag
            </button>
          )
        )}
        <div className="flex-1" />
        <button onClick={handleOpenQuickOpen} className="hidden md:inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-700 transition-colors whitespace-nowrap" title="Quick Open (Cmd+K)">
          <Command className="h-3 w-3" />Open
        </button>
      </div>

      {typeof window !== "undefined" && inlineTagMode && inlineTagMenuPos && (inlineTagLoading || inlineTagDropdownItems.length > 0) && createPortal(
        <div className="fixed z-[300] rounded-md border border-border bg-white shadow-lg p-1" style={{ left: inlineTagMenuPos.left, top: inlineTagMenuPos.top, width: inlineTagMenuPos.width }}>
          {inlineTagLoading ? (
            <div className="px-2 py-1.5 text-[11px] text-slate-400">Searching...</div>
          ) : inlineTagDropdownItems.map((item, index) => (
            <button key={item.key} onMouseDown={(e) => { e.preventDefault(); handleInlineTagSelect(item); }} className={`w-full text-left px-2 py-1.5 text-[11px] rounded ${index === inlineTagIndex ? "bg-muted text-foreground" : "hover:bg-muted/60 text-slate-700"}`}>
              {item.type === "create" ? `Create #${item.name || ""}` : `#${item.tag?.name || ""}`}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
