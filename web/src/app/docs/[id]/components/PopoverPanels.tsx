import React from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { EMOJI_TABS, COLORS, SIZES } from "../constants";
import type { EmojiTab } from "../constants";

type PopoverPanelsProps = {
  activePopover: "emoji" | "color" | "size" | null;
  setActivePopover: (v: "emoji" | "color" | "size" | null) => void;
  emojiTab: string;
  setEmojiTab: (key: string) => void;
  activeEmojiTab: EmojiTab;
  handleColor: (color: string) => void;
  handleSize: (size: string) => void;
  insertTextAtCursor: (text: string) => void;
  renderPopover: (content: React.ReactNode) => React.ReactPortal | null;
};

export function PopoverPanels(props: PopoverPanelsProps) {
  const { activePopover, setActivePopover, setEmojiTab, activeEmojiTab, handleColor, handleSize, insertTextAtCursor, renderPopover } = props;

  return (
    <>
      {activePopover === "color" && renderPopover(
        <div className="p-3 bg-background border border-border rounded-lg shadow-xl animate-in fade-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center mb-2 pb-2 border-b border-border">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">Select Color</span>
            <Button size="icon" variant="ghost" className="h-4 w-4" onClick={() => setActivePopover(null)}><X className="h-3 w-3" /></Button>
          </div>
          <div className="grid grid-cols-4 gap-2 w-48">
            {COLORS.map((c) => (
              <button key={c.value || "default"} onClick={() => handleColor(c.value)} className="h-8 w-full rounded-lg border border-input hover:scale-105 transition-transform flex items-center justify-center" style={{ backgroundColor: c.value || "transparent" }} title={c.label}>
                {!c.value && <span className="text-xs">A</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {activePopover === "size" && renderPopover(
        <div className="p-3 bg-background border border-border rounded-lg shadow-xl animate-in fade-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center mb-2 pb-2 border-b border-border">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">Select Size</span>
            <Button size="icon" variant="ghost" className="h-4 w-4" onClick={() => setActivePopover(null)}><X className="h-3 w-3" /></Button>
          </div>
          <div className="flex flex-col gap-1 w-32">
            {SIZES.map((s) => (
              <button key={s.value} onClick={() => handleSize(s.value)} className="text-sm px-2 py-1 hover:bg-accent rounded-lg text-left transition-colors flex items-center gap-2">
                <span style={{ fontSize: s.value }}>Aa</span>
                <span className="text-xs text-muted-foreground ml-auto">{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {activePopover === "emoji" && renderPopover(
        <div className="p-3 bg-background border border-border rounded-lg shadow-xl animate-in fade-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center mb-2 pb-2 border-b border-border">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">Insert Emoji</span>
            <Button size="icon" variant="ghost" className="h-4 w-4" onClick={() => setActivePopover(null)}><X className="h-3 w-3" /></Button>
          </div>
          <div className="flex flex-wrap gap-1 mb-2">
            {EMOJI_TABS.map((tab) => (
              <button key={tab.key} onClick={() => setEmojiTab(tab.key)} title={tab.label} aria-label={tab.label} className={`h-8 w-8 flex items-center justify-center rounded-full border transition-colors ${tab.key === activeEmojiTab.key ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}>
                <span className="text-sm">{tab.icon}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-8 gap-1 w-80 max-h-56 overflow-y-auto pr-1">
            {activeEmojiTab.items.map((emoji) => (
              <button key={emoji} onClick={() => { insertTextAtCursor(emoji); setActivePopover(null); }} className="text-xl p-2 hover:bg-accent rounded-lg transition-colors text-center">
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
