import { FormEvent, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FolderPlus, Loader2, Pencil, Trash2, UserMinus, UserPlus } from "lucide-react";
import {
  errorStatus, exportSubscribers, groupsApi, mailApi, useGroupedSubscribers, useSubscriberGroups, SUBSCRIBER_STATUSES,
} from "@/lib/staff-mail-api";

const btn = "inline-flex min-h-10 items-center justify-center gap-2 border border-primary px-4 text-xs font-semibold uppercase tracking-wider text-primary hover:bg-primary/5 disabled:opacity-50";
const btnSolid = "inline-flex min-h-10 items-center justify-center gap-2 bg-primary px-4 text-xs font-semibold uppercase tracking-wider text-primary-foreground disabled:opacity-50";
const msg = (e: unknown, f: string) => (e instanceof Error && e.message ? e.message : f);
const when = (v: string | null) => { const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleString() : "Unknown date"; };
const KEYS = ["staff-newsletter-subscribers", "staff-newsletter-groups", "staff-newsletter-campaigns", "staff-mail-history"];

function Err({ children }: { children?: React.ReactNode }) {
  return children ? <p role="alert" className="mt-3 border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{children}</p> : null;
}
function Note({ children }: { children?: React.ReactNode }) {
  return children ? <p role="status" className="mt-3 border border-primary/25 bg-primary/5 p-3 text-sm">{children}</p> : null;
}
function Skeleton() {
  return <div aria-busy="true" className="space-y-2 p-5">{[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse bg-muted/60" />)}</div>;
}

export function SubscriberGroupsPanel({ actor }: { actor: string }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const [groupId, setGroupId] = useState("");
  const [stack, setStack] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState("");
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(""); const [error, setError] = useState(""); const [note, setNote] = useState("");
  const q = useGroupedSubscribers(actor, status, groupId, stack[stack.length - 1]);
  const g = useSubscriberGroups(actor);
  const groups = g.data?.groups ?? [];
  const rows = q.data?.subscribers ?? [];
  const refresh = () => { for (const k of KEYS) void qc.invalidateQueries({ queryKey: [k], refetchType: "active" }); };
  const resetPage = () => { setStack([]); setSelected(new Set()); };
  const run = async (key: string, fn: () => Promise<unknown>, ok: string, fail: (e: unknown) => string) => {
    setBusy(key); setError(""); setNote("");
    try { await fn(); setNote(ok); return true; } catch (e) { setError(fail(e)); return false; } finally { setBusy(""); refresh(); }
  };
  const toggle = (id: string) => setSelected((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const create = async (e: FormEvent) => {
    e.preventDefault(); const name = newName.trim(); if (!name) return;
    if (await run("create", () => groupsApi.create(name), `Group "${name}" created.`, (x) => msg(x, "Group could not be created."))) setNewName("");
  };
  const rename = async (e: FormEvent) => {
    e.preventDefault(); if (!editing) return; const name = editing.name.trim(); if (!name) return;
    if (await run(`rename-${editing.id}`, () => groupsApi.rename(editing.id, name), `Group renamed to "${name}".`, (x) => msg(x, "Group could not be renamed."))) setEditing(null);
  };
  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Delete group "${name}"? Subscribers are not deleted, only their membership in this group.`)) return;
    const ok = await run(`del-${id}`, () => groupsApi.remove(id), `Group "${name}" deleted.`, (x) => errorStatus(x) === 409
      ? `"${name}" is the audience of at least one campaign, so it cannot be deleted. Change those campaigns' audience first (only possible before any send attempt); campaigns that have already started keep their group for the record.`
      : msg(x, "Group could not be deleted."));
    if (ok && groupId === id) { setGroupId(""); resetPage(); }
    if (ok && target === id) setTarget("");
  };
  const members = (action: "add" | "remove") => {
    const ids = [...selected]; const grp = groups.find((x) => x.id === target); if (!grp || !ids.length) return;
    void run(`members-${action}`, () => groupsApi.members(grp.id, ids, action),
      `${ids.length} subscriber${ids.length === 1 ? "" : "s"} ${action === "add" ? "added to" : "removed from"} "${grp.name}".`,
      (x) => msg(x, "Membership could not be updated.")).then((ok) => { if (ok) setSelected(new Set()); });
  };
  const doExport = () => {
    const name = groups.find((x) => x.id === groupId)?.name;
    void run("export", () => exportSubscribers(status, groupId, name), "Excel export downloaded with every matching subscriber and consent timestamps.", (x) => msg(x, "Export failed."));
  };
  const act = async (id: string, kind: "confirmation" | "unsubscribe", email: string) => {
    if (kind === "unsubscribe" && !window.confirm(`Unsubscribe ${email}? They will stop receiving newsletters.`)) return;
    await run(id, () => mailApi(`/staff/newsletter/subscribers/${id}/${kind}`, {}), kind === "confirmation" ? `Confirmation email requested for ${email}.` : `${email} unsubscribed.`, (x) => msg(x, "The action failed."));
  };

  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
    <div className="border border-border bg-card">
      <div className="flex flex-wrap items-end gap-3 border-b border-border p-3">
        <label className="text-xs font-medium">Status<select data-testid="select-status" className="staff-input mt-1 w-auto" value={status} onChange={(e) => { setStatus(e.target.value); resetPage(); }}>{SUBSCRIBER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
        <label className="text-xs font-medium">Group<select data-testid="select-group-filter" className="staff-input mt-1 w-auto" value={groupId} onChange={(e) => { setGroupId(e.target.value); resetPage(); }}><option value="">All subscribers</option>{groups.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <button type="button" data-testid="button-export" className={`${btn} ml-auto`} disabled={busy === "export"} onClick={doExport}>{busy === "export" ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}Export Excel</button>
      </div>
      <p className="border-b border-border px-3 py-2 text-[11px] text-muted-foreground">Export includes every subscriber matching the current status and group (all pages), with consent, confirmation and unsubscribe timestamps.</p>
      <div className="flex flex-wrap items-end gap-2 border-b border-border bg-muted/30 p-3">
        <span className="text-xs font-semibold" data-testid="text-selected-count">{selected.size} selected on this page</span>
        <label className="text-xs font-medium">Target group<select data-testid="select-target-group" className="staff-input mt-1 w-auto" value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Choose group</option>{groups.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <button type="button" data-testid="button-add-members" className={btn} disabled={!target || !selected.size || busy !== ""} onClick={() => members("add")}><UserPlus size={13} />Add selected</button>
        <button type="button" data-testid="button-remove-members" className={btn} disabled={!target || !selected.size || busy !== ""} onClick={() => members("remove")}><UserMinus size={13} />Remove selected</button>
      </div>
      <div className="px-3"><Err>{error}</Err><Note>{note}</Note></div>
      {q.isLoading ? <Skeleton /> : q.isError ? <div className="p-4"><Err>{msg(q.error, "Subscribers could not be loaded.")}</Err><button type="button" className={`${btn} mt-3`} onClick={() => void q.refetch()}>Retry</button></div>
        : !rows.length ? <p className="p-8 text-center text-sm text-muted-foreground">No subscribers match these filters.</p> : <>
          <label className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs"><input type="checkbox" data-testid="checkbox-select-page" checked={allOn} onChange={() => setSelected(allOn ? new Set() : new Set(rows.map((r) => r.id)))} />Select all on this page</label>
          <ul className="divide-y divide-border">{rows.map((s) => <li key={s.id} data-testid={`row-subscriber-${s.id}`} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex min-w-0 items-start gap-3"><input type="checkbox" className="mt-1" aria-label={`Select ${s.email}`} checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
              <span className="min-w-0"><span className="block break-all text-sm font-medium">{s.email}</span>
                <span className="block text-xs text-muted-foreground">{s.status} - consented {when(s.consented_at)}{s.confirmed_at ? ` - confirmed ${when(s.confirmed_at)}` : ""}{s.unsubscribed_at ? ` - unsubscribed ${when(s.unsubscribed_at)}` : ""}</span>
                {(s.groups ?? []).length > 0 && <span className="mt-1 flex flex-wrap gap-1">{s.groups.map((x) => <span key={x.id} className="border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-foreground">{x.name}</span>)}</span>}</span></label>
            <div className="flex gap-2">{s.status === "pending" && <button type="button" className={btn} disabled={busy === s.id} onClick={() => void act(s.id, "confirmation", s.email)}>Resend confirmation</button>}
              {s.status !== "unsubscribed" && <button type="button" className={btn} disabled={busy === s.id} onClick={() => void act(s.id, "unsubscribe", s.email)}>Unsubscribe</button>}</div></li>)}</ul></>}
      <div className="flex justify-between border-t border-border p-3"><button type="button" className={btn} disabled={!stack.length} onClick={() => { setStack(stack.slice(0, -1)); setSelected(new Set()); }}>Previous</button>
        <button type="button" className={btn} disabled={!q.data?.nextCursor} onClick={() => { if (q.data?.nextCursor) { setStack([...stack, q.data.nextCursor]); setSelected(new Set()); } }}>Next</button></div>
    </div>

    <aside className="h-fit border border-border bg-card" aria-label="Subscriber groups">
      <div className="border-b border-border p-3"><p className="text-xs font-semibold uppercase tracking-wider">Groups</p>
        <p className="mt-1 text-[11px] text-muted-foreground">Groups only organise contacts. They never grant consent: campaigns reach confirmed subscribers only.</p></div>
      <form onSubmit={(e) => void create(e)} className="flex gap-2 border-b border-border p-3">
        <input data-testid="input-new-group" required maxLength={80} placeholder="New group name" className="staff-input" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button type="submit" data-testid="button-create-group" className={btnSolid} disabled={busy === "create"} aria-label="Create group">{busy === "create" ? <Loader2 size={14} className="animate-spin" /> : <FolderPlus size={14} />}</button>
      </form>
      {g.isLoading ? <Skeleton /> : g.isError ? <div className="p-3"><Err>{msg(g.error, "Groups could not be loaded.")}</Err><button type="button" className={`${btn} mt-3`} onClick={() => void g.refetch()}>Retry</button></div>
        : !groups.length ? <p className="p-6 text-center text-xs text-muted-foreground">No groups yet. Create one, then select subscribers to add them.</p> :
        <ul className="divide-y divide-border">{groups.map((x) => <li key={x.id} data-testid={`row-group-${x.id}`} className="p-3">
          {editing?.id === x.id ? <form onSubmit={(e) => void rename(e)} className="flex gap-2">
            <input autoFocus required maxLength={80} aria-label="Group name" className="staff-input" value={editing.name} onChange={(e) => setEditing({ id: x.id, name: e.target.value })} />
            <button type="submit" className={btnSolid} disabled={busy === `rename-${x.id}`}>Save</button>
            <button type="button" className={btn} onClick={() => setEditing(null)}>Cancel</button></form>
            : <div className="flex items-center justify-between gap-2"><button type="button" className="min-w-0 text-left" onClick={() => { setGroupId(x.id); resetPage(); }}>
              <span className={`block truncate text-sm font-medium ${groupId === x.id ? "text-primary" : ""}`}>{x.name}</span>
              <span className="block text-[11px] text-muted-foreground">{x.total} members - {x.confirmed} confirmed</span></button>
              <span className="flex shrink-0 gap-1"><button type="button" aria-label={`Rename ${x.name}`} className="p-2 text-muted-foreground hover:text-foreground" onClick={() => setEditing({ id: x.id, name: x.name })}><Pencil size={14} /></button>
                <button type="button" aria-label={`Delete ${x.name}`} className="p-2 text-muted-foreground hover:text-destructive" disabled={busy === `del-${x.id}`} onClick={() => void remove(x.id, x.name)}><Trash2 size={14} /></button></span></div>}
        </li>)}</ul>}
    </aside>
  </div>;
}
