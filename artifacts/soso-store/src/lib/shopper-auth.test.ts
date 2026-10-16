import test from "node:test";
import assert from "node:assert/strict";
import {
  canAccessPrivateAccount, isPrivateShopperQueryKey, parseFragmentToken, safeAccountNext,
  shopperIdentityKey, urlWithoutFragment, validateNewPassword,
} from "./shopper-auth";

const token = "A".repeat(40) + "_-9";

test("fragment token extraction accepts only 43-char base64url", () => {
  assert.equal(parseFragmentToken(`#token=${token}`), token);
  assert.equal(parseFragmentToken(`token=${token}`), token);
  assert.equal(parseFragmentToken("#token=short"), null);
  assert.equal(parseFragmentToken(`#token=${token}x`), null);
  assert.equal(parseFragmentToken(`#token=${"A".repeat(42)}+`), null);
  assert.equal(parseFragmentToken(""), null);
  assert.equal(parseFragmentToken(null), null);
});

test("fragment is stripped from URL", () => {
  assert.equal(urlWithoutFragment(`https://x.test/account/verify-email#token=${token}`), "https://x.test/account/verify-email");
  assert.equal(urlWithoutFragment("/a?b=1"), "/a?b=1");
});

test("private cache predicate covers shopper and account but not the session", () => {
  assert.equal(isPrivateShopperQueryKey(["/api/shopper/profile"]), true);
  assert.equal(isPrivateShopperQueryKey(["/api/shopper/orders", { offset: 0 }]), true);
  assert.equal(isPrivateShopperQueryKey(["/api/account/profile"]), true);
  assert.equal(isPrivateShopperQueryKey(["/api/shopper-auth/session"]), false);
  assert.equal(isPrivateShopperQueryKey(["/api/shopper-auth/sessions", "shopper-a"]), true);
  assert.equal(isPrivateShopperQueryKey(["/api/commerce/catalog"]), false);
  assert.equal(isPrivateShopperQueryKey([42]), false);
});

test("verification gates private account access", () => {
  const base = { id: "u1", email: "a@b.ng", name: "Ada" };
  assert.equal(canAccessPrivateAccount(null), false);
  assert.equal(canAccessPrivateAccount({ ...base, emailVerified: false }), false);
  assert.equal(canAccessPrivateAccount({ ...base, emailVerified: true }), true);
});

test("identity key changes on sign-out, user switch and verification", () => {
  const pending = { id: "u1", email: "a@b.ng", name: "Ada", emailVerified: false };
  const keys = new Set([
    shopperIdentityKey(null),
    shopperIdentityKey(pending),
    shopperIdentityKey({ ...pending, emailVerified: true }),
    shopperIdentityKey({ ...pending, id: "u2" }),
  ]);
  assert.equal(keys.size, 4);
});

test("password rules", () => {
  assert.match(validateNewPassword("short", "short") ?? "", /12/);
  assert.match(validateNewPassword("x".repeat(129), "x".repeat(129)) ?? "", /128/);
  assert.match(validateNewPassword("x".repeat(12), "y".repeat(12)) ?? "", /match/);
  assert.equal(validateNewPassword("x".repeat(12), "x".repeat(12)), null);
});

test("post sign-in destinations stay inside /account", () => {
  assert.equal(safeAccountNext("/account/atelier"), "/account/atelier");
  assert.equal(safeAccountNext("https://evil.test"), "/account");
  assert.equal(safeAccountNext("//evil.test"), "/account");
  assert.equal(safeAccountNext("/account/sign-in"), "/account");
  assert.equal(safeAccountNext(null), "/account");
});
