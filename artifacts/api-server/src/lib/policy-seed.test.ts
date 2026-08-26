import assert from "node:assert/strict";
import test from "node:test";

const policySeed = await (new Function("url", "return import(url)")(
  new URL("../../../../lib/db/scripts/seed-soso-policies.mjs", import.meta.url).href,
) as Promise<{
  POLICY_SEED_ACTOR: string;
  policies: Array<{
    slug: string;
    title: string;
    summary: string;
    sections: Array<{ id: string; heading: string; paragraphs?: string[]; bullets?: string[] }>;
  }>;
}>);

test("approved policy seed covers every public policy route with publishable content", () => {
  assert.equal(policySeed.POLICY_SEED_ACTOR, "system:policy-seed-v1");
  assert.deepEqual(
    policySeed.policies.map((policy) => policy.slug).sort(),
    ["care", "delivery-returns", "privacy", "terms"],
  );

  const serialized = JSON.stringify(policySeed.policies);
  assert.doesNotMatch(serialized, /\[(?:insert|confirm|add) [^\]]+\]/i);
  assert.doesNotMatch(serialized, /current status:\s*working draft|not effective|not final (?:privacy notice|terms|policy)/i);

  for (const policy of policySeed.policies) {
    assert.match(policy.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(policy.title.trim());
    assert.ok(policy.summary.trim());
    assert.ok(policy.sections.length >= 4);
    assert.equal(new Set(policy.sections.map((section) => section.id)).size, policy.sections.length);
    for (const section of policy.sections) {
      assert.ok(section.heading.trim());
      assert.ok((section.paragraphs?.length ?? 0) + (section.bullets?.length ?? 0) > 0);
      for (const text of [...(section.paragraphs ?? []), ...(section.bullets ?? [])]) {
        assert.ok(text.trim());
      }
    }
  }
});