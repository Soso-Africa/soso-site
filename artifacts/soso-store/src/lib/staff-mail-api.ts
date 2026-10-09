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
  attachments: { name: string; size: number }[];
};
export type Subscriber = {
  id: string; email: string; status: "pending" | "confirmed" | "unsubscribed";
  policy_version: string; consented_at: string; confirmed_at: string | null; unsubscribed_at: string | null;
};
export type Campaign = {
  id: string; subject: string; body_text: string; created_at: string;
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
