import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NewsletterSignup } from "./NewsletterSignup";

test("newsletter remains visible with signup disabled until availability is known", () => {
  const html = renderToStaticMarkup(<NewsletterSignup />);
  assert.match(html, /id="newsletter-heading"[^>]*>Newsletter/);
  assert.match(html, /Checking signup availability/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Subscribe<\/button>/);
  assert.doesNotMatch(html, /<form|<input/);
});
