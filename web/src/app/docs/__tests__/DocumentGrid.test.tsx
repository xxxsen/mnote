import { createRef } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DocumentGrid, type DocumentGridProps } from "../components/DocumentGrid";
import type { DocumentWithTags } from "../types";

afterEach(cleanup);

const note = (id: string, title: string): DocumentWithTags => ({
  id,
  user_id: "user",
  title,
  content: "body",
  state: 1,
  pinned: 0,
  starred: 0,
  ctime: 1,
  mtime: 1,
  content_hash: "hash",
  content_mtime: 1,
  content_revision: 1,
});

const makeProps = (
  overrides: Partial<DocumentGridProps> = {},
): DocumentGridProps => ({
  docs: [note("keyword", "Keyword result")],
  semanticSearchDocs: [],
  semanticSearching: false,
  semanticSearchStatus: "idle",
  loading: false,
  loadingMore: false,
  initialError: false,
  loadMoreError: false,
  hasMore: false,
  search: "query",
  selectedTag: "",
  showStarred: false,
  showShared: false,
  tagIndex: {},
  pendingActions: new Set<string>(),
  loadMoreRef: createRef<HTMLDivElement>(),
  onCreate: vi.fn(),
  onClearSearch: vi.fn(),
  onClearFilter: vi.fn(),
  onRetryInitial: vi.fn(),
  onRetryLoadMore: vi.fn(),
  onPinToggle: vi.fn(),
  onStarToggle: vi.fn(),
  onCopyShare: vi.fn(),
  ...overrides,
});

describe("DocumentGrid semantic states", () => {
  it("keeps keyword results visible when semantic search is unavailable", () => {
    render(<DocumentGrid {...makeProps({ semanticSearchStatus: "unavailable" })} />);

    expect(screen.getByText("Semantic search is unavailable. Keyword results remain available.")).toBeTruthy();
    expect(screen.getByText("Keyword result")).toBeTruthy();
  });

  it("distinguishes an empty semantic result from an unavailable request", () => {
    render(<DocumentGrid {...makeProps({ semanticSearchStatus: "ready" })} />);

    expect(screen.getByText("No semantic matches. Keyword results are shown below.")).toBeTruthy();
    expect(screen.queryByText(/Semantic search is unavailable/)).toBeNull();
  });

  it("clamps relevance and displays the indexed match excerpt", () => {
    const semantic = note("semantic", "Semantic result");
    semantic.score = 1.5;
    semantic.matched_excerpt = "Indexed matching passage";
    semantic.match_type = "text";
    render(<DocumentGrid {...makeProps({
      semanticSearchDocs: [semantic],
      semanticSearchStatus: "ready",
    })} />);

    expect(screen.getByText("Relevance 100 · text")).toBeTruthy();
    expect(screen.getByText("Indexed matching passage")).toBeTruthy();
  });
});
