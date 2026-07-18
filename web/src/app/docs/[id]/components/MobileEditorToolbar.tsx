"use client";

import { useState } from "react";
import {
  Bold,
  Heading1,
  Italic,
  Link,
  MoreHorizontal,
  Redo,
  Undo,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { THEMES, type ThemeId } from "@/lib/editor-themes";
import { COLORS, EMOJI_TABS, SIZES } from "../constants";
import type { MarkdownCommand } from "../commands/markdown-commands";

type MobilePanel = "emoji" | "color" | "size" | null;

type Props = {
  onUndo: () => void;
  onRedo: () => void;
  executeCommand: (command: MarkdownCommand) => void;
  onAiPolish: () => void;
  onAiGenerate: () => void;
  onAiTags: () => void;
  aiBusy: boolean;
  onColor: (color: string) => void;
  onSize: (size: string) => void;
  onInsertEmoji: (emoji: string) => void;
  currentTheme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
  onPreview: () => void;
};

export function MobileEditorToolbar(props: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [panel, setPanel] = useState<MobilePanel>(null);
  const [emojiTab, setEmojiTab] = useState(EMOJI_TABS[0].key);
  const activeEmojiTab = EMOJI_TABS.find((tab) => tab.key === emojiTab) || EMOJI_TABS[0];

  const closeSheet = () => {
    setPanel(null);
    setMoreOpen(false);
  };
  const run = (command: MarkdownCommand) => {
    props.executeCommand(command);
    closeSheet();
  };

  return (
    <>
      <div
        role="toolbar"
        aria-label="Markdown formatting"
        className="grid h-12 grid-cols-7 border-b border-border bg-background lg:hidden"
      >
        <ToolButton label="Undo" onClick={props.onUndo}><Undo /></ToolButton>
        <ToolButton label="Redo" onClick={props.onRedo}><Redo /></ToolButton>
        <ToolButton label="Heading 1" onClick={() => run({ kind: "heading", level: 1 })}><Heading1 /></ToolButton>
        <ToolButton label="Bold" onClick={() => run({ kind: "inline", mark: "bold" })}><Bold /></ToolButton>
        <ToolButton label="Italic" onClick={() => run({ kind: "inline", mark: "italic" })}><Italic /></ToolButton>
        <ToolButton label="Link" onClick={() => run({ kind: "insert", item: "link" })}><Link /></ToolButton>
        <ToolButton label="More formatting" onClick={() => setMoreOpen(true)}><MoreHorizontal /></ToolButton>
      </div>
      <Dialog
        open={moreOpen}
        title="More formatting"
        description="Additional Markdown, AI, and appearance tools."
        variant="sheet"
        onClose={closeSheet}
      >
        <DialogHeader />
        <DialogBody className="space-y-5">
          <CommandGroup title="Block" commands={[
            ["Heading 2", { kind: "heading", level: 2 }],
            ["Heading 3", { kind: "heading", level: 3 }],
            ["Bullet list", { kind: "block", block: "bullet" }],
            ["Ordered list", { kind: "block", block: "ordered" }],
            ["Task list", { kind: "block", block: "task" }],
            ["Quote", { kind: "block", block: "quote" }],
          ]} run={run} />
          <CommandGroup title="Inline" commands={[
            ["Strikethrough", { kind: "inline", mark: "strike" }],
            ["Underline", { kind: "inline", mark: "underline" }],
            ["Inline code", { kind: "inline", mark: "code" }],
          ]} run={run} />
          <CommandGroup title="Insert" commands={[
            ["Code block", { kind: "insert", item: "codeBlock" }],
            ["Table", { kind: "insert", item: "table" }],
          ]} run={run} />
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI</h3>
            <div className="grid grid-cols-2 gap-2">
              <Button className="min-h-11" variant="outline" disabled={props.aiBusy} onClick={() => { props.onAiPolish(); closeSheet(); }}>Polish</Button>
              <Button className="min-h-11" variant="outline" disabled={props.aiBusy} onClick={() => { props.onAiGenerate(); closeSheet(); }}>Generate</Button>
              <Button className="min-h-11" variant="outline" disabled={props.aiBusy} onClick={() => { props.onAiTags(); closeSheet(); }}>Suggest tags</Button>
            </div>
          </section>
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Appearance</h3>
            <div className="grid grid-cols-2 gap-2">
              <Button className="min-h-11" variant="outline" aria-expanded={panel === "emoji"} onClick={() => setPanel(panel === "emoji" ? null : "emoji")}>Emoji</Button>
              <Button className="min-h-11" variant="outline" aria-expanded={panel === "color"} onClick={() => setPanel(panel === "color" ? null : "color")}>Text color</Button>
              <Button className="min-h-11" variant="outline" aria-expanded={panel === "size"} onClick={() => setPanel(panel === "size" ? null : "size")}>Font size</Button>
              <Button className="min-h-11" variant="outline" onClick={() => { props.onPreview(); closeSheet(); }}>Full preview</Button>
            </div>
            <label className="mt-3 block text-xs font-medium text-muted-foreground">
              Editor theme
              <select
                value={props.currentTheme}
                onChange={(event) => props.onThemeChange(event.target.value as ThemeId)}
                className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
              >
                {THEMES.map((theme) => (
                  <option key={theme.id} value={theme.id}>{theme.label}</option>
                ))}
              </select>
            </label>
            {panel === "emoji" ? (
              <div role="group" aria-label="Emoji picker" className="mt-3 rounded-lg border border-border p-2">
                <div className="mb-2 flex flex-wrap gap-1">
                  {EMOJI_TABS.map((tab) => (
                    <button
                      type="button"
                      key={tab.key}
                      aria-label={tab.label}
                      aria-pressed={tab.key === activeEmojiTab.key}
                      onClick={() => setEmojiTab(tab.key)}
                      className="flex h-11 w-11 items-center justify-center rounded-md border border-border"
                    >
                      {tab.icon}
                    </button>
                  ))}
                </div>
                <div className="grid max-h-48 grid-cols-7 gap-1 overflow-y-auto">
                  {activeEmojiTab.items.map((emoji) => (
                    <button
                      type="button"
                      key={emoji}
                      aria-label={`Insert ${emoji}`}
                      onClick={() => { props.onInsertEmoji(emoji); closeSheet(); }}
                      className="flex h-11 w-11 items-center justify-center rounded-md text-xl hover:bg-accent"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {panel === "color" ? (
              <div role="group" aria-label="Text color picker" className="mt-3 grid grid-cols-4 gap-2 rounded-lg border border-border p-2">
                {COLORS.map((color) => (
                  <button
                    type="button"
                    key={color.value || "default"}
                    aria-label={color.label}
                    onClick={() => { props.onColor(color.value); closeSheet(); }}
                    className="flex min-h-11 items-center justify-center rounded-md border border-border text-xs"
                    style={{ backgroundColor: color.value || "transparent" }}
                  >
                    {!color.value ? "Default" : ""}
                  </button>
                ))}
              </div>
            ) : null}
            {panel === "size" ? (
              <div role="group" aria-label="Font size picker" className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-border p-2">
                {SIZES.map((size) => (
                  <button
                    type="button"
                    key={size.value}
                    onClick={() => { props.onSize(size.value); closeSheet(); }}
                    className="min-h-11 rounded-md border border-border px-2 text-left"
                  >
                    <span style={{ fontSize: size.value }}>Aa</span>
                    <span className="ml-2 text-xs text-muted-foreground">{size.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        </DialogBody>
        <DialogFooter>
          <Button className="h-11 w-full sm:w-auto" onClick={closeSheet}>Done</Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

function ToolButton(props: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      className="flex min-h-11 min-w-11 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:h-5 [&_svg]:w-5"
    >
      {props.children}
    </button>
  );
}

function CommandGroup(props: {
  title: string;
  commands: [string, MarkdownCommand][];
  run: (command: MarkdownCommand) => void;
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{props.title}</h3>
      <div className="grid grid-cols-2 gap-2">
        {props.commands.map(([label, command]) => (
          <Button className="min-h-11" key={label} variant="outline" onClick={() => props.run(command)}>{label}</Button>
        ))}
      </div>
    </section>
  );
}
