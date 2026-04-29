"use client";

import { useState, useEffect, useCallback, type RefObject } from "react";

export function useShareToc(previewRef: RefObject<HTMLDivElement | null>, doc: { content: string } | undefined) {
  const [tocContent, setTocContent] = useState("");
  const [showFloatingToc, setShowFloatingToc] = useState(false);
  const [tocCollapsed, setTocCollapsed] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showMobileToc, setShowMobileToc] = useState(false);

  const hasTocToken = doc ? /\[(toc|TOC)]/.test(doc.content) : false;

  const handleTocLoaded = useCallback((toc: string) => {
    setTocContent(hasTocToken ? toc : "");
  }, [hasTocToken]);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
          if (totalHeight > 0) setScrollProgress((window.scrollY / totalHeight) * 100);
          setShowScrollTop(window.scrollY > 400);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const hasToken = doc ? /\[(toc|TOC)]/.test(doc.content) : false;
    if (!tocContent || !hasToken) {
      const frame = requestAnimationFrame(() => setShowFloatingToc(false));
      return () => cancelAnimationFrame(frame);
    }
    const container = previewRef.current;
    if (!container) return;

    let timer: number | null = null;
    let ticking = false;

    const updateVisibility = () => {
      ticking = false;
      const tocEl = container.querySelector<HTMLElement>(".toc-wrapper");
      if (!tocEl) { setShowFloatingToc(false); return; }
      const isScrollable = container.scrollHeight > container.clientHeight + 1;
      if (isScrollable) {
        const top = tocEl.offsetTop;
        const bottom = top + tocEl.offsetHeight;
        const viewTop = container.scrollTop;
        const viewBottom = viewTop + container.clientHeight;
        setShowFloatingToc(!(bottom > viewTop && top < viewBottom));
        return;
      }
      const rect = tocEl.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      setShowFloatingToc(!(rect.bottom > 0 && rect.top < viewportHeight));
    };

    const onScroll = () => { if (ticking) return; ticking = true; window.requestAnimationFrame(updateVisibility); };
    const scrollTarget = container.scrollHeight > container.clientHeight + 1 ? container : window;
    timer = window.setTimeout(updateVisibility, 120);
    scrollTarget.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      scrollTarget.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (timer) window.clearTimeout(timer);
    };
  }, [tocContent, doc, previewRef]);

  return {
    hasTocToken, tocContent, showFloatingToc, tocCollapsed, setTocCollapsed,
    showMobileToc, setShowMobileToc, handleTocLoaded, scrollProgress, showScrollTop,
  };
}
