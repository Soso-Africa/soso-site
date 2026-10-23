import assert from "node:assert/strict";
import { after, test } from "node:test";
import { pool } from "@workspace/db";
import { DEFAULT_PLATFORM_CONTENT, PlatformContentSchema } from "./platform-content";

after(async () => { await pool.end(); });

test("legacy hero documents do not gain an unsolicited layout setting", () => {
  const content = structuredClone(DEFAULT_PLATFORM_CONTENT);
  delete content.homepage.hero.mobileVideoLayout;
  const parsed = PlatformContentSchema.parse(content);
  assert.equal(Object.hasOwn(parsed.homepage.hero, "mobileVideoLayout"), false);
});

test("video hero layout round-trips both explicit supported choices", () => {
  for (const mobileVideoLayout of ["comparison", "full-height"] as const) {
    const content = structuredClone(DEFAULT_PLATFORM_CONTENT);
    content.homepage.hero.mobileVideoLayout = mobileVideoLayout;
    assert.equal(PlatformContentSchema.parse(content).homepage.hero.mobileVideoLayout, mobileVideoLayout);
  }
});

test("hero layout rejects unsupported crop instructions", () => {
  const content = structuredClone(DEFAULT_PLATFORM_CONTENT);
  const candidate = {
    ...content,
    homepage: {
      ...content.homepage,
      hero: { ...content.homepage.hero, mobileVideoLayout: "stretch" },
    },
  };
  const result = PlatformContentSchema.safeParse(candidate);
  assert.equal(result.success, false);
  if (!result.success) assert.ok(result.error.issues.some((issue) => issue.path.join(".") === "homepage.hero.mobileVideoLayout"));
});
