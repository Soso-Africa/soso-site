import assert from "node:assert/strict";
import test from "node:test";
import { formatCsvCell, formatDelta, formatPercent } from "./formatters";

test("analytics ratios render as truthful percentages", () => {
  assert.equal(formatDelta(0.5), "+50%");
  assert.equal(formatDelta(-0.125), "-12.5%");
  assert.equal(formatDelta(null), "No prior data");
  assert.equal(formatPercent(0.18), "18%");
  assert.equal(formatPercent(0.185), "18.5%");
  assert.equal(formatPercent(null), "—");
});

test("analytics CSV cells preserve nested currency data", () => {
  assert.equal(formatCsvCell("google, organic"), "\"google, organic\"");
  assert.equal(
    formatCsvCell([{ currency: "NGN", revenue: 250000 }]),
    "\"[{\"\"currency\"\":\"\"NGN\"\",\"\"revenue\"\":250000}]\"",
  );
});