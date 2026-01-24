"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import MarkdownPreview from "@/components/markdown-preview";
import { Document } from "@/types";

export default function SharePage() {
  const params = useParams();
  const token = params.token as string;
  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const extractTitleFromContent = useCallback((value: string) => {
    const lines = value.split("\n");
    if (lines.length < 2) return "";
    const first = lines[0].trim();
    const second = lines[1].trim();
    if (!first) return "";
    if (/^=+$/.test(second)) return first;
    return "";
  }, []);

  const slugify = useCallback((value: string) => {
    const base = value
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
    return base || "section";
  }, []);

  const getElementById = useCallback((id: string) => {
    const container = previewRef.current;
    if (!container) return null;
    const safe = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
    return container.querySelector(`#${safe}`) as HTMLElement | null;
  }, []);

  const scrollToElement = useCallback((el: HTMLElement) => {
    const container = previewRef.current;
    if (!container) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const isScrollable = container.scrollHeight > container.clientHeight + 1;
    if (!isScrollable) {
      const top = window.scrollY + el.getBoundingClientRect().top - 16;
      window.scrollTo({ top, behavior: "smooth" });
      return;
    }
    const containerTop = container.getBoundingClientRect().top;
    const targetTop = el.getBoundingClientRect().top;
    const offset = targetTop - containerTop + container.scrollTop;
    container.scrollTo({ top: offset, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const fetchDoc = async () => {
      try {
        const d = await apiFetch<Document>(`/public/share/${token}`, { requireAuth: false });
        setDoc(d);
      } catch (e) {
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    fetchDoc();
  }, [token]);

  useEffect(() => {
    if (!doc) return;
    const derivedTitle = extractTitleFromContent(doc.content) || doc.title || "MNOTE";
    if (typeof document !== "undefined") {
      document.title = derivedTitle;
    }
  }, [doc, extractTitleFromContent]);

  useEffect(() => {
    if (!doc) return;
    const scrollToHash = () => {
      const hash = typeof window !== "undefined" ? window.location.hash : "";
      if (!hash) return false;
      const raw = decodeURIComponent(hash.slice(1));
      const normalized = raw.normalize("NFKC");
      const candidates = [raw, normalized, raw.toLowerCase(), slugify(raw), slugify(normalized)];
      for (const candidate of candidates) {
        const el = getElementById(candidate);
        if (el) {
          scrollToElement(el);
          return true;
        }
      }
      const headings = previewRef.current?.querySelectorAll("h1, h2, h3, h4, h5, h6") || [];
      for (const heading of headings) {
        const text = heading.textContent?.trim() || "";
        if (!text) continue;
        const headingSlug = slugify(text);
        if (candidates.includes(headingSlug) || candidates.includes(text)) {
          scrollToElement(heading as HTMLElement);
          return true;
        }
      }
      return false;
    };

    let attempts = 0;
    const tryScroll = () => {
      if (scrollToHash()) return;
      attempts += 1;
      if (attempts < 12) {
        window.setTimeout(tryScroll, 100);
      }
    };

    tryScroll();

    const onHashChange = () => {
      attempts = 0;
      tryScroll();
    };

    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [doc, slugify, getElementById]);

  useEffect(() => {
    if (!doc) return;
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (!hash) return;
    const targetId = decodeURIComponent(hash.slice(1));
    const scrollToTarget = () => {
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    const timer = window.setTimeout(scrollToTarget, 60);
    return () => window.clearTimeout(timer);
  }, [doc]);

  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;
  if (error || !doc) return <div className="flex h-screen items-center justify-center text-destructive">Document not found or link expired</div>;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center p-4 md:p-8">
      <div className="w-full max-w-4xl border border-border bg-card shadow-sm min-h-[80vh] flex flex-col">
        <div className="flex-1 p-0">
          <MarkdownPreview ref={previewRef} content={doc.content} className="h-full min-h-[500px] p-6" />
        </div>
        <footer className="border-t border-border p-4 text-center text-xs text-muted-foreground font-mono bg-muted/30">
          Published with MNOTE
        </footer>
      </div>
    </div>
  );
}
