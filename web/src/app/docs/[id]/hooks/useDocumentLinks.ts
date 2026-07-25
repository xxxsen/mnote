"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  docEditorService,
  type DocumentLinksQuery,
} from "../services/doc-editor.service";
import type {
  DocumentLinkCounts,
  DocumentLinkDirection,
  DocumentLinkPage,
  DocumentLinksResponse,
  LinkedDocument,
} from "../types";
import { extractLinkedDocIDs } from "../utils";

const DOCUMENT_LINKS_CACHE_TTL_MS = 60_000;

type DocumentLinksStatus = "idle" | "loading" | "ready" | "error";

type DocumentLinksState = {
  scopeKey: string;
  open: boolean;
  activeTab: DocumentLinkDirection;
  status: DocumentLinksStatus;
  refreshing: boolean;
  refreshError: boolean;
  counts: DocumentLinkCounts | null;
  incoming: LinkedDocument[];
  outgoing: LinkedDocument[];
  incomingNextCursor: string;
  outgoingNextCursor: string;
  loadingMore: DocumentLinkDirection | null;
  loadMoreError: DocumentLinkDirection | null;
};

type CacheMeta = {
  scopeKey: string;
  loadedAt: number;
  stale: boolean;
};

type ActiveRequest = {
  id: number;
  controller: AbortController;
};

type MutableValue<T> = { current: T };
type UpdateDocumentLinksState = (
  updater: (previous: DocumentLinksState) => DocumentLinksState,
) => void;

export type UseDocumentLinksOptions = {
  docId: string;
  previewContent: string;
  savedContent: string;
  serverRevision: number;
};

function createInitialState(scopeKey: string): DocumentLinksState {
  return {
    scopeKey,
    open: false,
    activeTab: "incoming",
    status: "idle",
    refreshing: false,
    refreshError: false,
    counts: null,
    incoming: [],
    outgoing: [],
    incomingNextCursor: "",
    outgoingNextCursor: "",
    loadingMore: null,
    loadMoreError: null,
  };
}

function createCacheMeta(scopeKey: string): CacheMeta {
  return { scopeKey, loadedAt: 0, stale: false };
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function abortRequest(requestRef: MutableValue<ActiveRequest | null>): void {
  const request = requestRef.current;
  if (request) request.controller.abort();
  requestRef.current = null;
}

function startRequest(
  requestRef: MutableValue<ActiveRequest | null>,
  requestIDRef: MutableValue<number>,
): ActiveRequest {
  abortRequest(requestRef);
  const request = {
    id: ++requestIDRef.current,
    controller: new AbortController(),
  };
  requestRef.current = request;
  return request;
}

function isCurrentRequest(
  requestRef: MutableValue<ActiveRequest | null>,
  request: ActiveRequest,
  stateRef: MutableValue<DocumentLinksState>,
  docId: string,
): boolean {
  const active = requestRef.current;
  if (active === null || active.id !== request.id) return false;
  if (request.controller.signal.aborted) return false;
  return stateRef.current.scopeKey === docId;
}

function clearCurrentRequest(
  requestRef: MutableValue<ActiveRequest | null>,
  request: ActiveRequest,
): void {
  const active = requestRef.current;
  if (active !== null && active.id === request.id) {
    requestRef.current = null;
  }
}

function appendUniqueDocuments(
  current: LinkedDocument[],
  incoming: LinkedDocument[],
): LinkedDocument[] {
  const seen = new Set(current.map((document) => document.id));
  return [
    ...current,
    ...incoming.filter((document) => {
      if (seen.has(document.id)) return false;
      seen.add(document.id);
      return true;
    }),
  ];
}

function refreshStartedState(
  previous: DocumentLinksState,
  hasData: boolean,
): DocumentLinksState {
  return {
    ...previous,
    status: hasData ? "ready" : "loading",
    refreshing: hasData,
    refreshError: false,
    loadingMore: null,
    loadMoreError: null,
  };
}

function refreshSucceededState(
  previous: DocumentLinksState,
  result: DocumentLinksResponse,
  incoming: DocumentLinkPage,
  outgoing: DocumentLinkPage,
): DocumentLinksState {
  return {
    ...previous,
    status: "ready",
    refreshing: false,
    refreshError: false,
    counts: result.counts,
    incoming: incoming.items,
    outgoing: outgoing.items,
    incomingNextCursor: incoming.next_cursor,
    outgoingNextCursor: outgoing.next_cursor,
    loadingMore: null,
    loadMoreError: null,
  };
}

function refreshFailedState(
  previous: DocumentLinksState,
  hasData: boolean,
): DocumentLinksState {
  if (hasData) {
    return {
      ...previous,
      status: "ready",
      refreshing: false,
      refreshError: true,
    };
  }
  return {
    ...previous,
    status: "error",
    refreshing: false,
    refreshError: false,
    counts: null,
  };
}

function loadMoreQuery(
  direction: DocumentLinkDirection,
  cursor: string,
): DocumentLinksQuery {
  return {
    include: [direction],
    limit: 20,
    ...(direction === "incoming"
      ? { incomingCursor: cursor }
      : { outgoingCursor: cursor }),
  };
}

function loadMoreSucceededState(
  previous: DocumentLinksState,
  direction: DocumentLinkDirection,
  page: DocumentLinkPage,
  counts: DocumentLinkCounts,
): DocumentLinksState {
  const common = {
    ...previous,
    counts,
    loadingMore: null,
    loadMoreError: null,
  };
  if (direction === "incoming") {
    return {
      ...common,
      incoming: appendUniqueDocuments(previous.incoming, page.items),
      incomingNextCursor: page.next_cursor,
    };
  }
  return {
    ...common,
    outgoing: appendUniqueDocuments(previous.outgoing, page.items),
    outgoingNextCursor: page.next_cursor,
  };
}

function currentCursor(
  state: DocumentLinksState,
  direction: DocumentLinkDirection,
): string {
  return direction === "incoming"
    ? state.incomingNextCursor
    : state.outgoingNextCursor;
}

function canLoadMore(state: DocumentLinksState, cursor: string): boolean {
  if (cursor === "" || state.status !== "ready") return false;
  return !state.refreshing && state.loadingMore === null;
}

function useDocumentLinkRequests(options: {
  docId: string;
  stateRef: MutableValue<DocumentLinksState>;
  cacheMetaRef: MutableValue<CacheMeta>;
  update: UpdateDocumentLinksState;
}) {
  const { docId, stateRef, cacheMetaRef, update } = options;
  const refreshRequestRef = useRef<ActiveRequest | null>(null);
  const loadMoreRequestRef = useRef<ActiveRequest | null>(null);
  const requestIDRef = useRef(0);

  const refresh = useCallback(async () => {
    const hasData = stateRef.current.counts !== null;
    abortRequest(loadMoreRequestRef);
    const request = startRequest(refreshRequestRef, requestIDRef);
    update((previous) => refreshStartedState(previous, hasData));
    try {
      const result = await docEditorService.getDocumentLinks(
        docId,
        { include: ["incoming", "outgoing"], limit: 20 },
        request.controller.signal,
      );
      if (!isCurrentRequest(refreshRequestRef, request, stateRef, docId)) {
        return;
      }
      const { incoming, outgoing } = result;
      if (!incoming || !outgoing) {
        throw new Error("Document link response is missing an included page");
      }
      update((previous) =>
        refreshSucceededState(previous, result, incoming, outgoing),
      );
      cacheMetaRef.current = {
        scopeKey: docId,
        loadedAt: Date.now(),
        stale: false,
      };
    } catch (error) {
      if (
        isAbortError(error) ||
        !isCurrentRequest(refreshRequestRef, request, stateRef, docId)
      ) {
        return;
      }
      update((previous) => refreshFailedState(previous, hasData));
    } finally {
      clearCurrentRequest(refreshRequestRef, request);
    }
  }, [cacheMetaRef, docId, stateRef, update]);

  const loadMore = useCallback(
    async (direction: DocumentLinkDirection) => {
      const cursor = currentCursor(stateRef.current, direction);
      if (!canLoadMore(stateRef.current, cursor)) return;
      const request = startRequest(loadMoreRequestRef, requestIDRef);
      update((previous) => ({
        ...previous,
        loadingMore: direction,
        loadMoreError: null,
      }));
      try {
        const result = await docEditorService.getDocumentLinks(
          docId,
          loadMoreQuery(direction, cursor),
          request.controller.signal,
        );
        if (!isCurrentRequest(loadMoreRequestRef, request, stateRef, docId)) {
          return;
        }
        const page =
          direction === "incoming" ? result.incoming : result.outgoing;
        if (!page) {
          throw new Error(`Document link response is missing ${direction}`);
        }
        update((previous) =>
          loadMoreSucceededState(
            previous,
            direction,
            page,
            result.counts,
          ),
        );
      } catch (error) {
        if (
          isAbortError(error) ||
          !isCurrentRequest(loadMoreRequestRef, request, stateRef, docId)
        ) {
          return;
        }
        update((previous) => ({
          ...previous,
          loadingMore: null,
          loadMoreError: direction,
        }));
      } finally {
        clearCurrentRequest(loadMoreRequestRef, request);
      }
    },
    [docId, stateRef, update],
  );

  const abortAll = useCallback(() => {
    abortRequest(refreshRequestRef);
    abortRequest(loadMoreRequestRef);
  }, []);

  return { refresh, loadMore, abortAll };
}

function useDocumentLinksLifecycle(options: {
  docId: string;
  serverRevision: number;
  stateRef: MutableValue<DocumentLinksState>;
  cacheMetaRef: MutableValue<CacheMeta>;
  abortAll: () => void;
  refresh: () => Promise<void>;
}) {
  const {
    docId,
    serverRevision,
    stateRef,
    cacheMetaRef,
    abortAll,
    refresh,
  } = options;
  const revisionRef = useRef({ scopeKey: docId, revision: serverRevision });

  useEffect(() => {
    abortAll();
    cacheMetaRef.current = createCacheMeta(docId);
  }, [abortAll, cacheMetaRef, docId]);

  useEffect(() => {
    const previous = revisionRef.current;
    revisionRef.current = { scopeKey: docId, revision: serverRevision };
    if (previous.scopeKey !== docId) return;
    if (previous.revision === serverRevision) return;
    cacheMetaRef.current.stale = true;
    if (stateRef.current.open) {
      void refresh();
    }
  }, [
    cacheMetaRef,
    docId,
    refresh,
    serverRevision,
    stateRef,
  ]);

  useEffect(() => abortAll, [abortAll]);
}

export function linkedDocumentIDSetsEqual(
  first: readonly string[],
  second: readonly string[],
): boolean {
  const firstSet = new Set(first);
  const secondSet = new Set(second);
  if (firstSet.size !== secondSet.size) return false;
  return Array.from(firstSet).every((id) => secondSet.has(id));
}

export function useDocumentLinks(options: UseDocumentLinksOptions) {
  const { docId, previewContent, savedContent, serverRevision } = options;
  const [storedState, setStoredState] = useState<DocumentLinksState>(() =>
    createInitialState(docId),
  );
  const current =
    storedState.scopeKey === docId
      ? storedState
      : createInitialState(docId);
  const stateRef = useRef(current);
  useEffect(() => {
    stateRef.current = current;
  }, [current]);
  const cacheMetaRef = useRef<CacheMeta>(createCacheMeta(docId));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);

  const update = useCallback<UpdateDocumentLinksState>(
    (updater) => {
      setStoredState((stored) =>
        updater(
          stored.scopeKey === docId ? stored : createInitialState(docId),
        ),
      );
    },
    [docId],
  );
  const ensureCacheMeta = useCallback(() => {
    if (cacheMetaRef.current.scopeKey !== docId) {
      cacheMetaRef.current = createCacheMeta(docId);
    }
    return cacheMetaRef.current;
  }, [docId]);
  const { refresh, loadMore, abortAll } = useDocumentLinkRequests({
    docId,
    stateRef,
    cacheMetaRef,
    update,
  });
  useDocumentLinksLifecycle({
    docId,
    serverRevision,
    stateRef,
    cacheMetaRef,
    abortAll,
    refresh,
  });

  const openPanel = useCallback(() => {
    update((previous) => ({ ...previous, open: true }));
    const meta = ensureCacheMeta();
    const state = stateRef.current;
    if (state.status === "loading" || state.refreshing) return;
    const expired =
      meta.loadedAt === 0 ||
      meta.stale ||
      Date.now() - meta.loadedAt > DOCUMENT_LINKS_CACHE_TTL_MS;
    if (expired) void refresh();
  }, [ensureCacheMeta, refresh, update]);
  const closePanel = useCallback(() => {
    update((previous) => ({ ...previous, open: false }));
  }, [update]);
  const setActiveTab = useCallback(
    (activeTab: DocumentLinkDirection) => {
      update((previous) => ({ ...previous, activeTab }));
    },
    [update],
  );
  const retry = useCallback(async () => {
    ensureCacheMeta().stale = true;
    await refresh();
  }, [ensureCacheMeta, refresh]);
  const setTriggerElement = useCallback(
    (element: HTMLButtonElement | null) => {
      triggerRef.current = element;
    },
    [],
  );
  const setMobileTriggerElement = useCallback(
    (element: HTMLButtonElement | null) => {
      mobileTriggerRef.current = element;
    },
    [],
  );
  const hasDraftLinkChanges = useMemo(
    () =>
      !linkedDocumentIDSetsEqual(
        extractLinkedDocIDs(previewContent, docId),
        extractLinkedDocIDs(savedContent, docId),
      ),
    [docId, previewContent, savedContent],
  );

  return {
    ...current,
    triggerRef,
    mobileTriggerRef,
    loaded: current.counts !== null,
    hasDraftLinkChanges,
    openPanel,
    closePanel,
    setActiveTab,
    retry,
    loadMore,
    setTriggerElement,
    setMobileTriggerElement,
  };
}

export type DocumentLinksController = ReturnType<typeof useDocumentLinks>;
