import { useState, useCallback, useEffect, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import type { Document as MnoteDocument } from "@/types";
import { extractLinkedDocIDs } from "../utils";

export function useLinkGraph(opts: {
  docId: string;
  title: string;
  previewContent: string;
}) {
  const { docId, title, previewContent } = opts;

  const [backlinks, setBacklinks] = useState<MnoteDocument[]>([]);
  const [outboundLinks, setOutboundLinks] = useState<MnoteDocument[]>([]);

  const loadBacklinks = useCallback(async () => {
    setBacklinks([]);
    try {
      const data = await apiFetch<MnoteDocument[]>(`/documents/${docId}/backlinks`);
      setBacklinks(data);
    } catch {
      setBacklinks([]);
    }
  }, [docId]);

  // TODO: replace N+1 per-doc fetches with batch API (e.g. POST /documents/batch) to reduce request volume
  const loadOutboundLinks = useCallback(async (value: string) => {
    const linkIDs = extractLinkedDocIDs(value, docId);
    if (linkIDs.length === 0) { setOutboundLinks([]); return; }
    try {
      const settled = await Promise.all(
        linkIDs.slice(0, 24).map(async (did) => {
          try {
            const detail = await apiFetch<{ document: MnoteDocument }>(`/documents/${did}`);
            return detail.document;
          } catch { return null; }
        })
      );
      setOutboundLinks(settled.filter((d): d is MnoteDocument => d !== null));
    } catch { setOutboundLinks([]); } /* v8 ignore -- defensive: inner catch already handles per-doc errors */
  }, [docId]);

  useEffect(() => {
    void loadBacklinks(); // eslint-disable-line react-hooks/set-state-in-effect -- triggers async data fetch on dependency change
  }, [loadBacklinks]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadOutboundLinks(previewContent); }, 220);
    return () => window.clearTimeout(timer);
  }, [loadOutboundLinks, previewContent]);

  useEffect(() => {
    setOutboundLinks([]); // eslint-disable-line react-hooks/set-state-in-effect -- reset on route change
  }, [docId]);

  const linkGraph = useMemo(() => {
    const incomingMap = new Map(backlinks.map((doc) => [doc.id, doc]));
    const outgoingMap = new Map(outboundLinks.map((doc) => [doc.id, doc]));
    const bothIDs = Array.from(incomingMap.keys()).filter((did) => outgoingMap.has(did));
    const incomingOnly = Array.from(incomingMap.values()).filter((doc) => !outgoingMap.has(doc.id));
    const outgoingOnly = Array.from(outgoingMap.values()).filter((doc) => !incomingMap.has(doc.id));

    const nodes: Array<{ id: string; title: string; x: number; y: number; kind: "current" | "incoming" | "outgoing" | "both" }> = [
      { id: docId, title: title || "Untitled", x: 50, y: 50, kind: "current" },
    ];
    const edges: Array<{ from: string; to: string }> = [];
    const positionByID: Record<string, { x: number; y: number }> = { [docId]: { x: 50, y: 50 } };

    const spread = (docs: MnoteDocument[], x: number, kind: "incoming" | "outgoing", yMin = 14, yMax = 86) => {
      if (docs.length === 0) return;
      const step = docs.length === 1 ? 0 : (yMax - yMin) / (docs.length - 1);
      docs.forEach((doc, index) => {
        const y = docs.length === 1 ? 50 : yMin + step * index;
        nodes.push({ id: doc.id, title: doc.title || "Untitled", x, y, kind });
        positionByID[doc.id] = { x, y };
      });
    };
    spread(incomingOnly, 14, "incoming");
    spread(outgoingOnly, 86, "outgoing");

    const bothDocs: MnoteDocument[] = bothIDs.reduce<MnoteDocument[]>((acc, did) => {
      const doc = incomingMap.get(did) || outgoingMap.get(did);
      if (doc) acc.push(doc);
      return acc;
    }, []);
    const spreadBoth = (docs: MnoteDocument[], y: number) => {
      if (docs.length === 0) return;
      const xMin = 34; const xMax = 66;
      const step = docs.length === 1 ? 0 : (xMax - xMin) / (docs.length - 1);
      docs.forEach((doc, index) => {
        const x = docs.length === 1 ? 50 : xMin + step * index;
        nodes.push({ id: doc.id, title: doc.title || "Untitled", x, y, kind: "both" });
        positionByID[doc.id] = { x, y };
      });
    };
    spreadBoth(bothDocs.filter((_, i) => i % 2 === 0), 26);
    spreadBoth(bothDocs.filter((_, i) => i % 2 === 1), 74);

    incomingOnly.forEach((doc) => edges.push({ from: doc.id, to: docId }));
    outgoingOnly.forEach((doc) => edges.push({ from: docId, to: doc.id }));
    bothIDs.forEach((did) => { edges.push({ from: did, to: docId }); edges.push({ from: docId, to: did }); });

    return { nodes, edges, positionByID };
  }, [backlinks, docId, outboundLinks, title]);

  return { backlinks, outboundLinks, linkGraph };
}
