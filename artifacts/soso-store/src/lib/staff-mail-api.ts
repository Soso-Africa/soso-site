import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export type MailSettings = {
  smtpHost: string; smtpPort: 465 | 587; imapHost: string; imapPort: 993;
  username: string; fromName: string; publicOrigin: string;
  enabled: boolean; newsletterEnabled: boolean; policyConfirmed: boolean; hourlyLimit: number;
};
export type MailStatus = {
  configured: boolean; version: number; tested: boolean; enabled: boolean;
  newsletterEnabled: boolean; hasPassword: boolean; settings?: MailSettings;
};
export type MailList = {
  folder: "inbox" | "sent"; uidValidity: string;
  messages: { uid: number; subject: string; from: string; to: string; date: string | null; unread: boolean }[];
};
export type MailDetail = {
  uid: number; uidValidity: string; folder: "inbox" | "sent"; subject: string;
  from: string; replyTo: string; text: string; date: string | null;
  /** Server-sanitized HTML (no remote images/CSS/resources) or null for plain mail. */
  html: string | null;
  attachments: { index: number; name: string; size: number }[];
};
export type Subscriber = {
  id: string; email: string; status: "pending" | "confirmed" | "unsubscribed";
  policy_version: string; consented_at: string; confirmed_at: string | null; unsubscribed_at: string | null;
};
export type Campaign = {
  id: string; subject: string; body_text: string; body_html?: string | null; created_at: string;
  attempted: number; accepted: number; uncertain: number; remaining: number;
};
export function mailApi<T>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
  return customFetch<T>(`/api${path}`, {
    method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
}
export function useMailSettings(actor: string) {
  return useQuery({ queryKey: ["staff-mail-settings", actor], queryFn: () => mailApi<MailStatus>("/staff/mail/settings"), staleTime: 15000 });
}
export function useMailList(actor: string, folder: "inbox" | "sent", enabled: boolean) {
  return useQuery({ queryKey: ["staff-mail-list", actor, folder], queryFn: () => mailApi<MailList>(`/staff/mail/messages?folder=${folder}`), enabled, staleTime: 15000 });
}
export function useMailDetail(actor: string, message: { uid: number; uidValidity: string; folder: "inbox" | "sent" } | null) {
  return useQuery({ queryKey: ["staff-mail-detail", actor, message], queryFn: () => mailApi<MailDetail>(`/staff/mail/messages/${message!.uid}?folder=${message!.folder}&uidValidity=${message!.uidValidity}`), enabled: Boolean(message) });
}
export function useMailHistory(actor: string) {
  return useQuery({ queryKey: ["staff-mail-history", actor], queryFn: () => mailApi<{ sends: { id: string; recipient: string; subject: string; kind: string; status: string; created_at: string }[] }>("/staff/mail/history"), staleTime: 15000 });
}
export function useSubscribers(actor: string, status: string, before?: string) {
  return useQuery({ queryKey: ["staff-newsletter-subscribers", actor, status, before], queryFn: () => mailApi<{ subscribers: Subscriber[]; nextCursor: string | null }>(`/staff/newsletter/subscribers?status=${status}${before ? `&before=${before}` : ""}`), staleTime: 15000 });
}
export function useMailCampaigns(actor: string) {
  return useQuery({ queryKey: ["staff-newsletter-campaigns", actor], queryFn: () => mailApi<{ campaigns: Campaign[] }>("/staff/newsletter/campaigns"), staleTime: 15000 });
}

export type SubscriberGroup = { id: string; name: string; total: number; confirmed: number };
export type SubscriberWithGroups = Subscriber & { groups: { id: string; name: string }[] };
export type CampaignWithAudience = Campaign & { group_id: string | null; group_name: string | null };
export const SUBSCRIBER_STATUSES = ["all", "pending", "confirmed", "unsubscribed"] as const;

export function subscriberQuery(status: string, groupId?: string, before?: string) {
  const p = new URLSearchParams({ status });
  if (groupId) p.set("groupId", groupId);
  if (before) p.set("before", before);
  return p.toString();
}
export function useSubscriberGroups(actor: string) {
  return useQuery({ queryKey: ["staff-newsletter-groups", actor], queryFn: () => mailApi<{ groups: SubscriberGroup[] }>("/staff/newsletter/groups"), staleTime: 15000 });
}
export function useGroupedSubscribers(actor: string, status: string, groupId: string, before?: string) {
  return useQuery({ queryKey: ["staff-newsletter-subscribers", actor, status, groupId, before], queryFn: () => mailApi<{ subscribers: SubscriberWithGroups[]; nextCursor: string | null }>(`/staff/newsletter/subscribers?${subscriberQuery(status, groupId || undefined, before)}`), staleTime: 15000 });
}
export function useAudienceCampaigns(actor: string) {
  return useQuery({ queryKey: ["staff-newsletter-campaigns", actor], queryFn: () => mailApi<{ campaigns: CampaignWithAudience[] }>("/staff/newsletter/campaigns"), staleTime: 15000 });
}
export const groupsApi = {
  create: (name: string) => mailApi<{ id: string }>("/staff/newsletter/groups", { name }),
  rename: (id: string, name: string) => mailApi(`/staff/newsletter/groups/${id}`, { name }, "PATCH"),
  remove: (id: string) => customFetch(`/api/staff/newsletter/groups/${id}`, { method: "DELETE" }),
  members: (id: string, subscriberIds: string[], action: "add" | "remove") => {
    if (subscriberIds.length > 500) throw new Error("At most 500 subscribers can be changed at once.");
    return mailApi(`/staff/newsletter/groups/${id}/members`, { subscriberIds, action }, "PUT");
  },
};
export function setCampaignAudience(id: string, groupId: string | null) {
  return mailApi(`/staff/newsletter/campaigns/${id}/audience`, { groupId }, "PATCH");
}
export function errorStatus(e: unknown): number | undefined {
  const s = (e as { status?: unknown })?.status;
  return typeof s === "number" ? s : undefined;
}
export function exportFileName(status: string, groupName?: string) {
  const slug = (groupName ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `subscribers-${status}${slug ? `-${slug}` : ""}-${new Date().toISOString().slice(0, 10)}.xlsx`;
}
/** Downloads every matching subscriber (not just the visible page) as .xlsx via the authenticated client. */
export async function exportSubscribers(status: string, groupId: string, groupName?: string) {
  const blob = await customFetch<Blob>(`/api/staff/newsletter/subscribers/export?${subscriberQuery(status, groupId || undefined)}`, { method: "GET", responseType: "blob", headers: { Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/json" } });
  if (!(blob instanceof Blob) || blob.size === 0) throw new Error("The export was empty or invalid.");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = exportFileName(status, groupName);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type OutgoingAttachment = { name: string; size: number; contentBase64: string };
/** Fetches one incoming attachment only when staff explicitly asks for it, then saves it locally. */
export async function downloadMailAttachment(ref: { uid: number; uidValidity: string; folder: "inbox" | "sent" }, index: number, name: string) {
  const q = new URLSearchParams({ folder: ref.folder, uidValidity: ref.uidValidity });
  const blob = await customFetch<Blob>(`/api/staff/mail/messages/${ref.uid}/attachments/${index}?${q}`, { method: "GET", responseType: "blob" });
  if (!(blob instanceof Blob)) throw new Error("The attachment response was invalid.");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name || `attachment-${index}`; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
