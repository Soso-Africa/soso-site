import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryObserver, focusManager, onlineManager } from "@tanstack/react-query";
import { readFile } from "node:fs/promises";
import { staffManualRefreshQuery } from "./staff-query-policy";

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

test("manual Staff queries load once, explicit refresh and successful mutation invalidation still fetch", async () => {
  const client = new QueryClient();
  client.mount();
  let reads = 0;
  const observer = new QueryObserver(client, {
    ...staffManualRefreshQuery,
    queryKey: ["staff-budget-fixture"],
    queryFn: async () => ++reads,
  });
  const unsubscribe = observer.subscribe(() => {});
  try {
    await settle();
    assert.equal(reads, 1);
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
    await settle();
    assert.equal(reads, 1, "focus and reconnect must not fetch");
    await observer.refetch();
    assert.equal(reads, 2, "Refresh must remain functional");
    await client.invalidateQueries({ queryKey: ["staff-budget-fixture"] });
    assert.equal(reads, 3, "a completed write can refresh its active list");
    assert.equal(staffManualRefreshQuery.refetchInterval, false);
    assert.equal(staffManualRefreshQuery.retry, false);
  } finally {
    unsubscribe();
    client.unmount();
    client.clear();
    focusManager.setFocused(undefined);
    onlineManager.setOnline(true);
  }
});

test("Staff timer regressions do not reintroduce catalogue, Drive or dashboard polling", async () => {
  for (const path of [
    "../pages/Staff.tsx",
    "../components/staff/PlatformEditorCatalogue.tsx",
    "../components/staff/import/DriveConnection.tsx",
  ]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /setInterval\s*\(|refetchInterval\s*:/, path);
  }
  const staff = await readFile(new URL("../pages/Staff.tsx", import.meta.url), "utf8");
  assert.match(staff, /Refresh lists &amp; alerts|Refresh lists & alerts/);
  assert.match(staff, /refetchType: "active"/, "mutation invalidation must stay scoped to open lists");
});
