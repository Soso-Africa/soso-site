import { runBackup, backupView, checkpointKey } from "./backup.mjs";
import { checkDelivery } from "./delivery.mjs";

export async function runOperations(env, cron, request = fetch) {
  const daily = cron === env.DAILY_CRON;
  let backupError = false;
  if (daily) {
    try { await runBackup(env); } catch { backupError = true; }
  }
  const statusKey = env.STATUS_KEY || "operations/media-operations.json";
  // Separate scheduled invocations keep backup hashing and HTTP monitoring from
  // sharing the Free plan's CPU/subrequest budget.
  const previous = daily ? await env.SOURCE.get(statusKey) : null;
  const delivery = previous ? (await previous.json()).delivery : await checkDelivery(env, request);
  const checkpoint = await env.BACKUP.get(checkpointKey(env.BACKUP_PREFIX));
  const backup = checkpoint ? backupView(await checkpoint.json()) : null;
  if (backupError && backup) {
    backup.status = "failed";
    backup.messages = ["Daily backup could not run. Check the independent checkpoint and Worker invocation errors."];
  }
  const report = { version: 1, reportedAt: new Date().toISOString(), delivery, backup };
  await env.SOURCE.put(statusKey, JSON.stringify(report), {
    httpMetadata: { contentType: "application/json", cacheControl: "private, no-store" },
  });
  if (delivery.status !== "healthy") throw new Error("Media delivery check failed; inspect the private operations report");
  if (daily && (backupError || backup?.status !== "healthy")) throw new Error("Daily backup incomplete; inspect the private operations report");
}
