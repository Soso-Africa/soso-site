import { useEffect, useMemo, useRef, useState } from "react";
import { Bold, Italic, Underline, List, ListOrdered, Pilcrow, Link2, Paperclip, X, Eye, Code } from "lucide-react";
import { ACCEPT_ATTR, ALLOWED_EXTENSIONS, MAIL_LIMITS, attachmentProblem, formatBytes, safeHref, sandboxDocument } from "@/lib/staff-mail-html";
import type { OutgoingAttachment } from "@/lib/staff-mail-api";

const tool = "inline-flex min-h-10 min-w-10 items-center justify-center border border-border px-2 text-xs hover:bg-primary/5 disabled:opacity-50";
const INLINE: Record<string, string> = { B: "strong", STRONG: "strong", I: "em", EM: "em", U: "u" };
const BLOCK: Record<string, string> = { P: "p", DIV: "p", UL: "ul", OL: "ol", LI: "li" };

/**
 * Rebuilds a DOM subtree into a fresh whitelisted fragment. Untrusted markup is never assigned to innerHTML of a live node:
 * input is parsed in an inert DOMParser document and only safe, generated elements are cloned out.
 */
function cleanInto(src: Node, out: Node, doc: Document) {
  src.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) { out.appendChild(doc.createTextNode(n.textContent ?? "")); return; }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const el = n as Element; const t = el.tagName;
    if (t === "BR") { out.appendChild(doc.createElement("br")); return; }
    if (t === "A") {
      const href = safeHref(el.getAttribute("href") ?? "");
      if (!href) { cleanInto(el, out, doc); return; }
      const a = doc.createElement("a"); a.setAttribute("href", href); a.setAttribute("rel", "noopener noreferrer"); a.setAttribute("target", "_blank");
      cleanInto(el, a, doc); out.appendChild(a); return;
    }
    const tag = INLINE[t] ?? BLOCK[t];
    if (!tag) { if (!/^(SCRIPT|STYLE|IFRAME|OBJECT|TEMPLATE|IMG|SVG|MATH)$/.test(t)) cleanInto(el, out, doc); return; }
    const c = doc.createElement(tag); cleanInto(el, c, doc); out.appendChild(c);
  });
}
function toText(node: Node): string {
  let s = "";
  node.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) { s += n.textContent ?? ""; return; }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const el = n as Element; const t = el.tagName.toLowerCase();
    if (t === "br") s += "\n";
    else if (t === "a") { const inner = toText(el); const href = el.getAttribute("href") ?? ""; s += inner && inner !== href.replace(/^mailto:/, "") ? `${inner} (${href.replace(/^mailto:/, "")})` : inner || href; }
    else if (t === "li") s += `- ${toText(el).trim()}\n`;
    else if (t === "p" || t === "ul" || t === "ol") s += `${toText(el).replace(/\n+$/, "")}\n\n`;
    else s += toText(el);
  });
  return s;
}
export function serializeEditor(root: HTMLElement) {
  const doc = document.implementation.createHTMLDocument("");
  const wrap = doc.createElement("div"); cleanInto(root, wrap, doc);
  const text = toText(wrap).replace(/\n{3,}/g, "\n\n").trim();
  return { html: text ? wrap.innerHTML : "", text };
}
function safeFragment(html: string) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const frag = document.createDocumentFragment(); cleanInto(parsed.body, frag, document);
  return frag;
}

/** Adds noopener/new-tab to links of server-sanitized HTML; parsing happens in an inert document, output only goes to a sandboxed iframe. */
export function hardenForFrame(html: string) {
  const d = new DOMParser().parseFromString(html, "text/html");
  d.querySelectorAll("script,iframe,object,embed,form,link,meta,base").forEach((e) => e.remove());
  d.querySelectorAll("a").forEach((a) => {
    const h = safeHref(a.getAttribute("href") ?? "");
    if (h) { a.setAttribute("href", h); a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener noreferrer"); } else a.removeAttribute("href");
  });
  return d.body.innerHTML;
}

export function SafeHtmlFrame({ html, title, height = 320 }: { html: string; title: string; height?: number }) {
  const doc = useMemo(() => sandboxDocument(hardenForFrame(html)), [html]);
  return <iframe title={title} data-testid="frame-mail-html" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" srcDoc={doc} className="w-full border border-border bg-background" style={{ height }} />;
}

export function RichEditor({ html, onChange, disabled, label, id }: { html: string; onChange: (html: string, text: string) => void; disabled?: boolean; label: string; id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const range = useRef<Range | null>(null);
  const changeRef = useRef(onChange); changeRef.current = onChange;
  const lastEmitted = useRef<string | null>(null);
  const [linkText, setLinkText] = useState(""); const [linkUrl, setLinkUrl] = useState(""); const [linkErr, setLinkErr] = useState("");
  const [view, setView] = useState<"edit" | "preview" | "text">("edit");
  const [plain, setPlain] = useState("");

  // Restore from parent draft on mount, and reset when parent clears/replaces html (e.g. after a send).
  useEffect(() => {
    const el = ref.current; if (!el || html === lastEmitted.current) return;
    el.replaceChildren(safeFragment(html)); lastEmitted.current = html; setPlain(el.textContent ? serializeEditor(el).text : "");
  }, [html, view]);

  const emit = () => { const el = ref.current; if (!el) return; const r = serializeEditor(el); lastEmitted.current = r.html; setPlain(r.text); changeRef.current(r.html, r.text); };
  const save = () => { const s = window.getSelection(); if (s && s.rangeCount && ref.current?.contains(s.anchorNode)) range.current = s.getRangeAt(0).cloneRange(); };
  const restore = () => { ref.current?.focus(); const s = window.getSelection(); if (range.current && s) { s.removeAllRanges(); s.addRange(range.current); } };
  const cmd = (c: string, v?: string) => { if (disabled) return; restore(); document.execCommand("styleWithCSS", false, "false"); document.execCommand(c, false, v); emit(); save(); };
  const addLink = () => {
    const href = safeHref(linkUrl); const label = linkText.trim();
    if (!label) return setLinkErr("Enter the visible link text.");
    if (!href) return setLinkErr("Only http://, https:// or mailto: addresses are allowed.");
    const el = ref.current; if (!el || disabled) return;
    const a = document.createElement("a"); a.setAttribute("href", href); a.textContent = label;
    const r = range.current && el.contains(r0(range.current)) ? range.current : null;
    if (r) { r.deleteContents(); r.insertNode(a); r.setStartAfter(a); r.collapse(true); }
    else { const p = document.createElement("p"); p.appendChild(a); el.appendChild(p); }
    setLinkText(""); setLinkUrl(""); setLinkErr(""); emit();
  };
  const tools: [string, React.ElementType, () => void][] = [
    ["Bold", Bold, () => cmd("bold")], ["Italic", Italic, () => cmd("italic")], ["Underline", Underline, () => cmd("underline")],
    ["Paragraph", Pilcrow, () => cmd("formatBlock", "<p>")], ["Bulleted list", List, () => cmd("insertUnorderedList")], ["Numbered list", ListOrdered, () => cmd("insertOrderedList")],
  ];
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span id={`${id}-label`} className="text-xs font-medium">{label}</span>
      <div role="group" aria-label="Editor view" className="flex gap-1">
        {([["edit", "Edit", Code], ["preview", "Preview", Eye], ["text", "Text fallback", Pilcrow]] as const).map(([v, l, I]) => <button key={v} type="button" aria-pressed={view === v} data-testid={`button-${id}-view-${v}`} onClick={() => setView(v)} className={`${tool} gap-1 ${view === v ? "border-primary bg-primary/10" : ""}`}><I size={13} />{l}</button>)}
      </div>
    </div>
    <div className={view === "edit" ? "space-y-2" : "hidden"}>
      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-1">
        {tools.map(([l, I, f]) => <button key={l} type="button" title={l} aria-label={l} disabled={disabled} data-testid={`button-${id}-${l.toLowerCase().replace(/\s/g, "-")}`} onMouseDown={(e) => e.preventDefault()} onClick={f} className={tool}><I size={14} /></button>)}
      </div>
      <div ref={ref} id={id} role="textbox" aria-multiline="true" aria-labelledby={`${id}-label`} aria-disabled={disabled} data-testid={`input-${id}`}
        contentEditable={!disabled} suppressContentEditableWarning
        onInput={emit} onKeyUp={save} onMouseUp={save} onBlur={save}
        onPaste={(e) => { e.preventDefault(); if (disabled) return; const t = e.clipboardData.getData("text/plain"); document.execCommand("insertText", false, t); emit(); }}
        onDrop={(e) => e.preventDefault()} onDragOver={(e) => e.preventDefault()}
        className={`staff-input min-h-48 overflow-auto [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_a]:text-primary [&_a]:underline ${disabled ? "opacity-60" : ""}`} />
      <p className="text-[11px] text-muted-foreground">Pasted content is inserted as plain text; dropped files and markup are ignored.</p>
      <fieldset disabled={disabled} className="grid gap-2 border border-dashed border-border p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <legend className="px-1 text-[11px] font-semibold uppercase tracking-wider">Insert link</legend>
        <label className="block text-xs">Link text<input data-testid={`input-${id}-link-text`} className="staff-input mt-1" value={linkText} onChange={(e) => setLinkText(e.target.value)} /></label>
        <label className="block text-xs">Address (https://, http://, mailto:)<input data-testid={`input-${id}-link-url`} inputMode="url" className="staff-input mt-1" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} /></label>
        <button type="button" data-testid={`button-${id}-insert-link`} onClick={addLink} className={`${tool} gap-1 px-3`}><Link2 size={14} />Insert</button>
        {linkErr && <p role="alert" className="text-xs text-destructive sm:col-span-3">{linkErr}</p>}
      </fieldset>
    </div>
    {view === "preview" && (html ? <SafeHtmlFrame html={html} title={`${label} preview`} /> : <p className="border border-dashed border-border p-4 text-sm text-muted-foreground">Nothing to preview yet.</p>)}
    {view === "text" && <div><pre data-testid={`text-${id}-fallback`} className="max-h-80 overflow-auto whitespace-pre-wrap break-words border border-dashed border-border p-4 font-sans text-sm">{plain || "(empty)"}</pre><p className="mt-1 text-[11px] text-muted-foreground">Approximate plain-text version. The server derives the authoritative text part.</p></div>}
  </div>;
}
function r0(r: Range) { return r.commonAncestorContainer; }

function readBase64(f: File) {
  return new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onerror = () => rej(new Error(`"${f.name}" could not be read.`)); fr.onload = () => res(String(fr.result).replace(/^data:[^,]*,/, "")); fr.readAsDataURL(f); });
}

export function AttachmentPicker({ value, onChange, disabled, onReadingChange }: { value: OutgoingAttachment[]; onChange: (v: OutgoingAttachment[]) => void; disabled?: boolean; onReadingChange?: (r: boolean) => void }) {
  const readingRef = useRef(onReadingChange); readingRef.current = onReadingChange;
  const input = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState(""); const [reading, setReadingState] = useState(false);
  const setReading = (b: boolean) => { setReadingState(b); readingRef.current?.(b); };
  useEffect(() => () => readingRef.current?.(false), []);
  const total = value.reduce((a, f) => a + f.size, 0);
  const add = async (files: FileList | null) => {
    if (!files?.length) return; setErr("");
    const list = [...files];
    const problem = attachmentProblem([...value, ...list.map((f) => ({ name: f.name, size: f.size }))]);
    if (problem) { setErr(problem); if (input.current) input.current.value = ""; return; }
    setReading(true);
    try { const read = await Promise.all(list.map(async (f) => ({ name: f.name, size: f.size, contentBase64: await readBase64(f) }))); onChange([...value, ...read]); }
    catch (e) { setErr(e instanceof Error ? e.message : "Files could not be read."); }
    finally { setReading(false); if (input.current) input.current.value = ""; }
  };
  return <div className="border border-border p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs font-semibold uppercase tracking-wider">Attachments</p>
      <label className={`${tool} cursor-pointer gap-1 px-3 ${disabled || reading || value.length >= MAIL_LIMITS.maxFiles ? "pointer-events-none opacity-50" : ""}`}>
        <Paperclip size={14} />{reading ? "Reading" : "Add files"}
        <input ref={input} data-testid="input-mail-attachments" type="file" multiple accept={ACCEPT_ATTR} className="sr-only" disabled={disabled || reading || value.length >= MAIL_LIMITS.maxFiles} onChange={(e) => void add(e.target.files)} />
      </label>
    </div>
    <p className="mt-1 text-[11px] text-muted-foreground">Up to 3 files, 1 MB each, 2 MB total. Types: {ALLOWED_EXTENSIONS.join(" ")}. Files stay in this browser tab only until sent.</p>
    <p className="mt-1 text-[11px] text-muted-foreground">Attachments are not antivirus scanned. Only send and open files you trust.</p>
    {value.length > 0 && <ul className="mt-2 divide-y divide-border border-t border-border text-xs">{value.map((f, i) => <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 py-1">
      <span className="min-w-0 break-all">{f.name} <span className="text-muted-foreground">- {formatBytes(f.size)}</span></span>
      <button type="button" disabled={disabled || reading} aria-label={`Remove ${f.name}`} data-testid={`button-remove-attachment-${i}`} className={tool} onClick={() => onChange(value.filter((_, j) => j !== i))}><X size={13} /></button></li>)}
      <li className="py-1 text-muted-foreground">Total {formatBytes(total)} of 2 MB</li></ul>}
    {err && <p role="alert" className="mt-2 text-xs text-destructive">{err}</p>}
  </div>;
}
