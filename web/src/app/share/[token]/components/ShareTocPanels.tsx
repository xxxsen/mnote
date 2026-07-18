"use client";

import ReactMarkdown from "react-markdown";
import { Menu, X } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogHeader,
} from "@/components/ui/dialog";

type TocNavigationProps = {
  tocContent: string;
  slugify: (value: string) => string;
  getElementById: (id: string) => HTMLElement | null;
  scrollToElement: (element: HTMLElement) => void;
};

export function FloatingToc({
  tocContent,
  tocCollapsed,
  setTocCollapsed,
  slugify,
  getElementById,
  scrollToElement,
}: TocNavigationProps & {
  tocCollapsed: boolean;
  setTocCollapsed: (value: boolean) => void;
}) {
  return (
    <div className="fixed right-8 top-24 z-30 hidden w-72 animate-in rounded-2xl border border-slate-200/60 bg-white/80 shadow-2xl backdrop-blur-md duration-500 fade-in slide-in-from-right-4 xl:block">
      <div className="flex items-center justify-between border-b border-slate-200/60 px-4 py-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">On this page</div>
        <button
          type="button"
          aria-label={tocCollapsed ? "Expand contents" : "Collapse contents"}
          title={tocCollapsed ? "Expand contents" : "Collapse contents"}
          onClick={() => setTocCollapsed(!tocCollapsed)}
          className="rounded-md p-1 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-900"
        >
          {tocCollapsed ? <Menu className="h-3 w-3" /> : <X className="h-3 w-3" />}
        </button>
      </div>
      {!tocCollapsed ? (
        <div className="toc-wrapper custom-scrollbar max-h-[60vh] overflow-y-auto p-4 text-sm">
          <ReactMarkdown
            components={{
              a: (props) => {
                const href = props.href || "";
                return (
                  <a
                    {...props}
                    className="block py-1 text-slate-500 no-underline transition-colors hover:text-indigo-600"
                    onClick={(event) => {
                      props.onClick?.(event);
                      if (!href.startsWith("#")) return;
                      event.preventDefault();
                      const rawHash = decodeURIComponent(href.slice(1));
                      const normalizedHash = rawHash.normalize("NFKC");
                      for (const candidate of [
                        rawHash,
                        normalizedHash,
                        slugify(rawHash),
                        slugify(normalizedHash),
                      ]) {
                        const element = getElementById(candidate);
                        if (element) {
                          scrollToElement(element);
                          break;
                        }
                      }
                    }}
                  />
                );
              },
            }}
          >
            {tocContent}
          </ReactMarkdown>
        </div>
      ) : null}
    </div>
  );
}

export function MobileToc({
  tocContent,
  onClose,
  getElementById,
  slugify,
  scrollToElement,
}: TocNavigationProps & {
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      title="Contents"
      description="Navigate to a section on this page."
      variant="drawer"
      onClose={onClose}
    >
      <DialogHeader />
      <DialogBody className="p-4">
        <ReactMarkdown
          components={{
            a: (props) => (
              <a
                {...props}
                className="block min-h-11 border-b border-slate-100 py-2 text-slate-600 transition-colors last:border-0 hover:text-indigo-600"
                onClick={(event) => {
                  if (!props.href?.startsWith("#")) return;
                  event.preventDefault();
                  const id = decodeURIComponent(props.href.slice(1));
                  const element = getElementById(id) || getElementById(slugify(id));
                  if (element) {
                    scrollToElement(element);
                    onClose();
                  }
                }}
              />
            ),
          }}
        >
          {tocContent}
        </ReactMarkdown>
      </DialogBody>
    </Dialog>
  );
}
