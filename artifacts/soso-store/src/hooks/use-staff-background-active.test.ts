import assert from "node:assert/strict";
import test from "node:test";
import { observeStaffBackgroundActivity, STAFF_BACKGROUND_IDLE_MS } from "./use-staff-background-active";

test("hidden and unattended Staff tabs stop polling; interaction resumes it", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  const source = new EventTarget() as EventTarget & { visibilityState: string };
  source.visibilityState = "visible";
  Object.defineProperty(globalThis, "document", { configurable: true, value: source });
  const states: boolean[] = [];
  const stop = observeStaffBackgroundActivity((value) => states.push(value));
  try {
    assert.deepEqual(states, [true]);
    t.mock.timers.tick(STAFF_BACKGROUND_IDLE_MS);
    assert.deepEqual(states, [true, false]);
    source.dispatchEvent(new Event("keydown"));
    assert.deepEqual(states, [true, false, true]);
    t.mock.timers.tick(STAFF_BACKGROUND_IDLE_MS - 1);
    source.dispatchEvent(new Event("scroll"));
    t.mock.timers.tick(1);
    assert.equal(states.at(-1), true);
    source.visibilityState = "hidden";
    source.dispatchEvent(new Event("visibilitychange"));
    assert.equal(states.at(-1), false);
    source.dispatchEvent(new Event("pointerdown"));
    assert.equal(states.at(-1), false);
    source.visibilityState = "visible";
    source.dispatchEvent(new Event("visibilitychange"));
    assert.equal(states.at(-1), true);
    stop();
    const count = states.length;
    t.mock.timers.tick(STAFF_BACKGROUND_IDLE_MS * 2);
    source.dispatchEvent(new Event("pointerdown"));
    assert.equal(states.length, count);
  } finally {
    stop();
    if (original) Object.defineProperty(globalThis, "document", original);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("a Staff tab opened in the background does not start optional refreshes", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  const source = new EventTarget() as EventTarget & { visibilityState: string };
  source.visibilityState = "hidden";
  Object.defineProperty(globalThis, "document", { configurable: true, value: source });
  const states: boolean[] = [];
  const stop = observeStaffBackgroundActivity((value) => states.push(value));
  try {
    t.mock.timers.tick(STAFF_BACKGROUND_IDLE_MS * 2);
    assert.deepEqual(states, [false]);
  } finally {
    stop();
    if (original) Object.defineProperty(globalThis, "document", original);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
