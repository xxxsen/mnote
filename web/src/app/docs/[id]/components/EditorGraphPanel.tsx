import { Network } from "lucide-react";

import type { Document as MnoteDocument } from "@/types";
import type { EditorLinkGraphContract } from "../editor-contracts";

export function EditorGraphPanel(props: {
  linkGraph: EditorLinkGraphContract["linkGraph"];
  backlinks: MnoteDocument[];
  outboundLinks: MnoteDocument[];
  onNavigate: (path: string) => void;
}) {
  const { linkGraph } = props;
  if (linkGraph.nodes.length <= 1 && linkGraph.edges.length === 0) {
    return (
      <div className="flex h-full min-h-40 items-center justify-center p-6 text-center text-xs leading-relaxed text-muted-foreground">
        Add links to other notes to see document relationships here.
      </div>
    );
  }
  return (
    <div className="custom-scrollbar h-full overflow-y-auto p-3">
      <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Network className="h-3 w-3" aria-hidden="true" />
        Link graph
      </div>
      <div className="relative min-h-[280px] overflow-hidden rounded-xl border border-border bg-muted/40">
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {linkGraph.edges.map((edge, index) => {
            const from = linkGraph.positionByID[edge.from];
            const to = linkGraph.positionByID[edge.to];
            if (!from || !to) return null;
            return (
              <line
                key={`${edge.from}-${edge.to}-${index}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="rgba(100,116,139,0.45)"
                strokeWidth="0.7"
              />
            );
          })}
        </svg>
        {linkGraph.nodes.map((node) =>
          node.kind === "current" ? (
            <div
              key={node.id}
              className="absolute z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary bg-primary shadow-sm"
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
              title={`Current: ${node.title}`}
            />
          ) : (
            <button
              key={node.id}
              type="button"
              onClick={() => props.onNavigate(`/docs/${node.id}`)}
              className={`absolute z-10 w-[72px] -translate-x-1/2 -translate-y-1/2 truncate rounded-lg border px-1.5 py-1 text-center text-xs font-medium leading-tight shadow-sm ${
                node.kind === "incoming"
                  ? "border-success/30 bg-success/10 text-success"
                  : node.kind === "outgoing"
                    ? "border-warning/30 bg-warning/10 text-warning"
                    : "border-info/30 bg-info/10 text-info"
              }`}
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
              title={node.title}
            >
              {node.title}
            </button>
          ),
        )}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>Inbound: {props.backlinks.length}</span>
        <span>Outbound: {props.outboundLinks.length}</span>
      </div>
    </div>
  );
}
