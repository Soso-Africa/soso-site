import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { withStaffAccessMutationLock } from "./staff";

type TestStaffRow = {
  id: string;
  role: string;
  is_active: boolean;
};

test("concurrent staff access changes cannot remove every active owner", async () => {
  const tableName = `soso_staff_access_race_${randomUUID().replaceAll("-", "")}`;
  const table = sql.identifier(tableName);

  await db.execute(sql`
    create table ${table} (
      id text primary key,
      role text not null,
      is_active boolean not null
    )
  `);

  try {
    await db.execute(sql`
      insert into ${table} (id, role, is_active)
      values ('owner-a', 'owner', true), ('owner-b', 'owner', true), ('stylist', 'stylist', true)
    `);

    const removeOwner = (id: string, change: "deactivate" | "change-role") =>
      withStaffAccessMutationLock(async (tx) => {
        const targetResult = await tx.execute(sql`
          select id, role, is_active
          from ${table}
          where id = ${id}
        `);
        const target = targetResult.rows[0] as TestStaffRow | undefined;
        assert.ok(target);

        const countResult = await tx.execute(sql`
          select count(*)::integer as value
          from ${table}
          where role = 'owner' and is_active = true
        `);
        const ownerCount = Number((countResult.rows[0] as { value: number }).value);
        if (target.role === "owner" && target.is_active && ownerCount <= 1) {
          return "blocked" as const;
        }

        if (change === "deactivate") {
          await tx.execute(sql`update ${table} set is_active = false where id = ${id}`);
        } else {
          await tx.execute(sql`update ${table} set role = 'operations' where id = ${id}`);
        }
        return "updated" as const;
      });

    const outcomes = await Promise.all([
      removeOwner("owner-a", "deactivate"),
      removeOwner("owner-b", "change-role"),
    ]);

    assert.deepEqual([...outcomes].sort(), ["blocked", "updated"]);

    const ownersResult = await db.execute(sql`
      select count(*)::integer as value
      from ${table}
      where role = 'owner' and is_active = true
    `);
    assert.equal(Number((ownersResult.rows[0] as { value: number }).value), 1);

    const ordinaryChange = await withStaffAccessMutationLock(async (tx) => {
      await tx.execute(sql`update ${table} set role = 'operations' where id = 'stylist'`);
      return "updated" as const;
    });
    assert.equal(ordinaryChange, "updated");

    const staffResult = await db.execute(sql`
      select id, role, is_active
      from ${table}
      where id = 'stylist'
    `);
    assert.deepEqual(staffResult.rows[0], {
      id: "stylist",
      role: "operations",
      is_active: true,
    });
  } finally {
    await db.execute(sql`drop table if exists ${table}`);
  }
});