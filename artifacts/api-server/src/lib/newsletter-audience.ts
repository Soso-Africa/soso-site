import { z } from "zod";
import ExcelJS from "exceljs";

export const subscriberFilters = z.object({
  status: z.enum(["all", "pending", "confirmed", "unsubscribed"]).default("all"),
  groupId: z.string().uuid().optional(),
  before: z.string().uuid().optional(),
});
export const audienceInput = z.object({ groupId: z.string().uuid().nullable() }).strict();
export const groupInput = z.object({ name: z.string().trim().min(1).max(80).regex(/^[^\u0000-\u001f\u007f]+$/) }).strict();
export const membersInput = z.object({
  subscriberIds: z.array(z.string().uuid()).min(1).max(500),
  action: z.enum(["add", "remove"]),
}).strict();

// Shared predicate for campaign counts and batch selection. Consent is checked
// again inside the durable per-recipient reservation, not only by this query.
export const campaignAudienceSQL = `(c.group_id IS NULL OR EXISTS (
 SELECT 1 FROM soso_newsletter_group_members gm WHERE gm.group_id=c.group_id AND gm.subscriber_id=n.id))`;

export type ExportSubscriber = {
  id: string; email: string; status: string; policy_version: string;
  consented_at: Date | string; confirmed_at: Date | string | null;
  unsubscribed_at: Date | string | null; group_names: string;
};
export function createSubscriberWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SOSO Africa";
  const sheet = workbook.addWorksheet("Subscribers");
  sheet.columns = [
    { header: "Subscriber ID", key: "id", width: 38 },
    { header: "Email", key: "email", width: 38 },
    { header: "Status", key: "status", width: 18 },
    { header: "Groups", key: "groups", width: 40 },
    { header: "Consent policy", key: "policy", width: 24 },
    { header: "Consented at (UTC)", key: "consented", width: 28 },
    { header: "Confirmed at (UTC)", key: "confirmed", width: 28 },
    { header: "Unsubscribed at (UTC)", key: "unsubscribed", width: 28 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = "A1:H1";
  return { workbook, sheet };
}
export function appendSubscriberRow(sheet: ExcelJS.Worksheet, row: ExportSubscriber) {
  const date = (value: Date | string | null) => value ? new Date(value).toISOString() : "";
  // ExcelJS string values are literal strings, never formula objects. Addresses
  // and group names beginning with =,+,-,@ cannot become spreadsheet formulas.
  sheet.addRow([
    row.id, row.email, row.status, row.group_names, row.policy_version,
    date(row.consented_at), date(row.confirmed_at), date(row.unsubscribed_at),
  ]);
}
