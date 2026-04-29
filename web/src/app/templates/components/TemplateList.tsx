"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, X } from "lucide-react";
import type { TemplateMeta } from "@/types";
import { formatTemplateMtime } from "../utils";

export function TemplateList({
  filteredTemplates, templatesTotal, loading, loadingMore, selectedID,
  search, setSearch, setSelectedID, onDelete, onCreate, onScroll,
}: {
  filteredTemplates: TemplateMeta[]; templatesTotal: number; loading: boolean; loadingMore: boolean;
  selectedID: string; search: string; setSearch: (v: string) => void; setSelectedID: (id: string) => void;
  onDelete: (id: string, name: string) => void; onCreate: () => void;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
}) {
  return (
    <div className="border border-border rounded-xl p-4 bg-card h-[75vh] max-h-[calc(100vh-10rem)] overflow-hidden flex flex-col">
      <div className="mb-2 px-1 text-xs text-muted-foreground">Template List ({templatesTotal})</div>
      <div className="relative mb-2 pb-2 pr-2 border-b border-border">
        <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
        <Input className="pl-8 h-8" placeholder="Search template title..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto pr-2" style={{ scrollbarGutter: "stable" }} onScroll={onScroll}>
        {loading ? (
          <div className="text-sm text-muted-foreground p-3">Loading...</div>
        ) : filteredTemplates.length === 0 ? (
          <div className="text-sm text-muted-foreground p-3">No templates.</div>
        ) : (
          filteredTemplates.map((item) => (
            <div key={item.id} onClick={() => setSelectedID(item.id)} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedID(item.id); } }}
              className={`w-full text-left rounded-lg px-3 py-2 mb-1 border ${item.id === selectedID ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted"}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 text-left">
                  <div className="text-sm font-semibold truncate">{item.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{item.description || "No description"}</div>
                  <div className="text-[11px] text-muted-foreground truncate">Last saved: {formatTemplateMtime(item.mtime)}</div>
                </div>
                {item.id === selectedID && (
                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 self-center"
                    onClick={(e) => { e.stopPropagation(); onDelete(item.id, item.name); }} title="Delete template">
                    <X className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
        {!loading && loadingMore && <div className="text-xs text-muted-foreground p-2">Loading more...</div>}
      </div>
      <div className="pt-2 mt-auto border-t border-border">
        <Button onClick={onCreate} className="w-full"><Plus className="h-4 w-4 mr-2" />New Template</Button>
      </div>
    </div>
  );
}
