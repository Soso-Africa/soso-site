import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CatalogueImportGuide } from "./CatalogueImportGuide";

test("production guide is available inside Staff and distinguishes uploads from product publication", () => {
  const html = renderToStaticMarkup(React.createElement(CatalogueImportGuide));
  for (const phrase of [
    "Production bulk-upload guide", "Connect Google Drive", "unzip",
    "650 KiB", "12 MiB", "40 included photos", "no more than 10",
    "Existing slugs cannot be overwritten", "Not for sale yet",
    "JusticeSure", "Reload the saved catalogue before retrying",
    "Continue on another device", "kept on the server", "Upload recovery",
    "authorization expiry", "do not delete files elsewhere",
  ]) assert.ok(html.includes(phrase), phrase);
  assert.ok(html.includes("<details"));
  assert.ok(html.includes("<summary"));
  assert.equal(html.includes("GOOGLE_DRIVE_CLIENT_SECRET"), false);
});
