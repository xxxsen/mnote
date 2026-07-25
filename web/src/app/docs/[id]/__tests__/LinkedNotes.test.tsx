import { createRef } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EditorShellFlatContract } from "../editor-contracts";
import { EditorHeader } from "../components/EditorHeader";
import { LinkedNotesContent } from "../components/LinkedNotesContent";
import { LinkedNotesOverlay } from "../components/LinkedNotesOverlay";
import { LinkedNotesTrigger } from "../components/LinkedNotesTrigger";
import type { DocumentLinksController } from "../hooks/useDocumentLinks";

function installMatchMedia(matches: boolean) {
  const media = {
    matches,
    media: "(min-width: 1024px)",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;
  vi.stubGlobal("matchMedia", vi.fn(() => media));
}

function links(
  overrides: Partial<DocumentLinksController> = {},
): DocumentLinksController {
  return {
    scopeKey: "doc-1",
    open: true,
    activeTab: "incoming",
    status: "ready",
    refreshing: false,
    refreshError: false,
    counts: { incoming: 1, outgoing: 1, unique: 1 },
    incoming: [
      { id: "linked-1", title: "Linked title", mtime: 10, mutual: true },
    ],
    outgoing: [
      { id: "linked-1", title: "Linked title", mtime: 10, mutual: true },
    ],
    incomingNextCursor: "",
    outgoingNextCursor: "",
    loadingMore: null,
    loadMoreError: null,
    triggerRef: createRef<HTMLButtonElement>(),
    mobileTriggerRef: createRef<HTMLButtonElement>(),
    loaded: true,
    hasDraftLinkChanges: false,
    openPanel: vi.fn(),
    closePanel: vi.fn(),
    setActiveTab: vi.fn(),
    retry: vi.fn().mockResolvedValue(undefined),
    loadMore: vi.fn().mockResolvedValue(undefined),
    setTriggerElement: vi.fn(),
    setMobileTriggerElement: vi.fn(),
    ...overrides,
  };
}

function headerProps() {
  return {
    onBack: vi.fn(),
    title: "Document",
    syncStatus: "SYNCED" as const,
    titleMissing: false,
    onSave: vi.fn(),
    onRetry: vi.fn(),
    onResolveConflict: vi.fn(),
    outlineOpen: false,
    detailsOpen: false,
    onShowOutline: vi.fn(),
    onToggleDetails: vi.fn(),
    starred: 0,
    handleStarToggle: vi.fn(),
    viewMode: "split" as const,
    setViewMode: vi.fn(),
    scrollSyncEnabled: true,
    onToggleScrollSync: vi.fn(),
    linkedNotesOpen: false,
    linkedNotesLoaded: true,
    linkedNotesCount: 4,
    onLinkedNotesTriggerElement: vi.fn(),
    onMobileMenuTriggerElement: vi.fn(),
    onToggleLinkedNotes: vi.fn(),
    onOpenLinkedNotes: vi.fn(),
  };
}

beforeEach(() => {
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LinkedNotesTrigger and responsive entry", () => {
  it("shows active state and caps the visible count at 99+", () => {
    render(
      <LinkedNotesTrigger
        open
        loaded
        count={128}
        onClick={vi.fn()}
      />,
    );
    const trigger = screen.getByRole("button", {
      name: "Close linked notes",
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("99+")).toBeTruthy();
  });

  it("uses a direct desktop entry and a single mobile More entry", () => {
    installMatchMedia(true);
    const props = headerProps();
    const { unmount } = render(<EditorHeader {...props} />);
    expect(
      screen.getByRole("button", {
        name: "Open linked notes, 4 linked notes",
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "More editor actions" }),
    ).toBeNull();
    unmount();

    installMatchMedia(false);
    render(<EditorHeader {...props} />);
    expect(
      screen.queryByRole("button", { name: /Open linked notes/ }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "More editor actions" }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Linked notes (4)" }),
    );
    expect(props.onOpenLinkedNotes).toHaveBeenCalledTimes(1);
  });
});

describe("LinkedNotesContent", () => {
  it("defaults to Incoming, preserves panel state, and supports keyboard tabs", () => {
    const controller = links();
    const { rerender } = render(
      <LinkedNotesContent
        links={controller}
        onPreview={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    const incomingTab = screen.getByRole("tab", { name: "Incoming 1" });
    expect(incomingTab.getAttribute("aria-selected")).toBe("true");
    const incomingPanel = screen.getByRole("tabpanel");
    incomingPanel.scrollTop = 48;

    fireEvent.keyDown(incomingTab, { key: "ArrowRight" });
    expect(controller.setActiveTab).toHaveBeenCalledWith("outgoing");
    rerender(
      <LinkedNotesContent
        links={links({ ...controller, activeTab: "outgoing" })}
        onPreview={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Incoming 1" }));
    expect(incomingPanel.scrollTop).toBe(48);
  });

  it("renders mutual rows and keeps Preview separate from Open", () => {
    const onPreview = vi.fn();
    const onOpen = vi.fn();
    render(
      <LinkedNotesContent
        links={links()}
        onPreview={onPreview}
        onOpen={onOpen}
      />,
    );
    expect(screen.getAllByText("Mutual")).toHaveLength(2);
    fireEvent.click(
      screen.getByRole("button", { name: "Preview Linked title" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Open Linked title" }),
    );
    expect(onPreview).toHaveBeenCalledWith("linked-1");
    expect(onOpen).toHaveBeenCalledWith("linked-1");
  });

  it("shows empty, draft, refresh, and retryable error states", () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <LinkedNotesContent
        links={links({
          incoming: [],
          hasDraftLinkChanges: true,
          refreshing: true,
        })}
        onPreview={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Save this note to update linked notes."),
    ).toBeTruthy();
    expect(screen.getByText("Refreshing…")).toBeTruthy();
    expect(screen.getByText("No notes link to this note yet.")).toBeTruthy();

    rerender(
      <LinkedNotesContent
        links={links({ status: "error", retry })}
        onPreview={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("keeps old rows visible when refresh or load-more fails", () => {
    const loadMore = vi.fn().mockResolvedValue(undefined);
    render(
      <LinkedNotesContent
        links={links({
          refreshError: true,
          loadMoreError: "incoming",
          incomingNextCursor: "cursor",
          loadMore,
        })}
        onPreview={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getAllByText("Linked title")).toHaveLength(2);
    expect(screen.getByText("Could not refresh.")).toBeTruthy();
    const panel = screen.getByRole("tabpanel");
    fireEvent.click(within(panel).getByRole("button", { name: "Retry" }));
    expect(loadMore).toHaveBeenCalledWith("incoming");
  });
});

describe("LinkedNotesOverlay", () => {
  it("renders only the desktop non-modal popover and restores trigger focus", () => {
    installMatchMedia(true);
    const controller = links();
    const p = {
      documentLinks: controller,
      contextRail: { collapsed: false, isDocked: true, view: "outline" },
      preview: { handleOpenPreview: vi.fn() },
      navigate: vi.fn(),
    } as unknown as EditorShellFlatContract;
    render(
      <>
        <button ref={controller.triggerRef} type="button">
          Trigger
        </button>
        <LinkedNotesOverlay p={p} />
      </>,
    );
    const dialog = screen.getByRole("dialog", { name: "Linked notes" });
    expect(dialog.getAttribute("aria-modal")).toBe("false");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(controller.closePanel).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(controller.triggerRef.current);
  });

  it("renders only the mobile modal drawer", () => {
    installMatchMedia(false);
    const controller = links();
    const p = {
      documentLinks: controller,
      preview: { handleOpenPreview: vi.fn() },
      navigate: vi.fn(),
    } as unknown as EditorShellFlatContract;
    render(<LinkedNotesOverlay p={p} />);
    const dialog = screen.getByRole("dialog", { name: "Linked notes" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });
});
