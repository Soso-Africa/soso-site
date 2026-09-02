import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mapScrollToTurnState } from "./MaterialTurnStage";

describe("MaterialTurnStage Mapping", () => {
  const TOTAL_SETS = 3;
  const TOTAL_STATES = TOTAL_SETS * 2; // 6 states: 0F, 0B, 1F, 1B, 2F, 2B
  const MAX_SCROLL = 1000;

  test("returns initial state at top", () => {
    const { activeSetIndex, activeView, stateFloat } = mapScrollToTurnState(0, MAX_SCROLL, TOTAL_STATES);
    assert.equal(activeSetIndex, 0);
    assert.equal(activeView, "front");
    assert.equal(stateFloat, 0);
  });

  test("returns final state at bottom", () => {
    const { activeSetIndex, activeView, stateFloat } = mapScrollToTurnState(MAX_SCROLL, MAX_SCROLL, TOTAL_STATES);
    assert.equal(activeSetIndex, 2); // (6-1)/2 floor
    assert.equal(activeView, "back");
    assert.equal(stateFloat, 5);
  });

  test("progresses sequentially through states", () => {
    // State 0: 0F (0)
    let s = mapScrollToTurnState(0, MAX_SCROLL, TOTAL_STATES);
    assert.equal(s.activeSetIndex, 0);
    assert.equal(s.activeView, "front");

    // State 1: 0B (1.0 on stateFloat) -> scroll = 200
    s = mapScrollToTurnState(200, MAX_SCROLL, TOTAL_STATES);
    assert.equal(s.activeSetIndex, 0);
    assert.equal(s.activeView, "back");

    // State 2: 1F (2.0) -> scroll = 400
    s = mapScrollToTurnState(400, MAX_SCROLL, TOTAL_STATES);
    assert.equal(s.activeSetIndex, 1);
    assert.equal(s.activeView, "front");

    // State 3: 1B (3.0) -> scroll = 600
    s = mapScrollToTurnState(600, MAX_SCROLL, TOTAL_STATES);
    assert.equal(s.activeSetIndex, 1);
    assert.equal(s.activeView, "back");

    // State 4: 2F (4.0) -> scroll = 800
    s = mapScrollToTurnState(800, MAX_SCROLL, TOTAL_STATES);
    assert.equal(s.activeSetIndex, 2);
    assert.equal(s.activeView, "front");

    // State 5: 2B (5.0) -> scroll = 1000
    s = mapScrollToTurnState(1000, MAX_SCROLL, TOTAL_STATES);
    assert.equal(s.activeSetIndex, 2);
    assert.equal(s.activeView, "back");
  });

  test("bounds check to limits", () => {
    // Out of bounds top
    let s = mapScrollToTurnState(-100, MAX_SCROLL, TOTAL_STATES);
    assert.equal(s.activeSetIndex, 0);
    assert.equal(s.activeView, "front");

    // Out of bounds bottom
    s = mapScrollToTurnState(1500, MAX_SCROLL, TOTAL_STATES);
    assert.equal(s.activeSetIndex, 2);
    assert.equal(s.activeView, "back");
  });

  test("handles zero scroll height gracefully", () => {
    const s = mapScrollToTurnState(0, 0, TOTAL_STATES);
    assert.equal(s.activeSetIndex, 0);
    assert.equal(s.activeView, "front");
    assert.equal(s.stateFloat, 0);
  });
});