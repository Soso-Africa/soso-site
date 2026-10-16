import assert from "node:assert/strict";
import { test } from "node:test";
import { customSizingOrderNotes } from "./custom-sizing";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
test("standard sizing does not add custom instructions", () => {
  assert.equal(customSizingOrderNotes(form({ deliveryNote: " Call on arrival " }), false), "Call on arrival");
});
test("later request accompanies order without claiming a booked fitting", () => {
  assert.match(customSizingOrderNotes(form({ customSizingChoice: "later" }), true), /contact me.*after payment.*not yet booked/);
});
test("known measurements retain unit and separate delivery instructions", () => {
  const notes = customSizingOrderNotes(form({
    customSizingChoice: "now", customSizingUnit: "cm", "customSizing-chest": "100.5", "customSizing-waist": "85", deliveryNote: "Ring bell",
  }), true);
  assert.match(notes, /^Ring bell\n\n/);
  assert.match(notes, /shopper supplied, cm: Chest: 100.5; Waist: 85/);
  assert.match(notes, /confirm fit before production/);
});
test("inches accepted without local conversion", () => {
  assert.match(customSizingOrderNotes(form({ customSizingChoice: "now", customSizingUnit: "in", "customSizing-chest": "40" }), true), /in: Chest: 40/);
});
test("missing choice, empty measurements and invalid values fail explicitly", () => {
  assert.throws(() => customSizingOrderNotes(form({}), true), /Choose whether/);
  for (const value of ["", "-3", "Infinity", "abc", "301"]) {
    assert.throws(() => customSizingOrderNotes(form({
      customSizingChoice: "now", customSizingUnit: "cm", "customSizing-chest": value,
    }), true));
  }
  assert.throws(() => customSizingOrderNotes(form({ customSizingChoice: "now", customSizingUnit: "mm" }), true), /centimetres or inches/);
});
test("order note overflow never silently drops custom sizing", () => {
  assert.throws(() => customSizingOrderNotes(form({ customSizingChoice: "later", deliveryNote: "x".repeat(999) }), true), /1,000 characters/);
});
