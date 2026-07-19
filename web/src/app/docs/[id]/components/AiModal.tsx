import { useCallback, useRef } from "react";
import { Sparkles } from "lucide-react";
import MarkdownPreview from "@/components/markdown-preview";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogStatus,
} from "@/components/ui/dialog";
import type { Tag } from "@/types";
import type { DiffLine } from "../types";

type AiModalProps = {
  open: boolean;
  aiAction: string | null;
  aiLoading: boolean;
  aiApplying: boolean;
  aiPrompt: string;
  aiResultText: string;
  aiResultReady: boolean;
  aiExistingTags: Tag[];
  aiSuggestedTags: string[];
  aiSelectedTags: string[];
  aiRemovedTagIDs: string[];
  aiError: string | null;
  aiDiffLines: DiffLine[];
  aiTitle: string;
  aiAvailableSlots: number;
  setAiPrompt: (value: string) => void;
  closeAiModal: () => void;
  handleAiGenerate: () => void;
  handleAiRetry: () => void;
  handleApplyAiText: () => void;
  handleApplyAiTags: () => void;
  handleApplyAiSummary: () => void;
  toggleAiTag: (tag: string) => void;
  toggleExistingTag: (id: string) => void;
};

export function AiModal(props: AiModalProps) {
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const setPromptElement = useCallback((element: HTMLTextAreaElement | null) => {
    promptRef.current = element;
  }, []);
  const title = props.aiTitle || "AI assistant";

  return (
    <Dialog
      open={props.open}
      title={title}
      description={props.aiLoading ? "AI is processing this request." : "Review every result before applying it to the note."}
      variant="modal"
      size="lg"
      dismissPolicy="when-idle"
      busy={props.aiApplying}
      initialFocusRef={props.aiAction === "generate" && !props.aiResultReady ? promptRef : undefined}
      onClose={props.closeAiModal}
    >
      <DialogHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {props.aiLoading ? "Working on your request…" : "Review before applying"}
            </p>
          </div>
        </div>
      </DialogHeader>
      <DialogBody className="space-y-4">
        {props.aiLoading ? (
          <DialogStatus variant="loading">
            Waiting for the AI response. Closing this dialog cancels the active request.
          </DialogStatus>
        ) : (
          <>
            {props.aiError ? (
              <DialogStatus variant="error">
                <div>{props.aiError}</div>
                <div className="mt-1 text-xs">Adjust the input or retry the action.</div>
              </DialogStatus>
            ) : null}
            {!props.aiError || props.aiAction === "generate" ? (
              <AiModalResult {...props} setPromptElement={setPromptElement} />
            ) : null}
          </>
        )}
      </DialogBody>
      <AiModalFooter {...props} />
    </Dialog>
  );
}

function AiModalResult({
  aiAction,
  aiResultText,
  aiResultReady,
  aiPrompt,
  aiDiffLines,
  setAiPrompt,
  setPromptElement,
  ...tagProps
}: AiModalProps & {
  setPromptElement: (element: HTMLTextAreaElement | null) => void;
}) {
  if (aiAction === "generate") {
    return (
      <div className="space-y-4">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-foreground">Brief description</span>
          <textarea
            ref={setPromptElement}
            className="min-h-[120px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Describe what you want to generate…"
            value={aiPrompt}
            onFocus={(event) => event.currentTarget.scrollIntoView({ block: "nearest" })}
            onChange={(event) => setAiPrompt(event.target.value)}
          />
        </label>
        {aiResultReady ? (
          aiResultText ? (
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <MarkdownPreview
                content={aiResultText}
                className="prose max-w-none text-foreground"
                enableMentionHoverPreview
              />
            </div>
          ) : (
            <DialogStatus variant="info">The AI returned an empty result. Adjust the prompt or regenerate.</DialogStatus>
          )
        ) : null}
      </div>
    );
  }
  if (aiAction === "polish" && aiResultText) {
    return <PolishDiff aiDiffLines={aiDiffLines} />;
  }
  if (aiAction === "summary" && aiResultText) {
    return (
      <div className="whitespace-pre-wrap rounded-xl border border-border bg-muted/20 p-4 text-sm leading-relaxed">
        {aiResultText}
      </div>
    );
  }
  if (aiAction === "tags") {
    return <TagsPanel {...tagProps} />;
  }
  return <DialogStatus variant="info">No AI result is available yet.</DialogStatus>;
}

function AiModalFooter(props: AiModalProps) {
  const hasResult = props.aiResultReady;
  return (
    <DialogFooter>
      <Button variant="outline" className="h-11 w-full sm:w-auto" onClick={props.closeAiModal} disabled={props.aiApplying}>
        Cancel
      </Button>
      {props.aiError ? (
        <Button className="h-11 w-full sm:w-auto" onClick={props.handleAiRetry}>
          Retry
        </Button>
      ) : null}
      {props.aiAction === "generate" && !hasResult && !props.aiError ? (
        <Button
          className="h-11 w-full sm:w-auto"
          onClick={props.handleAiGenerate}
          isLoading={props.aiLoading}
          disabled={!props.aiPrompt.trim()}
        >
          {props.aiLoading ? "Generating" : "Generate"}
        </Button>
      ) : null}
      {hasResult ? (
        <Button variant="outline" className="h-11 w-full sm:w-auto" onClick={props.handleAiRetry} disabled={props.aiLoading}>
          Regenerate
        </Button>
      ) : null}
      <AiApplyActions props={props} hasResult={hasResult} />
    </DialogFooter>
  );
}

function AiApplyActions({ props, hasResult }: { props: AiModalProps; hasResult: boolean }) {
  return (
    <>
      {props.aiAction === "tags" && hasResult ? (
        <Button className="h-11 w-full sm:w-auto" onClick={props.handleApplyAiTags} isLoading={props.aiLoading}>
          Apply tags
        </Button>
      ) : null}
      {props.aiAction === "summary" && hasResult && props.aiResultText ? (
        <Button className="h-11 w-full sm:w-auto" onClick={props.handleApplyAiSummary} isLoading={props.aiLoading}>
          Use summary
        </Button>
      ) : null}
      {(props.aiAction === "polish" || props.aiAction === "generate") && hasResult && props.aiResultText ? (
        <Button className="h-11 w-full sm:w-auto" onClick={props.handleApplyAiText} isLoading={props.aiLoading}>
          Use result
        </Button>
      ) : null}
    </>
  );
}

function PolishDiff({ aiDiffLines }: { aiDiffLines: DiffLine[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 font-mono text-xs md:grid-cols-2">
      <DiffPanel label="Original" lines={aiDiffLines} side="left" />
      <DiffPanel label="Polished" lines={aiDiffLines} side="right" />
    </div>
  );
}

function DiffPanel({
  label,
  lines,
  side,
}: {
  label: string;
  lines: DiffLine[];
  side: "left" | "right";
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold text-muted-foreground">{label}</h3>
      <div className="overflow-hidden rounded-xl border border-border">
        {lines.map((line, index) => {
          const changed = side === "left" ? line.type === "remove" : line.type === "add";
          return (
            <div
              key={`${side}-${index}`}
              className={`whitespace-pre-wrap px-2 py-1 ${
                changed
                  ? side === "left"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-success/10 text-success"
                  : "bg-background"
              }`}
            >
              {line[side] ?? " "}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TagsPanel(props: Pick<
  AiModalProps,
  | "aiExistingTags"
  | "aiSuggestedTags"
  | "aiSelectedTags"
  | "aiRemovedTagIDs"
  | "aiAvailableSlots"
  | "toggleAiTag"
  | "toggleExistingTag"
>) {
  return (
    <div className="space-y-5">
      <DialogStatus variant="info">Available tag slots: {props.aiAvailableSlots}</DialogStatus>
      <TagSection title="Current tags" empty="No tags on this note yet.">
        {props.aiExistingTags.map((tag) => {
          const removed = props.aiRemovedTagIDs.includes(tag.id);
          return (
            <button
              type="button"
              key={tag.id}
              aria-pressed={!removed}
              className={`min-h-11 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                removed
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-primary bg-primary text-primary-foreground"
              }`}
              onClick={() => props.toggleExistingTag(tag.id)}
            >
              #{tag.name}
            </button>
          );
        })}
      </TagSection>
      <TagSection title="AI suggested tags" empty="No valid tags returned.">
        {props.aiSuggestedTags.map((tag) => {
          const selected = props.aiSelectedTags.includes(tag);
          return (
            <button
              type="button"
              key={tag}
              aria-pressed={selected}
              className={`min-h-11 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"
              } hover:bg-accent`}
              onClick={() => props.toggleAiTag(tag)}
            >
              #{tag}
            </button>
          );
        })}
      </TagSection>
    </div>
  );
}

function TagSection({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {children.length === 0 ? (
        <div className="text-sm text-muted-foreground">{empty}</div>
      ) : (
        <div className="flex flex-wrap gap-2">{children}</div>
      )}
    </section>
  );
}
