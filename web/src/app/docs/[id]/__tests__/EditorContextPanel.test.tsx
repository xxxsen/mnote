import { useMemo } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { OutlineEntry } from "@/components/markdown-preview/types";
import type { EditorShellFlatContract } from "../editor-contracts";
import {
  EditorContextDrawer,
  EditorContextRail,
} from "../components/EditorContextPanel";
import { useEditorContextRail } from "../hooks/useEditorContextRail";

function installMatchMedia(matches: boolean) {
  const media = {
    matches,
    media: "",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => media),
  );
}

const outline: OutlineEntry[] = [
  { level: 1, text: "Intro", id: "intro", sourceLine: 1 },
  { level: 4, text: "Deep section", id: "deep-section", sourceLine: 12 },
];

type HarnessProps = {
  docked: boolean;
  docId?: string;
  mode?: "edit" | "split" | "preview";
  scrollEditor?: ReturnType<typeof vi.fn>;
  scrollPreview?: ReturnType<typeof vi.fn>;
  listVersions?: ReturnType<typeof vi.fn>;
  loadShare?: ReturnType<typeof vi.fn>;
};

function ContextHarness({
  docked,
  docId = "doc-a",
  mode = "edit",
  scrollEditor = vi.fn(),
  scrollPreview = vi.fn(),
  listVersions = vi.fn().mockResolvedValue([]),
  loadShare = vi.fn(),
}: HarnessProps) {
  const contextRail = useEditorContextRail(docId);
  const documentActions = useMemo(() => ({ listVersions }), [listVersions]);
  const p = {
    contextRail,
    outline,
    viewMode: mode,
    scrollSync: {
      activeTocId: "intro",
      scrollEditorToSourceLine: scrollEditor,
      scrollPreviewToHeading: scrollPreview,
    },
    navigate: vi.fn(),
    contentRef: { current: "# Intro" },
    setShowDeleteConfirm: vi.fn(),
    handleExportMarkdown: vi.fn(),
    handleExportConfluenceHTML: vi.fn().mockResolvedValue(undefined),
    documentActions,
    handleRevert: vi.fn(),
    share: {
      shareUrl: "",
      activeShare: null,
      copied: false,
      handleShare: vi.fn(),
      loadShare,
      handleRevokeShare: vi.fn(),
      handleCopyLink: vi.fn(),
      updateShareConfig: vi.fn().mockResolvedValue(undefined),
    },
    toast: vi.fn(),
  } as unknown as EditorShellFlatContract;

  return (
    <>
      <button type="button" onClick={contextRail.openOutline}>
        Open outline
      </button>
      <button type="button" onClick={() => contextRail.openDetails()}>
        Open details
      </button>
      {docked ? <EditorContextRail p={p} /> : <EditorContextDrawer p={p} />}
    </>
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  document.body.style.overflow = "";
});

describe("EditorContextPanel", () => {
  it("gives the expanded default rail entirely to Outline", () => {
    installMatchMedia(true);
    render(<ContextHarness docked />);

    const rail = screen.getByRole("complementary", {
      name: "Document context",
    });
    expect(rail.className).toContain("w-[304px]");
    expect(rail.className).toContain("shrink-0");
    expect(rail.className).not.toContain("fixed");
    expect(within(rail).getByText("Outline")).toBeTruthy();
    expect(
      within(rail).getByRole("navigation", { name: "Note outline" }),
    ).toBeTruthy();
    expect(within(rail).queryByRole("tab", { name: "Summary" })).toBeNull();
    expect(within(rail).queryByRole("tab", { name: "Mentions" })).toBeNull();
    expect(within(rail).queryByRole("tab", { name: "Graph" })).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Intro" })
        .getAttribute("aria-current"),
    ).toBe("location");
    expect(
      screen.getByRole("button", { name: "Deep section" }).style.paddingLeft,
    ).toBe("44px");
  });

  it("moves focus from a collapsed Details shortcut to History", async () => {
    localStorage.setItem("mnote:editor-context-rail:collapsed:v1", "1");
    installMatchMedia(true);
    render(<ContextHarness docked />);

    fireEvent.click(
      screen.getByRole("button", { name: "Open document details" }),
    );

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("tab", { name: "History" }),
      ),
    );
  });

  it("routes Outline navigation to the editor or preview by effective view mode", () => {
    installMatchMedia(true);
    const scrollEditor = vi.fn();
    const scrollPreview = vi.fn();
    const view = render(
      <ContextHarness
        docked
        mode="edit"
        scrollEditor={scrollEditor}
        scrollPreview={scrollPreview}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Deep section" }));
    expect(scrollEditor).toHaveBeenCalledWith(12, "deep-section");
    expect(scrollPreview).not.toHaveBeenCalled();

    view.rerender(
      <ContextHarness
        docked
        mode="preview"
        scrollEditor={scrollEditor}
        scrollPreview={scrollPreview}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Deep section" }));
    expect(scrollPreview).toHaveBeenCalledWith("deep-section");
  });

  it("switches the same rail between Outline and the original Details menu", () => {
    installMatchMedia(true);
    render(<ContextHarness docked />);

    fireEvent.click(screen.getByRole("button", { name: "Open details" }));
    expect(screen.getByText("Document details")).toBeTruthy();
    for (const tabName of ["History", "Share"]) {
      expect(screen.getByRole("tab", { name: tabName })).toBeTruthy();
    }
    expect(
      screen.queryByRole("navigation", { name: "Note outline" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open outline" }));
    expect(
      screen.getByRole("navigation", { name: "Note outline" }),
    ).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "History" })).toBeNull();
  });

  it("preserves Details tabs and loaded data while Outline is visible", async () => {
    installMatchMedia(true);
    const listVersions = vi.fn().mockResolvedValue([]);
    const loadShare = vi.fn();
    render(
      <ContextHarness
        docked
        listVersions={listVersions}
        loadShare={loadShare}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open details" }));
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    await waitFor(() => expect(listVersions).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Open outline" }));
    fireEvent.click(screen.getByRole("button", { name: "Open details" }));
    expect(
      screen.getByRole("tab", { name: "History" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(listVersions).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("tab", { name: "Share" }));
    await waitFor(() => expect(loadShare).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Open outline" }));
    fireEvent.click(screen.getByRole("button", { name: "Open details" }));
    expect(
      screen.getByRole("tab", { name: "Share" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(loadShare).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    await waitFor(() => expect(listVersions).toHaveBeenCalledTimes(2));
  });

  it("resets Details to History after a document switch", async () => {
    installMatchMedia(true);
    const listVersionsA = vi.fn().mockResolvedValue([]);
    const listVersionsB = vi.fn().mockResolvedValue([]);
    const view = render(
      <ContextHarness docked docId="doc-a" listVersions={listVersionsA} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open details" }));
    await waitFor(() => expect(listVersionsA).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("tab", { name: "Share" }));

    view.rerender(
      <ContextHarness docked docId="doc-b" listVersions={listVersionsB} />,
    );
    expect(
      screen.getByRole("navigation", { name: "Note outline" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open details" }));
    expect(
      screen.getByRole("tab", { name: "History" }).getAttribute("aria-selected"),
    ).toBe("true");
    await waitFor(() => expect(listVersionsB).toHaveBeenCalledTimes(1));
  });

  it("uses the compact Outline drawer below 1280 and closes after navigation", async () => {
    installMatchMedia(false);
    const scrollEditor = vi.fn();
    render(<ContextHarness docked={false} scrollEditor={scrollEditor} />);

    const trigger = screen.getByRole("button", { name: "Open outline" });
    trigger.focus();
    fireEvent.click(trigger);
    const drawer = screen.getByRole("dialog", { name: "Outline" });
    expect(drawer.className).toContain("lg:max-w-96");

    fireEvent.click(screen.getByRole("button", { name: "Deep section" }));
    expect(scrollEditor).toHaveBeenCalledWith(12, "deep-section");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Outline" })).toBeNull(),
    );
    expect(document.activeElement).toBe(trigger);
  });
});
