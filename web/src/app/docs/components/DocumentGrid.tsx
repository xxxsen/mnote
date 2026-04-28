import type { Tag } from "@/types";
import type { DocumentWithTags } from "../types";
import { formatRelativeTime } from "../utils";
import { Copy, Pin, Search, Star } from "lucide-react";

function AiSearchCard({ doc, tagIndex, onNavigate }: {
  doc: DocumentWithTags;
  tagIndex: Record<string, Tag>;
  onNavigate: (path: string) => void;
}) {
  const docTags = (doc.tag_ids || []).map((id) => tagIndex[id]).filter((t): t is Tag => Boolean(t)); // eslint-disable-line @typescript-eslint/no-unnecessary-condition
  return (
    <div
      onClick={() => onNavigate(`/docs/${doc.id}`)}
      className="group relative flex flex-col border border-indigo-500/30 bg-indigo-500/5 p-4 h-48 hover:border-indigo-500 transition-colors cursor-pointer rounded-[8px] overflow-hidden"
    >
      <div className="absolute top-2 right-2 text-indigo-500/40 group-hover:text-indigo-500 transition-colors">
        <Search className="h-3 w-3" />
      </div>
      <div className="flex-1 flex items-center justify-center px-2">
        <h3 className="font-mono font-bold text-lg text-center line-clamp-3" title={doc.title}>{doc.title}</h3>
      </div>
      <div className="text-[9px] font-mono text-indigo-500/70 uppercase tracking-tighter text-center mb-2">
        {Math.round((doc.score || 0) * 100)}% Match
      </div>
      <div className="mt-auto flex flex-wrap gap-1 justify-center pt-2 border-t border-indigo-500/20">
        {docTags.map(tag => (
          <span key={tag.id} className="text-[10px] bg-indigo-500/10 text-indigo-600 px-1.5 py-0.5 rounded-full border border-indigo-500/10">#{tag.name}</span>
        ))}
      </div>
    </div>
  );
}

function DocumentCard({ doc, index, tagIndex, showShared, onNavigate, onPinToggle, onStarToggle, onCopyShare }: {
  doc: DocumentWithTags;
  index: number;
  tagIndex: Record<string, Tag>;
  showShared: boolean;
  onNavigate: (path: string) => void;
  onPinToggle: (e: React.MouseEvent, doc: DocumentWithTags) => void;
  onStarToggle: (e: React.MouseEvent, doc: DocumentWithTags) => void;
  onCopyShare: (token: string) => void;
}) {
  const docTags = (doc.tag_ids || []).map((id) => tagIndex[id]).filter((t): t is Tag => Boolean(t)); // eslint-disable-line @typescript-eslint/no-unnecessary-condition
  return (
    <div
      key={doc.id || `${doc.title}-${doc.mtime}-${index}`}
      onClick={() => onNavigate(`/docs/${doc.id}`)}
      className="group relative flex flex-col border border-border bg-card p-4 h-48 hover:border-foreground transition-colors cursor-pointer rounded-[8px] overflow-hidden"
    >
      <div className="absolute top-2 right-2 flex gap-1 z-20">
        {showShared ? (
          <button
            onClick={(e) => { e.stopPropagation(); if (doc.share_token) onCopyShare(doc.share_token); }}
            className="p-1.5 rounded-full transition-all text-muted-foreground opacity-100 bg-background/80 shadow-sm hover:text-foreground"
            title="Copy share link"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        ) : (
          <>
            <button
              onClick={(e) => onStarToggle(e, doc)}
              className={`p-1.5 rounded-full transition-all ${doc.starred ? "text-yellow-500 opacity-100 bg-background/80 shadow-sm" : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-background/80 hover:text-foreground"}`}
            >
              <Star className={`h-3.5 w-3.5 ${doc.starred ? "fill-current" : ""}`} />
            </button>
            <button
              onClick={(e) => onPinToggle(e, doc)}
              className={`p-1.5 rounded-full transition-all ${doc.pinned ? "text-foreground opacity-100 bg-background/80 shadow-sm" : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-background/80 hover:text-foreground"}`}
            >
              <Pin className={`h-3.5 w-3.5 ${doc.pinned ? "fill-current" : ""}`} />
            </button>
          </>
        )}
      </div>
      <div className="flex-1 flex items-center justify-center px-2">
        <h3 className="font-mono font-bold text-lg text-center line-clamp-3" title={doc.title}>{doc.title}</h3>
      </div>
      <div className="mt-auto flex flex-col gap-1 border-t border-border/50 pt-2 pb-1 z-10">
        <div className="text-[10px] text-muted-foreground font-mono text-center mb-1">Updated {formatRelativeTime(doc.mtime)}</div>
        <div className="relative group/tags flex items-center justify-center min-h-[1.5rem]">
          <div className="flex flex-wrap gap-1 max-h-[2.75rem] overflow-hidden justify-center items-center px-2 transition-all">
            {docTags.length > 0 ? (
              docTags.map((tag) => (
                <span key={tag.id} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary text-secondary-foreground border border-border/50 whitespace-nowrap" title={tag.name}>
                  #{tag.name}
                </span>
              ))
            ) : (
              <span className="text-[10px] text-muted-foreground/40 italic px-1">No tags</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export interface DocumentGridProps {
  docs: DocumentWithTags[];
  aiSearchDocs: DocumentWithTags[];
  aiSearching: boolean;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  showShared: boolean;
  tagIndex: Record<string, Tag>;
  loadMoreRef: React.RefObject<HTMLDivElement | null>;
  onNavigate: (path: string) => void;
  onPinToggle: (e: React.MouseEvent, doc: DocumentWithTags) => void;
  onStarToggle: (e: React.MouseEvent, doc: DocumentWithTags) => void;
  onCopyShare: (token: string) => void;
}

export function DocumentGrid(props: DocumentGridProps) {
  const {
    docs, aiSearchDocs, aiSearching, loading, loadingMore, hasMore, showShared,
    tagIndex, loadMoreRef, onNavigate, onPinToggle, onStarToggle, onCopyShare,
  } = props;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8">
      {aiSearchDocs.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <div className="bg-indigo-500/10 p-1 rounded-md"><Search className="h-4 w-4 text-indigo-500" /></div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex-1">AI Semantic Discovery</h2>
            {aiSearching && <div className="text-[10px] text-muted-foreground animate-pulse">Analyzing library...</div>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {aiSearchDocs.map((doc) => (
              <AiSearchCard key={`ai-${doc.id}`} doc={doc} tagIndex={tagIndex} onNavigate={onNavigate} />
            ))}
          </div>
          <div className="mt-6 border-b border-border shadow-sm shadow-indigo-500/10" />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20 text-muted-foreground animate-pulse">Loading...</div>
      ) : docs.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          {showShared ? "No shared notes found." : "No micro notes found."}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {docs.map((doc, index) => (
              <DocumentCard
                key={doc.id || `${doc.title}-${doc.mtime}-${index}`}
                doc={doc} index={index} tagIndex={tagIndex} showShared={showShared}
                onNavigate={onNavigate} onPinToggle={onPinToggle} onStarToggle={onStarToggle} onCopyShare={onCopyShare}
              />
            ))}
          </div>
          {loadingMore && <div className="flex justify-center text-xs text-muted-foreground">Loading more...</div>}
          {hasMore && <div ref={loadMoreRef} className="h-6" />}
        </div>
      )}
    </div>
  );
}
