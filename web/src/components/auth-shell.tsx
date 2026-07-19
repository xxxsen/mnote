import type { ReactNode } from "react";

export function AuthShell({
  title,
  description,
  children,
  status,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  status?: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 px-4 py-8" aria-label={title}>
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center">
          <div className="text-lg font-semibold">Micro Note</div>
          <h1 className="mt-4 text-xl font-semibold">{title}</h1>
          {description ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p> : null}
        </div>
        {status}
        <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
          {children}
        </section>
      </div>
    </main>
  );
}
