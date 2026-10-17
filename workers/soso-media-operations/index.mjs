import { WorkerEntrypoint } from "cloudflare:workers";
import { copyOriginal } from "./backup.mjs";
import { runOperations } from "./coordinator.mjs";

export class BackupExecutor extends WorkerEntrypoint {
  async copy(job) { return copyOriginal(this.env, job); }
}

export default {
  async fetch() { return new Response("Not found", { status: 404 }); },
  async scheduled(event, env, ctx) {
    // A temporary minute trigger is solely for initial release qualification.
    // Its binding must expire even if the operator is interrupted before removal.
    if (event.cron === "* * * * *"
      && !(Date.now() < Date.parse(env.INITIAL_QUALIFICATION_UNTIL || ""))) return;
    ctx.waitUntil(runOperations(env, event.cron));
  },
};
