import { FormEvent, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Mail, RefreshCw, Send, Inbox, Settings, Users, FileText, History, ShieldAlert } from "lucide-react";
import {
  mailApi, useMailCampaigns, useMailDetail, useMailHistory, useMailList, useMailSettings, useSubscribers,
  type MailStatus,
} from "@/lib/staff-mail-api";

type Folder = "inbox" | "sent";
type Panel = "inbox" | "sent" | "compose" | "history" | "subscribers" | "campaigns" | "settings";
type Ref = { uid: number; uidValidity: string; folder: Folder };
type Draft = { to: string; subject: string; text: string; reply?: Ref };

const btn = "inline-flex min-h-10 items-center justify-center gap-2 border border-primary px-4 text-xs font-semibold uppercase tracking-wider text-primary hover:bg-primary/5 disabled:opacity-50";
const btnSolid = "inline-flex min-h-10 items-center justify-center gap-2 bg-primary px-4 text-xs font-semibold uppercase tracking-wider text-primary-foreground disabled:opacity-50";
const box = "border border-border bg-card p-5";
const msg = (e: unknown, f: string) => (e instanceof Error && e.message ? e.message : f);
const when = (v: string | null) => { const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleString() : "Unknown date"; };

function Lbl({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-medium">{label}{children}</label>;
}
function Err({ children }: { children?: React.ReactNode }) {
  return children ? <p role="alert" className="mt-3 border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{children}</p> : null;
}
function Note({ children }: { children?: React.ReactNode }) {
  return children ? <p role="status" className="mt-3 border border-primary/25 bg-primary/5 p-3 text-sm">{children}</p> : null;
}
function Skeleton() {
  return <div aria-busy="true" className="space-y-2 p-5">{[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse bg-muted/60" />)}</div>;
}
function Empty({ label }: { label: string }) {
  return <p className="p-8 text-center text-sm text-muted-foreground">{label}</p>;
}

export function StaffMailSection({ role, actor }: { role: string; actor: string }) {
  const isOwner = role === "owner";
  const allowed = isOwner || role === "administrator";
  const [panel, setPanel] = useState<Panel>("inbox");
  const [draft, setDraft] = useState<Draft>({ to: "", subject: "", text: "" });
  if (!allowed) {
    return <section className="mt-6 flex max-w-xl items-start gap-3 border border-border bg-card p-5"><ShieldAlert size={18} className="mt-0.5 text-primary" /><p className="text-sm">Customer correspondence is available to owners and administrators only.</p></section>;
  }
  const tabs: { id: Panel; label: string; icon: React.ElementType }[] = [
    { id: "inbox", label: "Inbox", icon: Inbox }, { id: "sent", label: "Sent", icon: Send },
    { id: "compose", label: "Compose", icon: Mail }, { id: "history", label: "Send history", icon: History },
    { id: "subscribers", label: "Subscribers", icon: Users }, { id: "campaigns", label: "Campaigns", icon: FileText },
    ...(isOwner ? [{ id: "settings" as Panel, label: "Mail settings", icon: Settings }] : []),
  ];
  return <section className="mt-6" aria-label="Customer correspondence">
    <div role="tablist" aria-label="Correspondence panels" className="flex flex-wrap gap-1 border-b border-border">
      {tabs.map((t) => { const I = t.icon; return <button key={t.id} role="tab" type="button" aria-selected={panel === t.id} onClick={() => setPanel(t.id)} className={`inline-flex min-h-10 items-center gap-2 border-b-2 px-3 text-xs font-medium ${panel === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}><I size={14} />{t.label}</button>; })}
    </div>
    <div className="mt-5" role="tabpanel">
      {(panel === "inbox" || panel === "sent") && <Messages key={panel} actor={actor} folder={panel} onReply={(d) => { setDraft(d); setPanel("compose"); }} />}
      {panel === "compose" && <Compose actor={actor} draft={draft} setDraft={setDraft} />}
      {panel === "history" && <HistoryPanel actor={actor} />}
      {panel === "subscribers" && <Subscribers actor={actor} />}
      {panel === "campaigns" && <Campaigns actor={actor} />}
      {panel === "settings" && isOwner && <SettingsPanel actor={actor} />}
    </div>
  </section>;
}

function Messages({ actor, folder, onReply }: { actor: string; folder: Folder; onReply: (d: Draft) => void }) {
  const list = useMailList(actor, folder, true);
  const [sel, setSel] = useState<Ref | null>(null);
  const detail = useMailDetail(actor, sel);
  const d = detail.data;
  return <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
    <div className="border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-3"><p className="text-xs font-semibold uppercase tracking-wider">{folder === "inbox" ? "Inbox" : "Sent"} - latest 30</p>
        <button type="button" className={btn} onClick={() => void list.refetch()} disabled={list.isFetching}>{list.isFetching ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}Refresh</button></div>
      {list.isLoading ? <Skeleton /> : list.isError ? <div className="p-4"><Err>{msg(list.error, "Messages could not be loaded. Check mail settings and try again.")}</Err><button type="button" className={`${btn} mt-3`} onClick={() => void list.refetch()}>Retry</button></div>
        : !list.data?.messages.length ? <Empty label="No messages in this folder." /> :
        <ul className="max-h-[560px] divide-y divide-border overflow-y-auto">{list.data.messages.map((m) => {
          const on = sel?.uid === m.uid && sel.uidValidity === list.data!.uidValidity;
          return <li key={m.uid}><button type="button" aria-pressed={on} onClick={() => setSel({ uid: m.uid, uidValidity: list.data!.uidValidity, folder })} className={`block w-full px-4 py-3 text-left ${on ? "bg-primary/10" : "hover:bg-muted/40"}`}>
            <p className={`truncate text-sm ${m.unread ? "font-semibold" : ""}`}>{m.subject || "(No subject)"}</p>
            <p className="truncate text-xs text-muted-foreground">{folder === "inbox" ? m.from : m.to}</p>
            <p className="text-[11px] text-muted-foreground">{when(m.date)}{m.unread ? " - unread" : ""}</p></button></li>;
        })}</ul>}
    </div>
    <div className="min-h-48 border border-border bg-card p-5">
      {!sel ? <Empty label="Select a message to read it as plain text." /> : detail.isLoading ? <Skeleton /> : detail.isError ? <><Err>{msg(detail.error, "This message could not be opened. The mailbox may have changed; refresh the list.")}</Err></> : d && <article>
        <h2 className="text-xl soso-display break-words">{d.subject || "(No subject)"}</h2>
        <dl className="mt-3 space-y-1 text-xs text-muted-foreground"><div>From: {d.from}</div>{d.replyTo && <div>Reply-to: {d.replyTo}</div>}<div>{when(d.date)}</div></dl>
        <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-words border-t border-border pt-4 font-sans text-sm">{d.text || "This message has no plain-text content."}</pre>
        {d.attachments.length > 0 && <div className="mt-4 border-t border-border pt-3"><p className="text-xs font-semibold uppercase tracking-wider">Attachments (not downloadable here)</p>
          <ul className="mt-2 space-y-1 text-xs">{d.attachments.map((a, i) => <li key={i} className="break-all">{a.name} - {Math.max(1, Math.round(a.size / 1024))} KB</li>)}</ul></div>}
        {d.folder === "inbox" && <button type="button" className={`${btnSolid} mt-5`} onClick={() => onReply({ to: d.replyTo || d.from, subject: /^re:/i.test(d.subject) ? d.subject : `Re: ${d.subject}`, text: "", reply: { uid: d.uid, uidValidity: d.uidValidity, folder: d.folder } })}>Reply</button>}
      </article>}
    </div>
  </div>;
}

function Compose({ actor, draft, setDraft }: { actor: string; draft: Draft; setDraft: (d: Draft) => void }) {
  const qc = useQueryClient();
  const key = useRef<{ id: string; sig: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const sig = JSON.stringify(draft);
  const submit = async (e: FormEvent, fresh = false) => {
    e.preventDefault();
    if (busy) return;
    if (fresh || !key.current || key.current.sig !== sig) key.current = { id: crypto.randomUUID(), sig };
    setBusy(true); setError(""); setDone("");
    try {
      await mailApi("/staff/mail/send", { idempotencyKey: key.current.id, to: draft.to.trim(), subject: draft.subject, text: draft.text, ...(draft.reply ? { reply: draft.reply } : {}) });
      key.current = null; setDraft({ to: "", subject: "", text: "" });
      setDone("Accepted by the mail server for delivery. This is SMTP acceptance, not confirmed delivery.");
    } catch (err) {
      setError(`${msg(err, "The send outcome is unknown.")} Check Send history before sending again. Pressing Send reuses the same message identity so it cannot duplicate; use "Send as new message" only after confirming nothing was sent.`);
    } finally {
      setBusy(false);
      for (const k of ["staff-mail-history", "staff-mail-list"]) void qc.invalidateQueries({ queryKey: [k], refetchType: "active" });
    }
  };
  return <form onSubmit={(e) => void submit(e)} className={`${box} max-w-3xl space-y-3`}>
    <h2 className="text-xl soso-display">Write to a customer</h2>
    {draft.reply && <p className="text-xs text-muted-foreground">Replying to a message in {draft.reply.folder}. <button type="button" className="underline" onClick={() => setDraft({ ...draft, reply: undefined })}>Send as a new email instead</button></p>}
    <Lbl label="To"><input required type="email" className="staff-input mt-1" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></Lbl>
    <Lbl label="Subject"><input required maxLength={200} className="staff-input mt-1" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} /></Lbl>
    <Lbl label="Message (plain text)"><textarea required rows={10} className="staff-input mt-1" value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} /></Lbl>
    <Err>{error}</Err><Note>{done}</Note>
    <div className="flex flex-wrap gap-3"><button type="submit" disabled={busy} className={btnSolid}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}{busy ? "Sending" : error ? "Retry same message" : "Send"}</button>
      {error && <button type="button" disabled={busy} className={btn} onClick={(e) => void submit(e as unknown as FormEvent, true)}>Send as new message</button>}</div>
  </form>;
}

const statusNote: Record<string, string> = { accepted: "Accepted by SMTP (not proof of delivery)", uncertain: "Uncertain - verify before resending", sending: "Sending in progress" };
function HistoryPanel({ actor }: { actor: string }) {
  const h = useMailHistory(actor);
  return <div className="border border-border bg-card">
    <div className="flex items-center justify-between border-b border-border p-3"><p className="text-xs font-semibold uppercase tracking-wider">Send history</p><button type="button" className={btn} onClick={() => void h.refetch()} disabled={h.isFetching}><RefreshCw size={13} />Refresh</button></div>
    {h.isLoading ? <Skeleton /> : h.isError ? <div className="p-4"><Err>{msg(h.error, "History could not be loaded.")}</Err></div> : !h.data?.sends.length ? <Empty label="No emails have been sent yet." /> :
      <ul className="divide-y divide-border">{h.data.sends.map((s) => <li key={s.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:justify-between"><div className="min-w-0"><p className="truncate text-sm font-medium">{s.subject}</p><p className="truncate text-xs text-muted-foreground">{s.recipient} - {s.kind} - {when(s.created_at)}</p></div>
        <span className={`h-fit border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${s.status === "uncertain" ? "border-amber-500/40 text-amber-700" : "border-border text-muted-foreground"}`}>{statusNote[s.status] ?? s.status}</span></li>)}</ul>}
  </div>;
}

function Subscribers({ actor }: { actor: string }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const [stack, setStack] = useState<string[]>([]);
  const before = stack[stack.length - 1];
  const q = useSubscribers(actor, status, before);
  const [note, setNote] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState("");
  const act = async (id: string, kind: "confirmation" | "unsubscribe", email: string) => {
    if (kind === "unsubscribe" && !window.confirm(`Unsubscribe ${email}? They will stop receiving newsletters.`)) return;
    setBusy(id); setError(""); setNote("");
    try { await mailApi(`/staff/newsletter/subscribers/${id}/${kind}`, {}); setNote(kind === "confirmation" ? `Confirmation email requested for ${email}.` : `${email} unsubscribed.`); }
    catch (e) { setError(msg(e, "The action failed.")); }
    finally { setBusy(""); for (const k of ["staff-newsletter-subscribers", "staff-mail-history"]) void qc.invalidateQueries({ queryKey: [k], refetchType: "active" }); }
  };
  return <div className="border border-border bg-card">
    <div className="flex flex-wrap items-center gap-3 border-b border-border p-3"><Lbl label="Status"><select className="staff-input ml-2 inline-block w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setStack([]); }}>{["all", "pending", "confirmed", "unsubscribed"].map((s) => <option key={s} value={s}>{s}</option>)}</select></Lbl></div>
    <div className="px-3"><Err>{error}</Err><Note>{note}</Note></div>
    {q.isLoading ? <Skeleton /> : q.isError ? <div className="p-4"><Err>{msg(q.error, "Subscribers could not be loaded.")}</Err><button type="button" className={`${btn} mt-3`} onClick={() => void q.refetch()}>Retry</button></div> : !q.data?.subscribers.length ? <Empty label="No subscribers match this status." /> :
      <ul className="divide-y divide-border">{q.data.subscribers.map((s) => <li key={s.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="break-all text-sm font-medium">{s.email}</p><p className="text-xs text-muted-foreground">{s.status} - consented {when(s.consented_at)}{s.confirmed_at ? ` - confirmed ${when(s.confirmed_at)}` : ""}{s.unsubscribed_at ? ` - unsubscribed ${when(s.unsubscribed_at)}` : ""}</p></div>
        <div className="flex gap-2">{s.status === "pending" && <button type="button" className={btn} disabled={busy === s.id} onClick={() => void act(s.id, "confirmation", s.email)}>Resend confirmation</button>}
          {s.status !== "unsubscribed" && <button type="button" className={btn} disabled={busy === s.id} onClick={() => void act(s.id, "unsubscribe", s.email)}>Unsubscribe</button>}</div></li>)}</ul>}
    <div className="flex justify-between border-t border-border p-3"><button type="button" className={btn} disabled={!stack.length} onClick={() => setStack(stack.slice(0, -1))}>Previous</button>
      <button type="button" className={btn} disabled={!q.data?.nextCursor} onClick={() => q.data?.nextCursor && setStack([...stack, q.data.nextCursor])}>Next</button></div>
  </div>;
}

function Campaigns({ actor }: { actor: string }) {
  const qc = useQueryClient();
  const c = useMailCampaigns(actor);
  const [subject, setSubject] = useState(""); const [text, setText] = useState(""); const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(""); const [error, setError] = useState(""); const [note, setNote] = useState("");
  const refresh = () => { for (const k of ["staff-newsletter-campaigns", "staff-mail-history", "staff-newsletter-subscribers"]) void qc.invalidateQueries({ queryKey: [k], refetchType: "active" }); };
  const create = async (e: FormEvent) => {
    e.preventDefault(); setBusy("create"); setError(""); setNote("");
    try { await mailApi("/staff/newsletter/campaigns", { subject, text }); setSubject(""); setText(""); setPreview(false); setNote("Draft created. Nothing has been sent."); }
    catch (err) { setError(msg(err, "Draft could not be created.")); } finally { setBusy(""); refresh(); }
  };
  const send = async (id: string) => {
    if (!window.confirm("Send the next batch of up to 3 confirmed subscribers now?")) return;
    setBusy(id); setError(""); setNote("");
    try { await mailApi(`/staff/newsletter/campaigns/${id}/send`, {}); setNote("Batch submitted. Progress below shows accepted and uncertain counts."); }
    catch (err) { setError(`${msg(err, "Batch failed.")} Part of the batch may still have been sent, even after a failure. Review progress and Send history before sending another batch.`); }
    finally { setBusy(""); refresh(); }
  };
  return <div className="grid gap-4 lg:grid-cols-2">
    <form onSubmit={(e) => void create(e)} className={`${box} space-y-3`}>
      <h2 className="text-xl soso-display">New campaign draft</h2>
      <p className="text-xs text-muted-foreground">Newsletter mail needs a current tested, enabled configuration with newsletter sending allowed by the host. Creating a draft sends nothing.</p>
      <Lbl label="Subject"><input required maxLength={200} className="staff-input mt-1" value={subject} onChange={(e) => setSubject(e.target.value)} /></Lbl>
      <Lbl label="Body (plain text)"><textarea required rows={9} className="staff-input mt-1" value={text} onChange={(e) => setText(e.target.value)} /></Lbl>
      {preview && <div className="border border-dashed border-border p-4" aria-label="Plain text preview"><p className="text-sm font-semibold break-words">{subject || "(No subject)"}</p><pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm">{text}</pre></div>}
      <div className="flex gap-3"><button type="button" className={btn} onClick={() => setPreview(!preview)}>{preview ? "Hide preview" : "Preview"}</button><button type="submit" disabled={busy === "create"} className={btnSolid}>{busy === "create" && <Loader2 size={14} className="animate-spin" />}Create draft</button></div>
      <Err>{error}</Err><Note>{note}</Note>
    </form>
    <div className="border border-border bg-card">
      <div className="border-b border-border p-3"><p className="text-xs font-semibold uppercase tracking-wider">Campaigns</p></div>
      {c.isLoading ? <Skeleton /> : c.isError ? <div className="p-4"><Err>{msg(c.error, "Campaigns could not be loaded.")}</Err><button type="button" className={`${btn} mt-3`} onClick={() => void c.refetch()}>Retry</button></div> : !c.data?.campaigns.length ? <Empty label="No campaigns yet." /> :
        <ul className="divide-y divide-border">{c.data.campaigns.map((x) => <li key={x.id} className="p-4"><p className="text-sm font-medium break-words">{x.subject}</p><p className="text-xs text-muted-foreground">{when(x.created_at)}</p>
          <p className="mt-2 text-xs">Attempted {x.attempted} - Accepted {x.accepted} - Uncertain {x.uncertain} - Remaining {x.remaining}</p>
          <button type="button" className={`${btn} mt-3`} disabled={busy === x.id || x.remaining === 0} onClick={() => void send(x.id)}>{busy === x.id && <Loader2 size={13} className="animate-spin" />}{x.remaining === 0 ? "No recipients remaining" : "Send next batch (up to 3)"}</button></li>)}</ul>}
    </div>
  </div>;
}

type Form = { smtpHost: string; smtpPort: 465 | 587; imapHost: string; username: string; fromName: string; publicOrigin: string; enabled: boolean; newsletterEnabled: boolean; policyConfirmed: boolean; hourlyLimit: number; password: string };
const HOST = "server273-1.web-hosting.com";
const blank: Form = { smtpHost: HOST, smtpPort: 465, imapHost: HOST, username: "", fromName: "SOSO Africa", publicOrigin: "", enabled: false, newsletterEnabled: false, policyConfirmed: false, hourlyLimit: 0, password: "" };

function SettingsPanel({ actor }: { actor: string }) {
  const qc = useQueryClient();
  const s = useMailSettings(actor);
  const [f, setF] = useState<Form>(blank);
  const seeded = useRef<number | null>(null);
  const [busy, setBusy] = useState(""); const [error, setError] = useState(""); const [note, setNote] = useState("");
  const [testResult, setTestResult] = useState("");
  useEffect(() => () => setF((p) => ({ ...p, password: "" })), []);
  useEffect(() => {
    const d = s.data;
    if (d && seeded.current !== d.version) { seeded.current = d.version; setF({ ...blank, ...(d.settings ? { ...d.settings } : {}), password: "" }); }
  }, [s.data]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const refresh = () => { for (const k of ["staff-mail-settings", "staff-mail-list", "staff-mail-history"]) void qc.invalidateQueries({ queryKey: [k], refetchType: "active" }); };
  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!s.data) return; setBusy("save"); setError(""); setNote(""); setTestResult("");
    const { password, ...rest } = f;
    try {
      await mailApi("/staff/mail/settings", { ...rest, imapPort: 993, ...(password ? { password } : {}), expectedVersion: s.data.version }, "PUT");
      setNote("Settings saved. Run a connection test before enabling sending.");
    } catch (err) { setError(msg(err, "Settings could not be saved. They may have changed elsewhere; reload and try again.")); }
    finally { setF((p) => ({ ...p, password: "" })); setBusy(""); seeded.current = null; refresh(); }
  };
  const test = async () => {
    setBusy("test"); setError(""); setNote(""); setTestResult("");
    try { await mailApi("/staff/mail/test", {}); setTestResult("Connection test passed for the saved settings."); }
    catch (err) { setError(msg(err, "Connection test failed.")); }
    finally { setBusy(""); refresh(); }
  };
  const d: MailStatus | undefined = s.data;
  if (s.isLoading) return <div className={box}><Skeleton /></div>;
  if (s.isError) return <div className={box}><Err>{msg(s.error, "Settings could not be loaded.")}</Err><button type="button" className={`${btn} mt-3`} onClick={() => void s.refetch()}>Retry</button></div>;
  return <form onSubmit={(e) => void save(e)} className={`${box} max-w-3xl space-y-4`} autoComplete="off">
    <h2 className="text-xl soso-display">Mail settings (owner only)</h2>
    <ul className="flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-wider">
      {[["Configured", d?.configured], ["Tested", d?.tested], ["Enabled", d?.enabled && d.tested ? true : false], ["Newsletter", d?.newsletterEnabled], ["Password stored", d?.hasPassword]].map(([l, v]) => <li key={String(l)} className={`border px-2 py-1 ${v ? "border-emerald-500/40 text-emerald-700" : "border-border text-muted-foreground"}`}>{l}: {v ? "yes" : "no"}</li>)}
    </ul>
    {d && d.enabled && !d.tested && <p className="text-xs text-amber-700">Sending is paused until these saved settings pass a connection test.</p>}
    <div className="grid gap-3 sm:grid-cols-2">
      <Lbl label="SMTP host"><input required className="staff-input mt-1" value={f.smtpHost} onChange={(e) => set("smtpHost", e.target.value)} /></Lbl>
      <Lbl label="SMTP security"><select className="staff-input mt-1" value={f.smtpPort} onChange={(e) => set("smtpPort", Number(e.target.value) as 465 | 587)}><option value={465}>465 - implicit TLS</option><option value={587}>587 - STARTTLS</option></select></Lbl>
      <Lbl label="IMAP host"><input required className="staff-input mt-1" value={f.imapHost} onChange={(e) => set("imapHost", e.target.value)} /></Lbl>
      <Lbl label="IMAP port"><input disabled className="staff-input mt-1" value="993 - TLS" readOnly /></Lbl>
      <Lbl label="Mailbox username"><input required autoComplete="off" className="staff-input mt-1" value={f.username} onChange={(e) => set("username", e.target.value)} /></Lbl>
      <Lbl label="Password (blank keeps current)"><input type="password" autoComplete="new-password" className="staff-input mt-1" value={f.password} onChange={(e) => set("password", e.target.value)} /></Lbl>
      <Lbl label="Sender name"><input required className="staff-input mt-1" value={f.fromName} onChange={(e) => set("fromName", e.target.value)} /></Lbl>
      <Lbl label="Storefront HTTPS origin"><input required type="url" pattern="https://.*" placeholder="https://your-storefront-domain" className="staff-input mt-1" value={f.publicOrigin} onChange={(e) => set("publicOrigin", e.target.value)} /></Lbl>
      <Lbl label="Hourly send limit"><input required type="number" min={0} max={10000} className="staff-input mt-1" value={f.hourlyLimit} onChange={(e) => set("hourlyLimit", Number(e.target.value))} /></Lbl>
    </div>
    <fieldset className="space-y-2 text-sm">
      <legend className="text-xs font-semibold uppercase tracking-wider">Permissions</legend>
      {([["enabled", "Enable correspondence sending"], ["newsletterEnabled", "Enable newsletter sending"], ["policyConfirmed", "I confirm the hosting provider permits this sending allowance and newsletters if enabled"]] as const).map(([k, l]) => <label key={k} className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={f[k]} onChange={(e) => set(k, e.target.checked)} />{l}</label>)}
    </fieldset>
    <Err>{error}</Err><Note>{note}</Note><Note>{testResult}</Note>
    <div className="flex flex-wrap gap-3"><button type="submit" disabled={busy !== ""} className={btnSolid}>{busy === "save" && <Loader2 size={14} className="animate-spin" />}Save settings</button>
      <button type="button" disabled={busy !== "" || !d?.configured} onClick={() => void test()} className={btn}>{busy === "test" && <Loader2 size={14} className="animate-spin" />}Test saved connection</button></div>
    {!d?.configured && <p className="text-xs text-muted-foreground">Save settings before testing.</p>}
  </form>;
}
