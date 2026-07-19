"use client";

import ReactMarkdown from "react-markdown";
import { Menu, X } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogHeader,
} from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";

type TocNavigationProps = {
  tocContent: string;
  slugify: (value: string) => string;
  getElementById: (id: string) => HTMLElement | null;
  scrollToElement: (element: HTMLElement) => void;
};

function decodeHash(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

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
    <aside
      aria-label="Table of contents"
      className="fixed right-8 top-24 z-30 hidden w-72 animate-in rounded-xl border border-border bg-popover/95 shadow-lg backdrop-blur-md duration-200 fade-in slide-in-from-right-4 motion-reduce:animate-none xl:block"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="text-xs font-semibold text-muted-foreground">On this page</div>
        <IconButton
          type="button"
          label={tocCollapsed ? "Expand contents" : "Collapse contents"}
          variant="ghost"
          className="h-8 w-8"
          onClick={() => setTocCollapsed(!tocCollapsed)}
        >
          {tocCollapsed
            ? <Menu className="h-4 w-4" aria-hidden="true" />
            : <X className="h-4 w-4" aria-hidden="true" />}
        </IconButton>
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
                    className="block rounded-md px-2 py-1.5 text-muted-foreground no-underline transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={(event) => {
                      props.onClick?.(event);
                      if (!href.startsWith("#")) return;
                      event.preventDefault();
                      const rawHash = decodeHash(href.slice(1));
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
    </aside>
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
                className="block min-h-11 rounded-md border-b border-border px-2 py-3 text-muted-foreground transition-colors last:border-0 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={(event) => {
                  if (!props.href?.startsWith("#")) return;
                  event.preventDefault();
                  const id = decodeHash(props.href.slice(1));
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
