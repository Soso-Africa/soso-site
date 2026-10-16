import type { ReactNode } from "react";

export const ACCOUNT_QUERY_PREFIX = "/api/account";

export const fieldClass =
  "mt-2 w-full border border-border bg-background px-3 py-3 text-[13px] text-foreground outline-none transition-colors focus:border-foreground";
export const labelClass = "block text-[11px] font-semibold uppercase tracking-[0.2em] text-secondary";
export const primaryButton =
  "inline-flex min-h-11 items-center justify-center bg-primary px-6 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-foreground transition-opacity hover:opacity-85 disabled:opacity-50";
export const ghostButton =
  "inline-flex min-h-11 items-center justify-center border border-border px-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground transition-colors hover:border-foreground disabled:opacity-50";

export function errorStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (errorStatus(error) === 403) {
    return "This service is not available for your account right now.";
  }
  const data = error && typeof error === "object" && "data" in error ? (error as { data: unknown }).data : null;
  if (data && typeof data === "object") {
    const msg = (data as { error?: unknown; message?: unknown }).error ?? (data as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

export function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function humanize(value?: string | null) {
  if (!value) return "";
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function Section({ title, eyebrow, action, children, testId }: { title: string; eyebrow?: string; action?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <section className="border-t border-border pt-10" data-testid={testId}>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          {eyebrow && <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-secondary">{eyebrow}</p>}
          <h2 className="soso-display text-2xl uppercase tracking-[0.12em] text-foreground">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="grid gap-3" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse bg-muted/60" />
      ))}
    </div>
  );
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-4 border border-destructive/40 px-4 py-3 text-[13px] text-destructive">
      <span>{errorMessage(error)}</span>
      {onRetry && <button type="button" onClick={onRetry} className="text-[11px] font-semibold uppercase tracking-[0.2em] underline underline-offset-4" data-testid="button-retry">Retry</button>}
    </div>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-dashed border-border px-6 py-12 text-center">
      <p className="soso-display text-lg uppercase tracking-[0.15em] text-foreground">{title}</p>
      <p className="mx-auto mt-3 max-w-sm text-[13px] leading-relaxed text-secondary">{body}</p>
    </div>
  );
}
