import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

test("disabled Staff sections defer invalidated data until the section is reopened", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let requests = 0;
  const options = {
    queryKey: ["staff-orders", "synthetic-staff"],
    queryFn: async () => ++requests,
    enabled: false,
  };
  const observer = new QueryObserver(client, options);
  const stop = observer.subscribe(() => {});
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  try {
    await settle();
    assert.equal(requests, 0);
    observer.setOptions({ ...options, enabled: true });
    await settle();
    assert.equal(requests, 1);
    observer.setOptions(options);
    await client.invalidateQueries({ queryKey: ["staff-orders"], refetchType: "active" });
    await settle();
    assert.equal(requests, 1);
    observer.setOptions({ ...options, enabled: true });
    await settle();
    assert.equal(requests, 2);
    assert.equal(observer.getCurrentResult().data, 2);
  } finally {
    stop();
    client.clear();
  }
});