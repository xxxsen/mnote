import type { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import type { ReactNode, ReactPortal, RefObject } from "react";
import type { ThemeId } from "@/lib/editor-themes";
import type { OutlineEntry } from "@/components/markdown-preview/types";
import type {
  Document as MnoteDocument,
  DocumentVersionSummary,
  Share,
  Tag,
} from "@/types";
import type { EmojiTab } from "./constants";
import type { EditorContextRailController } from "./hooks/useEditorContextRail";
import type { MarkdownCommand } from "./commands/markdown-commands";
import type {
  AIAction,
  DiffLine,
  EditorSyncStatus,
  InlineTagDropdownItem,
  SimilarDoc,
  SlashCommand,
} from "./types";

export type EditorToast = (options: {
  description: string | Error;
  variant?: "default" | "success" | "error";
}) => void;

export interface EditorBufferContract {
  content: string;
  previewContent: string;
  previewPending: boolean;
  cursorPos: { line: number; col: number };
  wordCount: number;
  charCount: number;
  publishContent: (content: string, immediatePreview?: boolean) => void;
  executeCommand: (command: MarkdownCommand) => void;
  insertTextAtCursor: (text: string) => void;
  handleUndo: () => void;
  handleRedo: () => void;
}

export interface EditorScrollContract {
  previewRef: RefObject<HTMLDivElement | null>;
  activeTocId: string | null;
  suppressNextSync: () => () => void;
  handlePreviewScroll: () => void;
  handlePreviewWheel: (event: WheelEvent) => void;
  scrollEditorToSourceLine: (sourceLine: number, id: string) => boolean;
  scrollPreviewToHeading: (id: string) => boolean;
}

export interface EditorPopoverContract {
  activePopover: "emoji" | "color" | "size" | null;
  setActivePopover: (value: "emoji" | "color" | "size" | null) => void;
  emojiTab: string;
  setEmojiTab: (value: string) => void;
  activeEmojiTab: EmojiTab;
  colorButtonRef: RefObject<HTMLButtonElement | null>;
  sizeButtonRef: RefObject<HTMLButtonElement | null>;
  emojiButtonRef: RefObject<HTMLButtonElement | null>;
  handleColor: (color: string) => void;
  handleSize: (size: string) => void;
  renderPopover: (content: ReactNode) => ReactPortal | null;
}

export interface EditorSlashMenuContract {
  slashMenu: { open: boolean; x: number; y: number; filter: string };
  slashIndex: number;
  setSlashIndex: (index: number) => void;
  filteredSlashCommands: SlashCommand[];
  handleSlashAction: (action: SlashCommand["action"]) => void;
}

export interface EditorWikilinkMenuContract {
  wikilinkMenu: {
    open: boolean;
    x: number;
    y: number;
    query: string;
    from: number;
  };
  wikilinkResults: Array<{ id: string; title: string }>;
  wikilinkLoading: boolean;
  wikilinkIndex: number;
  handleWikilinkSelect: (title: string, id: string) => void;
}

export interface EditorLinkGraphContract {
  backlinks: MnoteDocument[];
  outboundLinks: MnoteDocument[];
  linkGraph: {
    nodes: Array<{
      id: string;
      title: string;
      x: number;
      y: number;
      kind: "current" | "incoming" | "outgoing" | "both";
    }>;
    edges: Array<{ from: string; to: string }>;
    positionByID: Partial<Record<string, { x: number; y: number }>>;
  };
}

export interface EditorInlineTagContract {
  inlineTagMode: boolean;
  setInlineTagMode: (value: boolean) => void;
  inlineTagValue: string;
  setInlineTagValue: (value: string) => void;
  inlineTagLoading: boolean;
  inlineTagIndex: number;
  setInlineTagIndex: (index: number) => void;
  inlineTagMenuPos: { left: number; top: number; width: number } | null;
  inlineTagInputRef: RefObject<HTMLInputElement | null>;
  inlineTagComposeRef: RefObject<boolean>;
  inlineTagDropdownItems: InlineTagDropdownItem[];
  handleInlineAddTag: (name?: string) => Promise<void>;
  handleInlineTagSelect: (item: InlineTagDropdownItem) => Promise<void>;
}

export interface EditorPreviewContract {
  previewDoc: MnoteDocument | null;
  setPreviewDoc: (document: MnoteDocument | null) => void;
  previewLoading: boolean;
  handleOpenPreview: (documentID: string) => Promise<void>;
}

export interface EditorShareConfig {
  expires_at: number;
  password?: string;
  clear_password?: boolean;
  permission: "view" | "comment";
  allow_download: boolean;
}

export interface EditorShareContract {
  shareUrl: string;
  activeShare: Share | null;
  copied: boolean;
  handleShare: () => Promise<void>;
  loadShare: () => Promise<void>;
  updateShareConfig: (payload: EditorShareConfig) => Promise<void>;
  handleRevokeShare: () => Promise<void>;
  handleCopyLink: () => void;
}

export interface EditorQuickOpenContract {
  showQuickOpen: boolean;
  quickOpenQuery: string;
  quickOpenIndex: number;
  quickOpenLoading: boolean;
  showSearchResults: boolean;
  quickOpenDocs: MnoteDocument[];
  setQuickOpenQuery: (query: string) => void;
  setQuickOpenIndex: (index: number) => void;
  handleOpenQuickOpen: () => void;
  handleCloseQuickOpen: () => void;
  handleQuickOpenSelect: (document: MnoteDocument) => void;
}

export interface EditorTagContract {
  selectedTags: Tag[];
  toggleTag: (tagID: string) => void;
  mergeTags: (tags: Tag[]) => void;
  saveTagIDs: (tagIDs: string[]) => Promise<void>;
  findExistingTagByName: (name: string) => Promise<Tag | null>;
}

export interface EditorAiContract {
  aiModalOpen: boolean;
  aiAction: AIAction | null;
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
  setAiPrompt: (prompt: string) => void;
  closeAiModal: () => void;
  handleAiPolish: (content: string) => Promise<void>;
  handleAiGenerateOpen: () => void;
  handleAiGenerate: () => Promise<void>;
  handleAiRetry: () => Promise<void> | undefined;
  handleAiSummary: (content: string) => Promise<void>;
  handleAiTags: (content: string) => Promise<void>;
  handleApplyAiSummary: (options: {
    onApplied: (summary: string) => void;
    onError: (message: string) => void;
  }) => Promise<void>;
  handleApplyAiTags: (options: {
    findExistingTagByName: (name: string) => Promise<Tag | null>;
    mergeTags: (tags: Tag[]) => void;
    saveTagIDs: (tagIDs: string[]) => Promise<void>;
    onError: (message: string) => void;
  }) => Promise<void>;
  toggleAiTag: (name: string) => void;
  toggleExistingTag: (tagID: string) => void;
}

export interface EditorSimilarContract {
  similarDocs: SimilarDoc[];
  similarLoading: boolean;
  similarCollapsed: boolean;
  similarIconVisible: boolean;
  handleToggleSimilar: () => void;
  handleCollapseSimilar: () => void;
  handleCloseSimilar: () => void;
}

export interface EditorSessionContract {
  contentRef: RefObject<string>;
  ec: EditorBufferContract;
  title: string;
  saveStatus: EditorSyncStatus;
  titleMissing: boolean;
  localBackupUnavailable: boolean;
}

export interface EditorCommandsContract {
  scrollSync: EditorScrollContract;
  popover: EditorPopoverContract;
  slashMenu: EditorSlashMenuContract;
  wikilinkMenu: EditorWikilinkMenuContract;
  editorExt: { editorExtensions: Extension[] };
  handleThemeChange: (theme: ThemeId) => void;
  handleSave: () => void;
  handleRetry: () => void;
  handleResolveConflict: () => void;
  handleDelete: () => Promise<void>;
  handleStarToggle: () => Promise<void>;
  handleExportMarkdown: () => void;
  handleExportConfluenceHTML: () => Promise<void>;
  handleApplyAiText: () => void;
  handleRevert: (version: DocumentVersionSummary) => void;
  onCreateEditor: (view: EditorView) => void;
  setSummary: (summary: string) => void;
  setLastSavedAt: (timestamp: number) => void;
}

export interface EditorUiContract {
  navigate: (path: string) => void;
  toast: EditorToast;
  linkGraphHook: EditorLinkGraphContract;
  outline: readonly OutlineEntry[];
  contextRail: EditorContextRailController;
  inlineTag: EditorInlineTagContract;
  preview: EditorPreviewContract;
  share: EditorShareContract;
  quickOpen: EditorQuickOpenContract;
  tagState: EditorTagContract;
  ai: EditorAiContract;
  sim: EditorSimilarContract;
  documentActions: {
    listVersions: () => Promise<DocumentVersionSummary[]>;
  };
  summary: string;
  starred: number;
  currentThemeId: ThemeId;
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: (value: boolean) => void;
  showPreviewModal: boolean;
  setShowPreviewModal: (value: boolean) => void;
  viewMode: "edit" | "split" | "preview";
  setViewMode: (mode: "edit" | "split" | "preview") => void;
  splitRatio: number;
  setSplitRatio: (ratio: number) => void;
  scrollSyncEnabled: boolean;
  setScrollSyncEnabled: (enabled: boolean) => void;
}

export interface EditorShellProps {
  session: EditorSessionContract;
  commands: EditorCommandsContract;
  ui: EditorUiContract;
}

export type EditorShellFlatContract = EditorSessionContract &
  EditorCommandsContract &
  EditorUiContract;
