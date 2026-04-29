"use client";

import ReactMarkdown from "react-markdown";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FloatingToc({
  tocContent, tocCollapsed, setTocCollapsed,
  slugify, getElementById, scrollToElement,
}: {
  tocContent: string; tocCollapsed: boolean; setTocCollapsed: (v: boolean) => void;
  slugify: (v: string) => string; getElementById: (id: string) => HTMLElement | null;
  scrollToElement: (el: HTMLElement) => void;
}) {
  return (
    <div className="fixed top-24 right-8 z-30 hidden w-72 rounded-2xl border border-slate-200/60 bg-white/80 shadow-2xl backdrop-blur-md xl:block animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/60">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">On this page</div>
        <button onClick={() => setTocCollapsed(!tocCollapsed)} className="p-1 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-all">
          {tocCollapsed ? <Menu className="h-3 w-3" /> : <X className="h-3 w-3" />}
        </button>
      </div>
      {!tocCollapsed && (
        <div className="toc-wrapper text-sm max-h-[60vh] overflow-y-auto p-4 custom-scrollbar">
          <ReactMarkdown
            components={{
              a: (props) => {
                const href = props.href || "";
                return (
                  <a {...props} className="text-slate-500 hover:text-indigo-600 transition-colors py-1 block no-underline"
                    onClick={(event) => {
                      props.onClick?.(event);
                      if (!href.startsWith("#")) return;
                      event.preventDefault();
                      const rawHash = decodeURIComponent(href.slice(1));
                      const normalizedHash = rawHash.normalize("NFKC");
                      for (const candidate of [rawHash, normalizedHash, slugify(rawHash), slugify(normalizedHash)]) {
                        const el = getElementById(candidate);
                        if (el) { scrollToElement(el); break; }
                      }
                    }}
                  />
                );
              },
            }}
          >{tocContent}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

export function MobileToc({
  tocContent, onClose, getElementById, slugify, scrollToElement,
}: {
  tocContent: string; onClose: () => void;
  getElementById: (id: string) => HTMLElement | null;
  slugify: (v: string) => string; scrollToElement: (el: HTMLElement) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end xl:hidden">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-80 bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <span className="font-bold text-slate-900">Contents</span>
          <Button size="icon" variant="ghost" onClick={onClose}><X className="h-5 w-5" /></Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <ReactMarkdown
            components={{
              a: (props) => (
                <a {...props} className="text-slate-600 hover:text-indigo-600 transition-colors py-2 block border-b border-slate-50 last:border-0"
                  onClick={(event) => {
                    if (!props.href?.startsWith("#")) return;
                    event.preventDefault();
                    const id = decodeURIComponent(props.href.slice(1));
                    const el = getElementById(id) || getElementById(slugify(id));
                    if (el) { scrollToElement(el); onClose(); }
                  }}
                />
              ),
            }}
          >{tocContent}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
