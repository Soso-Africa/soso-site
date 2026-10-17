/** Pure helpers for staff mail rich text + attachments. The server remains authoritative for sanitizing and plaintext. */
export const MAIL_LIMITS = { maxFiles: 3, maxFileBytes: 1_000_000, maxTotalBytes: 2_000_000, maxHtml: 100_000 } as const;
export const ALLOWED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".txt", ".csv"] as const;
export const ACCEPT_ATTR = ALLOWED_EXTENSIONS.join(",");

export function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Only http, https and mailto links are allowed. Returns normalized href or null. */
export function safeHref(raw: string): string | null {
  const v = raw.trim();
  if (!v || /[\s<>"']/.test(v)) return null;
  try {
    const u = new URL(v);
    if (u.username || u.password) return null;
    if (u.protocol === "http:" || u.protocol === "https:") return u.hostname ? u.href : null;
    if (u.protocol === "mailto:") return /^mailto:[^@\s]+@[^@\s]+$/i.test(v) ? v : null;
  } catch { /* invalid */ }
  return null;
}

export function extensionAllowed(name: string) {
  const n = name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((e) => n.endsWith(e));
}

export function formatBytes(n: number) {
  return n < 1024 ? `${n} B` : n < 1_000_000 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1_000_000).toFixed(2)} MB`;
}

/** Validates a full prospective attachment list; returns a human reason or null if acceptable. */
export function attachmentProblem(list: { name: string; size: number }[]): string | null {
  if (list.length > MAIL_LIMITS.maxFiles) return `At most ${MAIL_LIMITS.maxFiles} files can be attached.`;
  for (const f of list) {
    if (!extensionAllowed(f.name)) return `"${f.name}" is not an allowed type (${ALLOWED_EXTENSIONS.join(", ")}).`;
    if (f.size <= 0) return `"${f.name}" is empty.`;
    if (f.size > MAIL_LIMITS.maxFileBytes) return `"${f.name}" is ${formatBytes(f.size)}; each file must be 1 MB or less.`;
  }
  const total = list.reduce((a, f) => a + f.size, 0);
  if (total > MAIL_LIMITS.maxTotalBytes) return `Attachments total ${formatBytes(total)}; the limit is 2 MB combined.`;
  return null;
}

/** Idempotency signature: any change to recipients, content, html or attachment bytes yields a new message identity. */
export function sendSignature(d: { to: string; subject: string; text: string; html?: string; reply?: unknown; attachments?: { name: string; contentBase64: string }[] }) {
  return JSON.stringify([d.to.trim(), d.subject, d.text, d.html ?? "", d.reply ?? null, (d.attachments ?? []).map((a) => [a.name, a.contentBase64])]);
}

/** Plain text to minimal safe HTML paragraphs (used for preview of plain campaigns). */
export function textToHtml(text: string) {
  return text.split(/\n{2,}/).filter((p) => p.trim()).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
}

export const SANDBOX_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'";

/** Wraps already-sanitized body HTML in a document with a restrictive CSP for a sandboxed iframe srcDoc. */
export function sandboxDocument(bodyHtml: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}"><meta name="referrer" content="no-referrer"><base target="_blank"><style>body{margin:0;padding:12px;font:14px/1.6 Georgia,serif;color:#2b2622;background:#fbf8f3;word-wrap:break-word}a{color:#7a3b2e}img{max-width:100%}</style></head><body>${bodyHtml}</body></html>`;
}
