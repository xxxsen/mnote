import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useSharePage: vi.fn(),
}));

let sharePageState: Record<string, unknown>;

vi.mock("../hooks/useSharePage", () => ({
  useSharePage: mocks.useSharePage,
}));

vi.mock("../components/ShareHeader", () => ({
  ShareHeader: () => (
    <header>
      <h1 id="share-title">Shared note</h1>
    </header>
  ),
}));

vi.mock("../components/SharedContent", () => ({
  default: () => <article>Shared content</article>,
}));

import SharePage from "../page";

beforeEach(() => {
  sharePageState = {
    accessPassword: "",
    annotationContent: "",
    annotationError: "",
    annotationSubmitting: false,
    canAnnotate: false,
    comments: [],
    commentsAppending: false,
    commentsError: "",
    commentsHasMore: false,
    commentsLoading: false,
    commentsTotal: 0,
    detail: {
      allow_download: 1,
      author: "Author",
      document: {
        content: "Shared content",
        content_hash: "hash",
        content_mtime: 1,
        content_revision: 1,
        ctime: 1,
        id: "document-1",
        mtime: 1,
        pinned: 0,
        starred: 0,
        state: 1,
        title: "Shared note",
        user_id: "user-1",
      },
      expires_at: 0,
      permission: 1,
      tags: [],
    },
    doc: {
      content: "Shared content",
      id: "document-1",
    },
    error: false,
    guestAuthor: "Guest #TEST",
    handleCopyLink: vi.fn(),
    handleExport: vi.fn(),
    handleLoadMoreComments: vi.fn(),
    handleSubmitComment: vi.fn(),
    handleTocLoaded: vi.fn(),
    inlineReplyContent: "",
    loading: false,
    notify: vi.fn(),
    passwordRequired: false,
    permissionHint: "Read access only",
    permissionLabel: "Read",
    previewRef: { current: null },
    replyingTo: null,
    retryComments: vi.fn(),
    retryShare: vi.fn(),
    scrollProgress: 0,
    scrollToElement: vi.fn(),
    setAnnotationContent: vi.fn(),
    setInlineReplyContent: vi.fn(),
    setReplyingTo: vi.fn(),
    setShowMobileToc: vi.fn(),
    setTocCollapsed: vi.fn(),
    showFloatingToc: false,
    showMobileToc: false,
    showScrollTop: false,
    slugify: vi.fn((value: string) => value),
    tocCollapsed: false,
    tocContent: "",
    token: "share-token",
    getElementById: vi.fn(),
  };
  mocks.useSharePage.mockReturnValue(sharePageState);
});

afterEach(cleanup);

describe("SharePage", () => {
  it("keeps the reading column horizontally centered at wide breakpoints", () => {
    render(<SharePage />);

    const readingColumn = screen.getByRole("main").firstElementChild;
    expect(readingColumn).not.toBeNull();
    expect(readingColumn?.classList.contains("mx-auto")).toBe(true);
    expect(readingColumn?.classList.contains("xl:ml-0")).toBe(false);
  });

  it("keeps the floating table of contents from covering the centered column", () => {
    mocks.useSharePage.mockReturnValue({
      ...sharePageState,
      showFloatingToc: true,
      tocContent: "- [Heading](#heading)",
    });

    render(<SharePage />);

    const floatingToc = screen.getByRole("complementary", { name: "Table of contents" });
    expect(floatingToc.classList.contains("2xl:block")).toBe(true);
    expect(floatingToc.classList.contains("xl:block")).toBe(false);

    const tocButton = screen.getByRole("button", { name: "Open table of contents" });
    expect(tocButton.classList.contains("2xl:hidden")).toBe(true);
    expect(tocButton.classList.contains("xl:hidden")).toBe(false);
  });
});
