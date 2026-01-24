"use client";

import React, { useEffect, useState } from "react";
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

  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;
  if (error || !doc) return <div className="flex h-screen items-center justify-center text-destructive">Document not found or link expired</div>;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center p-4 md:p-8">
      <div className="w-full max-w-4xl border border-border bg-card shadow-sm min-h-[80vh] flex flex-col">
        <header className="border-b border-border p-6 bg-muted/30">
          <h1 className="text-2xl font-bold font-mono tracking-tight">{doc.title}</h1>
        </header>
        <div className="flex-1 p-0">
          <MarkdownPreview content={doc.content} className="h-full min-h-[500px] p-6" />
        </div>
        <footer className="border-t border-border p-4 text-center text-xs text-muted-foreground font-mono bg-muted/30">
          Published with MNOTE
        </footer>
      </div>
    </div>
  );
}
