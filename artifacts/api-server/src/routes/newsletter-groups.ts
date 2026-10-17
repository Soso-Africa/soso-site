import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { z } from "zod";
import { requireStaff, requireStaffRoles } from "../middlewares/staff";
import { ensureMailSchema, freshMailPermission, mailTransaction, rateLimit } from "../lib/staff-mail-store";
import { MailError } from "../lib/staff-mail-security";
import { appendSubscriberRow, createSubscriberWorkbook, groupInput, membersInput, subscriberFilters, type ExportSubscriber } from "../lib/newsletter-audience";

const router: IRouter = Router();
router.use(requireStaff, requireStaffRoles("owner", "administrator"));
function action(run: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    res.set("Cache-Control", "private, no-store");
    try {
      await freshMailPermission(req.staff!.id);
      await ensureMailSchema();
      await run(req, res);
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      if (error instanceof z.ZodError) { res.status(400).json({ error: "Check the group name, subscriber selection and filters." }); return; }
      if (error instanceof MailError) { res.status(error.status).json({ error: error.message }); return; }
      const code = (error as { code?: string }).code;
      if (code === "23505") { res.status(409).json({ error: "A group with that name already exists." }); return; }
      if (code === "23503") { res.status(409).json({ error: "A group used by a campaign cannot be deleted. A selected group or subscriber may also have changed; refresh and try again." }); return; }
      res.status(503).json({ error: "Subscriber groups or export could not be processed. Please try again." });
    }
  };
}
router.get("/groups", action(async (_req, res) => {
  const rows = await pool.query(`SELECT g.id,g.name,count(n.id)::int AS total,
    count(n.id) FILTER(WHERE n.status='confirmed')::int AS confirmed
    FROM soso_newsletter_groups g LEFT JOIN soso_newsletter_group_members m ON m.group_id=g.id
    LEFT JOIN soso_newsletter_subscribers n ON n.id=m.subscriber_id
    GROUP BY g.id ORDER BY lower(g.name),g.id`);
  res.json({ groups: rows.rows });
}));
router.post("/groups", action(async (req, res) => {
  const input = groupInput.parse(req.body);
  const row = await pool.query("INSERT INTO soso_newsletter_groups(name) VALUES($1) RETURNING id", [input.name]);
  res.status(201).json(row.rows[0]);
}));
router.patch("/groups/:id", action(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id), input = groupInput.parse(req.body);
  const row = await pool.query("UPDATE soso_newsletter_groups SET name=$2 WHERE id=$1 RETURNING id", [id, input.name]);
  if (!row.rowCount) throw new MailError("Group not found.", 404);
  res.json({ saved: true });
}));
router.delete("/groups/:id", action(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const row = await pool.query("DELETE FROM soso_newsletter_groups WHERE id=$1 RETURNING id", [id]);
  if (!row.rowCount) throw new MailError("Group not found.", 404);
  res.json({ deleted: true });
}));
router.put("/groups/:id/members", action(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id), input = membersInput.parse(req.body);
  await mailTransaction(async (connection) => {
    await freshMailPermission(req.staff!.id, false, connection);
    const group = await connection.query("SELECT id FROM soso_newsletter_groups WHERE id=$1 FOR UPDATE", [id]);
    if (!group.rowCount) throw new MailError("Group not found.", 404);
    if (input.action === "add") {
      await connection.query(`INSERT INTO soso_newsletter_group_members(group_id,subscriber_id)
        SELECT $1,unnest($2::uuid[]) ON CONFLICT DO NOTHING`, [id, [...new Set(input.subscriberIds)]]);
    } else {
      await connection.query("DELETE FROM soso_newsletter_group_members WHERE group_id=$1 AND subscriber_id=ANY($2::uuid[])", [id, input.subscriberIds]);
    }
  });
  res.json({ saved: true });
}));
router.get("/subscribers/export", action(async (req, res) => {
  const filters = subscriberFilters.parse(req.query);
  await rateLimit(`newsletter-export:${req.staff!.id}`, 6, 600);
  const { workbook, sheet } = createSubscriberWorkbook();
  // One repeatable read snapshot covers every matching row, independently of
  // the UI's 50-row pages. Explicitly reject oversized synchronous exports.
  await mailTransaction(async (connection) => {
    await connection.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await connection.query("SET LOCAL statement_timeout = '15s'");
    const params = [filters.status, filters.groupId ?? null];
    const where = `($1='all' OR n.status=$1) AND ($2::uuid IS NULL OR EXISTS(
      SELECT 1 FROM soso_newsletter_group_members m WHERE m.subscriber_id=n.id AND m.group_id=$2))`;
    const count = Number((await connection.query(`SELECT count(*) FROM soso_newsletter_subscribers n WHERE ${where}`, params)).rows[0].count);
    if (count > 50000) throw new MailError("This export exceeds 50,000 subscribers. Choose a group or status to narrow it; nothing has been exported.", 413);
    let cursor: string | null = null;
    for (;;) {
      const rows: ExportSubscriber[] = (await connection.query<ExportSubscriber>(`SELECT n.*,
        COALESCE((SELECT string_agg(g.name,', ' ORDER BY lower(g.name)) FROM soso_newsletter_group_members m
          JOIN soso_newsletter_groups g ON g.id=m.group_id WHERE m.subscriber_id=n.id),'') AS group_names
        FROM soso_newsletter_subscribers n WHERE ${where} AND ($3::uuid IS NULL OR n.id>$3)
        ORDER BY n.id LIMIT 1000`, [...params, cursor])).rows;
      for (const row of rows) appendSubscriberRow(sheet, row);
      if (rows.length < 1000) break;
      cursor = rows[rows.length - 1].id;
    }
  });
  const bytes = await workbook.xlsx.writeBuffer();
  res.set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.set("Content-Disposition", `attachment; filename="soso-subscribers-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.send(Buffer.from(bytes));
}));
export default router;
