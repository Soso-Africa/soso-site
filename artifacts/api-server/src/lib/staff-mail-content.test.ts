import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { simpleParser } from "mailparser";
import { buildMailMime, decodeMailAttachments, mailBodyHash, mailContent, safeAttachmentName, safeMailHtml } from "./staff-mail-content";

const file = (name: string, data: string | Buffer) => ({ name, contentBase64: Buffer.from(data).toString("base64") });

test("HTML preserves text formatting and safe links, stripping active and tracking content", () => {
  const output = safeMailHtml(`<p style="background:url(https://track.test/a)" onclick="alert(1)"><b>Hello</b> <a href="https://shop.test/item">Shop</a></p><script>alert(1)</script><img src="https://track.test/pixel"><iframe src="https://track.test"></iframe><form><input></form><svg><a onload="alert(1)">x</a></svg>`);
  assert.match(output, /<b>Hello<\/b>/);
  assert.match(output, /href="https:\/\/shop.test\/item"/);
  assert.match(output, /rel="noopener noreferrer"/);
  assert.doesNotMatch(output, /script|alert|onclick|style=|img|src=|iframe|form|svg|track\.test/);
  for (const href of ["javascript:alert(1)", "data:text/html,hi", "//tracker.test/a", "file:///etc/passwd", "https://user:password@shop.test/a"]) {
    assert.doesNotMatch(safeMailHtml(`<a href="${href}">Link</a>`), /href=/);
  }
  assert.match(safeMailHtml('<a href="mailto:help@example.test">Email</a>'), /href="mailto:/);
});

test("server derives authoritative plaintext with link destinations and rejects empty/oversized HTML", () => {
  const content = mailContent("misleading fallback", '<p><strong>Hi</strong></p><p><a href="https://shop.test/a">See collection</a></p>');
  assert.doesNotMatch(content.text, /misleading/);
  assert.match(content.text, /https:\/\/shop.test\/a/);
  assert.throws(() => mailContent("Hi", "<script>alert(1)</script>"), /readable/);
  assert.throws(() => mailContent("Hi", `<p>${"a".repeat(24001)}</p>`), /24,000/);
  assert.equal(mailContent("old plain message").text, "old plain message");
});

test("attachments enforce filename, type, byte signatures, encoding, count and cumulative limits", () => {
  assert.equal(decodeMailAttachments([file("notes.txt", "Hello")])[0].content.toString(), "Hello");
  assert.equal(decodeMailAttachments([file("brief.pdf", "%PDF-1.7\n")])[0].contentType, "application/pdf");
  assert.throws(() => decodeMailAttachments([file("script.exe", "hello")]), /PDF/);
  assert.throws(() => decodeMailAttachments([file("../notes.txt", "hello")]), /filename/);
  assert.throws(() => decodeMailAttachments([file("fake.pdf", "not a PDF")]), /file type/);
  assert.throws(() => decodeMailAttachments([file("bad.txt", Buffer.from([0xff, 0x00]))]), /file type/);
  assert.throws(() => decodeMailAttachments([{ name: "bad.txt", contentBase64: "Z===" }]), /encoding/);
  assert.throws(() => decodeMailAttachments(Array.from({ length: 4 }, () => file("a.txt", "a"))), /three/);
  const large = file("large.txt", "x".repeat(1_000_000));
  assert.equal(decodeMailAttachments([large, large]).length, 2);
  assert.throws(() => decodeMailAttachments([large, large, file("extra.txt", "a")]), /2 MB/);
  assert.throws(() => decodeMailAttachments([file("large.txt", "x".repeat(1_000_001))]), /1 MB/);
  assert.throws(() => decodeMailAttachments([file("empty.txt", "")]), /nonempty/);
  assert.equal(safeAttachmentName("bad\r\n.pdf"), "bad__.pdf");
});

test("retry hash includes HTML, attachment bytes, names and types without changing old plain hashes", () => {
  const base = { text: "Hi", kind: "direct" };
  assert.equal(mailBodyHash(base), createHash("sha256").update(JSON.stringify(["Hi", "direct", undefined, undefined, undefined])).digest("hex"));
  assert.notEqual(mailBodyHash(base), mailBodyHash({ ...base, html: "<b>Hi</b>" }));
  const a = decodeMailAttachments([file("a.txt", "one")]);
  const b = decodeMailAttachments([file("a.txt", "two")]);
  assert.notEqual(mailBodyHash({ ...base, attachments: a }), mailBodyHash({ ...base, attachments: b }));
  assert.notEqual(mailBodyHash({ ...base, attachments: a }), mailBodyHash({ ...base, attachments: [{ ...a[0], filename: "b.txt" }] }));
});

test("actual MIME read-back retains HTML, plaintext, exact attachments, reply headers and unsubscribe link", async () => {
  const content = mailContent("fallback", '<p><b>Hello</b>, <a href="https://shop.test/a">shop</a></p>');
  const bytes = await buildMailMime({
    id: randomUUID(), from: { name: "SOSO Test", address: "test@example.test" }, to: "recipient@example.test", subject: "Rich email",
    ...content, attachments: decodeMailAttachments([file("notes.txt", "Exact file bytes\n")]), inReplyTo: "<original@example.test>",
    unsubscribeUrl: "https://shop.test/newsletter/unsubscribe?token=synthetic",
  });
  const parsed = await simpleParser(bytes);
  assert.match(String(parsed.html), /<b>Hello<\/b>/);
  assert.match(parsed.text!, /https:\/\/shop.test\/a/);
  assert.equal(parsed.attachments.length, 1);
  assert.equal(parsed.attachments[0].filename, "notes.txt");
  assert.equal(parsed.attachments[0].content.toString(), "Exact file bytes\n");
  assert.equal(parsed.inReplyTo, "<original@example.test>");
  assert.match(bytes.toString(), /List-Unsubscribe:\s*<https:\/\/shop.test\/newsletter\/unsubscribe\?token=synthetic>/);
  assert.match(bytes.toString(), /multipart\/mixed/);
  assert.match(bytes.toString(), /multipart\/alternative/);
});
