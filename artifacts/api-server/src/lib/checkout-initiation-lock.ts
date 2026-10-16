import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { pool } from "@workspace/db";

// Lock holders span provider calls, while intent/projection writes must commit
// independently. They must never reserve connections from the data pool: enough
// distinct active quotes could otherwise starve their own reads and writes.
// This bounded pool queues excess lock holders without blocking durable work.
export const checkoutInitiationLockPool = new pg.Pool({
  ...pool.options,
  idleTimeoutMillis: 1_000,
});
export const checkoutInitiationLockDb = drizzle(checkoutInitiationLockPool);
