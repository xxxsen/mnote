import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw, X } from "lucide-react";
import MarkdownPreview from "@/components/markdown-preview";
import type { Tag } from "@/types";
import type { DiffLine } from "../types";

type AiModalProps = {
  open: boolean;
  aiAction: string | null;
  aiLoading: boolean;
  aiPrompt: string;
  aiResultText: string;
  aiExistingTags: Tag[];
  aiSuggestedTags: string[];
  aiSelectedTags: string[];
  aiRemovedTagIDs: string[];
  aiError: string | null;
  aiDiffLines: DiffLine[];
  aiTitle: string;
  aiAvailableSlots: number;
  setAiPrompt: (val: string) => void;
  closeAiModal: () => void;
  handleAiGenerate: () => void;
  handleApplyAiText: () => void;
  handleApplyAiTags: () => void;
  handleApplyAiSummary: () => void;
  toggleAiTag: (tag: string) => void;
  toggleExistingTag: (id: string) => void;
};

export function AiModal(props: AiModalProps) {
  const { open, aiLoading, aiTitle, closeAiModal } = props;
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[170] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={aiLoading ? undefined : closeAiModal} />
      <div className="relative w-full max-w-5xl bg-background border border-border rounded-2xl shadow-2xl overflow-hidden">
        <AiModalHeader aiTitle={aiTitle} aiLoading={aiLoading} closeAiModal={closeAiModal} />
        <AiModalBody {...props} />
        <AiModalFooter {...props} />
      </div>
    </div>
  );
}

function AiModalHeader({ aiTitle, aiLoading, closeAiModal }: { aiTitle: string; aiLoading: boolean; closeAiModal: () => void }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-border">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center"><Sparkles className="h-4 w-4" /></div>
        <div>
          <div className="text-sm font-bold">{aiTitle}</div>
          <div className="text-[11px] text-muted-foreground">{aiLoading ? "Generating..." : "Review before applying"}</div>
        </div>
      </div>
      <button className="text-muted-foreground hover:text-foreground" onClick={closeAiModal} disabled={aiLoading}><X className="h-4 w-4" /></button>
    </div>
  );
}

function AiModalBody(props: AiModalProps) {
  const { aiLoading, aiError, aiAction, aiResultText, aiPrompt, setAiPrompt, aiDiffLines, aiExistingTags, aiSuggestedTags, aiSelectedTags, aiRemovedTagIDs, aiAvailableSlots, toggleAiTag, toggleExistingTag } = props;
  return (
    <div className="p-5 max-h-[65vh] overflow-y-auto">
      {aiLoading && (<div className="flex items-center justify-center gap-3 text-sm text-muted-foreground py-12"><RefreshCw className="h-4 w-4 animate-spin" />Waiting for AI response...</div>)}
      {!aiLoading && aiError && (<div className="bg-destructive/10 text-destructive text-sm px-3 py-2 rounded-lg">{aiError}</div>)}
      {!aiLoading && !aiError && <AiModalResult aiAction={aiAction} aiResultText={aiResultText} aiPrompt={aiPrompt} setAiPrompt={setAiPrompt} aiDiffLines={aiDiffLines} aiExistingTags={aiExistingTags} aiSuggestedTags={aiSuggestedTags} aiSelectedTags={aiSelectedTags} aiRemovedTagIDs={aiRemovedTagIDs} aiAvailableSlots={aiAvailableSlots} toggleAiTag={toggleAiTag} toggleExistingTag={toggleExistingTag} />}
    </div>
  );
}

function AiModalResult(props: {
  aiAction: string | null; aiResultText: string; aiPrompt: string; setAiPrompt: (val: string) => void;
  aiDiffLines: DiffLine[]; aiExistingTags: Tag[]; aiSuggestedTags: string[]; aiSelectedTags: string[];
  aiRemovedTagIDs: string[]; aiAvailableSlots: number; toggleAiTag: (tag: string) => void; toggleExistingTag: (id: string) => void;
}) {
  const { aiAction, aiResultText, aiPrompt, setAiPrompt, aiDiffLines, aiExistingTags, aiSuggestedTags, aiSelectedTags, aiRemovedTagIDs, aiAvailableSlots, toggleAiTag, toggleExistingTag } = props;
  if (aiAction === "generate" && !aiResultText) {
    return (
      <div className="space-y-3">
        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Brief description</label>
        <textarea className="w-full min-h-[140px] rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" placeholder="Describe what you want to generate..." value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} />
      </div>
    );
  }
  if (aiAction === "polish" && aiResultText) return <PolishDiff aiDiffLines={aiDiffLines} />;
  if (aiAction === "generate" && aiResultText) return <div className="border border-border rounded-xl p-4 bg-muted/20"><MarkdownPreview content={aiResultText} className="prose prose-slate max-w-none" enableMentionHoverPreview /></div>;
  if (aiAction === "summary" && aiResultText) return <div className="border border-border rounded-xl p-4 bg-muted/20 text-sm leading-relaxed whitespace-pre-wrap">{aiResultText}</div>;
  if (aiAction === "tags") return <TagsPanel aiExistingTags={aiExistingTags} aiSuggestedTags={aiSuggestedTags} aiSelectedTags={aiSelectedTags} aiRemovedTagIDs={aiRemovedTagIDs} aiAvailableSlots={aiAvailableSlots} toggleAiTag={toggleAiTag} toggleExistingTag={toggleExistingTag} />;
  return null;
}

function AiModalFooter(props: AiModalProps) {
  const { aiAction, aiLoading, aiResultText, aiSuggestedTags, closeAiModal, handleAiGenerate, handleApplyAiText, handleApplyAiTags, handleApplyAiSummary } = props;
  return (
    <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
      <Button variant="outline" onClick={closeAiModal} disabled={aiLoading}>Cancel</Button>
      {aiAction === "generate" && !aiResultText && (<Button onClick={handleAiGenerate} disabled={aiLoading}>Generate</Button>)}
      {aiAction === "tags" && aiSuggestedTags.length > 0 && (<Button onClick={handleApplyAiTags} disabled={aiLoading}>Apply Tags</Button>)}
      {aiAction === "summary" && aiResultText && (<Button onClick={handleApplyAiSummary} disabled={aiLoading}>Use Summary</Button>)}
      {(aiAction === "polish" || aiAction === "generate") && aiResultText && (<Button onClick={handleApplyAiText} disabled={aiLoading}>Use Result</Button>)}
    </div>
  );
}

function PolishDiff({ aiDiffLines }: { aiDiffLines: DiffLine[] }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 text-xs font-mono">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Original</div>
          <div className="border border-border rounded-lg overflow-hidden">
            {aiDiffLines.map((line, i) => (<div key={`left-${i}`} className={`px-2 py-1 whitespace-pre-wrap ${line.type === "remove" ? "bg-rose-50 text-rose-700" : "bg-background"}`}>{line.left ?? " "}</div>))}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Polished</div>
          <div className="border border-border rounded-lg overflow-hidden">
            {aiDiffLines.map((line, i) => (<div key={`right-${i}`} className={`px-2 py-1 whitespace-pre-wrap ${line.type === "add" ? "bg-emerald-50 text-emerald-700" : "bg-background"}`}>{line.right ?? " "}</div>))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TagsPanel(props: {
  aiExistingTags: Tag[]; aiSuggestedTags: string[]; aiSelectedTags: string[];
  aiRemovedTagIDs: string[]; aiAvailableSlots: number;
  toggleAiTag: (tag: string) => void; toggleExistingTag: (id: string) => void;
}) {
  const { aiExistingTags, aiSuggestedTags, aiSelectedTags, aiRemovedTagIDs, aiAvailableSlots, toggleAiTag, toggleExistingTag } = props;
  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">Available slots: {aiAvailableSlots}</div>
      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Current tags</div>
        {aiExistingTags.length === 0 ? (<div className="text-sm text-muted-foreground">No tags on this note yet.</div>) : (
          <div className="flex flex-wrap gap-2">
            {aiExistingTags.map((tag) => {
              const removed = aiRemovedTagIDs.includes(tag.id);
              return (<button key={tag.id} className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${removed ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-black text-white border-black"}`} onClick={() => toggleExistingTag(tag.id)}>#{tag.name}</button>);
            })}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">AI suggested tags</div>
        {aiSuggestedTags.length === 0 ? (<div className="text-sm text-muted-foreground">No valid tags returned.</div>) : (
          <div className="flex flex-wrap gap-2">
            {aiSuggestedTags.map((tag) => {
              const checked = aiSelectedTags.includes(tag);
              return (<button key={tag} className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${checked ? "bg-black text-white border-black" : "bg-background border-border"} hover:bg-accent`} onClick={() => toggleAiTag(tag)}>#{tag}</button>);
            })}
          </div>
        )}
      </div>
    </div>
  );
}
