import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CommerceSearchSelect } from "./CommerceSearchSelect";

const render = (status: "loading" | "ready" | "unavailable") => renderToStaticMarkup(
  <CommerceSearchSelect label="JusticeSure Product" value="old-id" options={[]}
    optionsStatus={status} placeholder={status === "loading" ? "Loading JusticeSure products…" : status === "unavailable" ? "JusticeSure catalogue unavailable" : "Search JusticeSure products"}
    onChange={() => {}} />,
);

test("failed or unfinished catalogue reads do not falsely report a missing saved product", () => {
  for (const status of ["loading", "unavailable"] as const) {
    const html = render(status);
    assert.match(html, /disabled=""/);
    assert.doesNotMatch(html, /Previously selected item unavailable|previously selected ID|Type to search/);
    assert.match(html, status === "loading" ? /Loading JusticeSure products/ : /JusticeSure catalogue unavailable/);
  }
});

test("a missing saved ID is reported only after a successful catalogue load and does not disable replacement", () => {
  const html = render("ready");
  assert.match(html, /Previously selected item unavailable/);
  assert.match(html, /Choose a current item/);
  assert.doesNotMatch(html, /disabled=""/);
});
