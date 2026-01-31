"use client";

import { useState, useCallback, useEffect } from "react";
import { Play, Terminal, Loader2, AlertCircle, ChevronRight, Hash, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import oneLight from "react-syntax-highlighter/dist/esm/styles/prism/one-light";
import { sandboxRegistry } from "@/lib/sandbox-registry";

type SyntaxHighlighterProps = React.ComponentProps<typeof SyntaxHighlighter>;
type ThemedSyntaxHighlighterProps = Omit<SyntaxHighlighterProps, "style"> & {
  style?: React.CSSProperties | Record<string, React.CSSProperties>;
};

const ThemedSyntaxHighlighter =
  SyntaxHighlighter as unknown as React.ComponentType<ThemedSyntaxHighlighterProps>;

interface CodeSandboxProps {
  code: string;
  language: string;
  fileName?: string;
}

export const CodeSandbox = ({ code, language, fileName }: CodeSandboxProps) => {
  const [output, setOutput] = useState<{ type: "stdout" | "stderr" | "system"; content: string }[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const isGoLang = language === 'go' || language === 'golang';
  const [goEnvReady, setGoEnvReady] = useState<boolean | 'checking'>(isGoLang ? 'checking' : true);

  useEffect(() => {
    if (isGoLang) {
      fetch('/yaegi.wasm', { method: 'HEAD' })
        .then(res => setGoEnvReady(res.ok))
        .catch(() => setGoEnvReady(false));
    }
  }, [isGoLang]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  }, [code]);

  const runCode = useCallback(() => {
    if (isRunning) return;
    
    setIsRunning(true);
    setError(null);
    setOutput([{ type: "system", content: `Initializing ${language} runtime...` }]);

    let finalCode = code.trim();
    if ((language === 'go' || language === 'golang') && !finalCode.includes("package ")) {
      finalCode = "package main\n" + finalCode;
    }

    sandboxRegistry.run({
      code: finalCode,
      language,
      wasmUrl: window.location.origin + "/yaegi.wasm",
      onMessage: (msg) => {
        if (msg.type === "done") {
          setIsRunning(false);
        } else if (msg.type === "error") {
          setError(msg.content || "Unknown error");
          setIsRunning(false);
        } else {
          const type = msg.type as "stdout" | "stderr" | "system";
          setOutput((prev) => [...prev, { type, content: msg.content || "" }]);
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, isRunning, language, goEnvReady]);

  const displayLanguage = language === 'py' ? 'python' : language === 'js' ? 'javascript' : language;
  const isGo = language === 'go' || language === 'golang';
  const displayTitle = fileName || `${displayLanguage} Sandbox`;


  return (
    <div className="my-6 border border-border/60 rounded-xl overflow-hidden bg-card/50 backdrop-blur-sm shadow-lg group text-left">
      <div className="flex items-center justify-between px-4 h-11 bg-muted/20 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-5 h-5 rounded bg-blue-500/10 border border-blue-500/20">
            <Hash className="h-3 w-3 text-blue-500" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-mono text-left">
            {displayTitle}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 rounded-lg hover:bg-muted transition-all"
            onClick={handleCopy}
            title="Copy Code"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-muted-foreground/60" />
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 rounded-lg hover:bg-blue-500/10 transition-all flex items-center justify-center"
            onClick={runCode}
            disabled={isRunning || (isGo && goEnvReady === 'checking')}
            title={isRunning ? "Executing..." : "Run Code"}
          >
            {isRunning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
            ) : (
              <Play className="h-3.5 w-3.5 text-blue-500 fill-blue-500" />
            )}
          </Button>
        </div>
      </div>
      
      <div className="p-5 font-mono text-[13px] overflow-x-auto bg-background/30 text-left">
        <ThemedSyntaxHighlighter
          language={language}
          style={oneLight}
          PreTag="div"
          customStyle={{
            margin: 0,
            padding: 0,
            background: "transparent",
            border: "none",
            boxShadow: "none",
            textAlign: "left",
          }}
          codeTagProps={{
            style: {
              border: "none",
              boxShadow: "none",
              background: "transparent",
              padding: 0,
              textAlign: "left",
            },
          }}
        >
          {code}
        </ThemedSyntaxHighlighter>
      </div>

      {isGo && goEnvReady === false && (
        <div className="px-4 py-3 bg-amber-500/5 border-t border-amber-500/20 text-[11px] text-amber-600/80 flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>Missing <b>yaegi.wasm</b> in <code>web/public/</code>. Please ensure Docker build or local file exists.</span>
        </div>
      )}

      {(output.length > 0 || error) && (
        <div className="border-t border-border/40 bg-black/5 p-4 font-mono text-[11px] text-left">
          <div className="flex items-center gap-2 mb-3 text-muted-foreground/40 uppercase tracking-[0.2em] font-bold">
            <Terminal className="h-3 w-3" />
            Terminal Output
          </div>
          <div className="space-y-1.5 max-h-60 overflow-y-auto custom-scrollbar">
            {error ? (
              <div className="flex items-start gap-2 text-destructive bg-destructive/5 p-2 rounded border border-destructive/10">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <pre className="whitespace-pre-wrap text-left">{error}</pre>
              </div>
            ) : (
              output.map((line, i) => (
                <div key={i} className="flex gap-2 text-left">
                  <span className="opacity-30 shrink-0 select-none">
                    <ChevronRight className="h-3 w-3 mt-0.5" />
                  </span>
                  <span className={
                    line.type === "system" ? "text-blue-500/70 italic" : 
                    line.type === "stderr" ? "text-destructive/80" : 
                    "text-foreground/80"
                  }>
                    {line.content}
                  </span>
                </div>
              ))
            )}
            {isRunning && (
              <div className="flex gap-2 items-center text-muted-foreground/40 animate-pulse text-left">
                <ChevronRight className="h-3 w-3" />
                <span>_</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
