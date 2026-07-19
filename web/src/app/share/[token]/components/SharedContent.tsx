import { memo } from "react";
import MarkdownPreview from "@/components/markdown-preview";
import { ReadingSurface } from "@/components/reading-surface";
import type { SharedContentProps } from "../types";

const SharedContent = memo(({ previewRef, content, handleTocLoaded }: SharedContentProps) => (
  <ReadingSurface className="p-6 md:p-12 lg:p-16">
    <MarkdownPreview
      ref={previewRef}
      content={content}
      className="prose max-w-none text-foreground prose-headings:scroll-mt-24 prose-img:rounded-xl"
      onTocLoaded={handleTocLoaded}
    />
  </ReadingSurface>
));

SharedContent.displayName = "SharedContent";

export default SharedContent;
