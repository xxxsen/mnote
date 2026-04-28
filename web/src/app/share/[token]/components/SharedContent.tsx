import { memo } from "react";
import MarkdownPreview from "@/components/markdown-preview";
import type { SharedContentProps } from "../types";

const SharedContent = memo(({ previewRef, content, handleTocLoaded }: SharedContentProps) => (
  <article className="w-full bg-white rounded-2xl shadow-[0_10px_40px_-15px_rgba(0,0,0,0.1)] border border-slate-200/50 relative overflow-visible">
    <div className="p-6 md:p-12 lg:p-16">
      <MarkdownPreview
        ref={previewRef}
        content={content}
        className="prose prose-slate max-w-none prose-headings:scroll-mt-24 prose-img:rounded-xl text-slate-800"
        onTocLoaded={handleTocLoaded}
      />
    </div>
  </article>
));

SharedContent.displayName = "SharedContent";

export default SharedContent;
