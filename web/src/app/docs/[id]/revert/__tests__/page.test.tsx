import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Document, DocumentVersion } from "@/types";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  push: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: mocks.apiFetch,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "d1" }),
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams("version=2"),
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

import RevertPage from "../page";

const currentDocument: Document = {
  id: "d1",
  user_id: "u1",
  title: "Current",
  content: "# Current",
  summary: "",
  state: 1,
  pinned: 0,
  starred: 0,
  ctime: 100,
  mtime: 200,
  content_hash: "hash-7",
  content_mtime: 200,
  content_revision: 7,
};

const selectedVersion: DocumentVersion = {
  id: "v2",
  document_id: "d1",
  version: 2,
  title: "Historical",
  content: "# Historical",
  ctime: 120,
};

function arrangeSaveResult(accepted: boolean) {
  mocks.apiFetch.mockImplementation((endpoint: string, options?: RequestInit) => {
    if (endpoint === "/documents/d1" && options?.method === "PUT") {
      return Promise.resolve({
        id: "d1",
        accepted,
        reason: accepted ? "" : "revision_conflict",
        version: accepted ? 8 : 9,
        content_revision: accepted ? 8 : 9,
        content_hash: accepted ? "hash-8" : "hash-9",
        content_mtime: 300,
        mtime: 300,
      });
    }
    if (endpoint === "/documents/d1") {
      return Promise.resolve({ document: currentDocument });
    }
    if (endpoint === "/documents/d1/versions/2") {
      return Promise.resolve(selectedVersion);
    }
    return Promise.reject(new Error(`unexpected endpoint: ${endpoint}`));
  });
}

beforeEach(() => {
  mocks.apiFetch.mockReset();
  mocks.push.mockReset();
  mocks.toast.mockReset();
});

afterEach(cleanup);

describe("document version restore", () => {
  it("sends the compared document revision as the restore precondition", async () => {
    arrangeSaveResult(true);
    render(<RevertPage />);

    const [restore] = await screen.findAllByRole("button", { name: "Restore v2" });
    fireEvent.click(restore);

    await waitFor(() => {
      expect(mocks.apiFetch).toHaveBeenCalledWith("/documents/d1", {
        method: "PUT",
        body: JSON.stringify({
          title: "Historical",
          content: "# Historical",
          base_revision: 7,
          save_seq: 8,
        }),
      });
    });
    expect(mocks.push).toHaveBeenCalledWith("/docs/d1");
  });

  it("does not navigate after a conflict and reloads the comparison", async () => {
    arrangeSaveResult(false);
    render(<RevertPage />);

    const [restore] = await screen.findAllByRole("button", { name: "Restore v2" });
    fireEvent.click(restore);

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1));
    expect(mocks.push).not.toHaveBeenCalled();
    await waitFor(() => {
      const currentReads = mocks.apiFetch.mock.calls.filter(
        ([endpoint, options]) => endpoint === "/documents/d1" && !options?.method,
      );
      expect(currentReads).toHaveLength(2);
    });
  });
});
