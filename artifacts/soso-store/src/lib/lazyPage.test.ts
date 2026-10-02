import assert from "node:assert/strict";
import test from "node:test";
import {
  getPageErrorRecoveryAction,
  loadPageModule,
  PageLoadError,
} from "./lazyPage";

test("rejected lazy imports are marked for a fresh-shell reload", async () => {
  const importFailure = new Error("Failed to fetch dynamically imported module");

  await assert.rejects(
    loadPageModule(async () => {
      throw importFailure;
    }),
    (error: unknown) => {
      assert.ok(error instanceof PageLoadError);
      assert.equal(error.cause, importFailure);
      assert.equal(getPageErrorRecoveryAction(error), "reload");
      return true;
    },
  );
});

test("successful imports and page runtime errors keep normal boundary reset behavior", async () => {
  const module = { default: () => null };
  assert.equal(await loadPageModule(async () => module), module);

  const runtimeError = new Error("Page render failed");
  assert.equal(getPageErrorRecoveryAction(runtimeError), "reset");
});