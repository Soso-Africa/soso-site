import { test } from "node:test";
import assert from "node:assert/strict";
import { attachmentProblem, escapeHtml, safeHref, sandboxDocument, sendSignature, textToHtml } from "./staff-mail-html";

test("safeHref allows only http/https/mailto", () => {
  assert.equal(safeHref("https://soso.africa/x"), "https://soso.africa/x");
  assert.equal(safeHref("mailto:a@b.co"), "mailto:a@b.co");
  assert.equal(safeHref("javascript:alert(1)"), null);
  assert.equal(safeHref("data:text/html,x"), null);
  assert.equal(safeHref("https://a.b/\"onx"), null);
});

test("escape and textToHtml never emit raw markup", () => {
  assert.equal(escapeHtml(`<a href="x">'&`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
  assert.equal(textToHtml("<b>hi</b>\nthere\n\nnext"), "<p>&lt;b&gt;hi&lt;/b&gt;<br>there</p><p>next</p>");
});

test("attachment limits", () => {
  assert.equal(attachmentProblem([{ name: "a.pdf", size: 10 }]), null);
  assert.match(attachmentProblem([{ name: "a.exe", size: 10 }])!, /not an allowed type/);
  assert.match(attachmentProblem([{ name: "a.pdf", size: 1_000_001 }])!, /1 MB/);
  assert.match(attachmentProblem(Array(4).fill({ name: "a.txt", size: 1 }))!, /At most 3/);
  assert.match(attachmentProblem([{ name: "a.pdf", size: 900_000 }, { name: "b.pdf", size: 900_000 }, { name: "c.pdf", size: 900_000 }])!, /2 MB/);
});

test("signature includes html and attachments", () => {
  const base = { to: "a@b.co", subject: "s", text: "t" };
  const s = sendSignature(base);
  assert.notEqual(s, sendSignature({ ...base, html: "<p>t</p>" }));
  assert.notEqual(s, sendSignature({ ...base, attachments: [{ name: "a.txt", contentBase64: "QQ==" }] }));
  assert.notEqual(sendSignature({ ...base, attachments: [{ name: "a.txt", contentBase64: "QQ==" }] }), sendSignature({ ...base, attachments: [{ name: "a.txt", contentBase64: "Qg==" }] }));
});

test("sandbox document carries restrictive CSP", () => {
  const d = sandboxDocument("<p>x</p>");
  assert.match(d, /default-src 'none'/);
  assert.match(d, /img-src data:/);
  assert.doesNotMatch(d, /script-src/);
});
