import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const vercel = JSON.parse(await readFile(new URL("../../../vercel.json", import.meta.url), "utf8"));
const routes = vercel.routes;
const registeredPath = routes.findIndex((route) => route.src === "/webhook/commerce");
const fallback = routes.findIndex((route) => route.dest === "/spa-fallback");

assert.ok(registeredPath >= 0 && registeredPath < fallback, "JusticeSure webhook must be routed before the SPA fallback.");
assert.equal(routes[registeredPath].dest, "/api/handler?__soso_path=payment/webhook");
assert.ok(!routes[registeredPath].methods || routes[registeredPath].methods.includes("POST"), "Registered webhook must accept POST.");

process.stdout.write("Registered JusticeSure webhook routes to the API before the SPA fallback.\n");