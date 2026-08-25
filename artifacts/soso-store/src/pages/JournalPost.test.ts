import test from "node:test";
import assert from "node:assert/strict";
import { journalBodyBlocks, journalInlineParts } from "../lib/journal-body";

test("journal plain text renderer produces safe semantic blocks", () => {
  assert.deepEqual(
    journalBodyBlocks("# A useful heading\n\nFirst line\nsecond line\n\n- One\n- Two"),
    [
      { type: "heading", text: "A useful heading" },
      { type: "paragraph", text: "First line second line" },
      { type: "list", items: ["One", "Two"] },
    ],
  );
});

test("journal inline parser links only allowlisted public storefront paths", () => {
  assert.deepEqual(
    journalInlineParts("Read [the guide](/journal/finding-your-fit) and [shop](/shop)."),
    [
      { type: "text", text: "Read " },
      { type: "link", text: "the guide", href: "/journal/finding-your-fit" },
      { type: "text", text: " and " },
      { type: "link", text: "shop", href: "/shop" },
      { type: "text", text: "." },
    ],
  );
});

test("journal inline parser leaves malicious and malformed Markdown as plain text", () => {
  const malicious = [
    "[click](javascript:alert(1))",
    "[external](https://evil.example/path)",
    "[traversal](/journal/../admin)",
    "[query](/shop?redirect=https://evil.example)",
    "<svg onload=alert(1)>",
  ].join(" ");
  assert.deepEqual(journalInlineParts(malicious), [{ type: "text", text: malicious }]);
});
