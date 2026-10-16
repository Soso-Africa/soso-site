/** Pure helpers for SOSO-owned shopper authentication. No browser globals at import time. */

export type ShopperAuthUser = { id: string; email: string; name: string; emailVerified: boolean };

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;
export const AUTH_SIGNAL_CHANNEL = "soso-shopper-auth";
export const AUTH_SIGNAL_STORAGE_KEY = "soso-shopper-auth-signal";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Reads `#token=<43 char base64url>` from a URL fragment. Anything else is rejected. */
export function parseFragmentToken(hash: string | null | undefined): string | null {
  if (!hash) return null;
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  let value: string | null = null;
  try {
    value = new URLSearchParams(raw).get("token");
  } catch {
    return null;
  }
  return value && TOKEN_PATTERN.test(value) ? value : null;
}

/** URL with the fragment removed, for history.replaceState. */
export function urlWithoutFragment(href: string): string {
  const i = href.indexOf("#");
  return i === -1 ? href : href.slice(0, i);
}

/** Private account caches: verified-shopper, legacy account. Never the session query itself. */
export function isPrivateShopperQueryKey(key: readonly unknown[]): boolean {
  const head = key[0];
  if (typeof head !== "string") return false;
  if (head === "/api/shopper-auth/sessions" || head.startsWith("/api/shopper-auth/sessions/")) return true;
  if (head.startsWith("/api/shopper-auth")) return false;
  return head === "/api/shopper" || head.startsWith("/api/shopper/") || head.startsWith("/api/shopper?")
    || head === "/api/account" || head.startsWith("/api/account/") || head.startsWith("/api/account?");
}

/** Identity used to scope private caches. Verification state is part of it: it changes what may be fetched. */
export function shopperIdentityKey(user: ShopperAuthUser | null | undefined): string {
  if (!user) return "guest";
  return `${user.id}:${user.emailVerified ? "verified" : "pending"}`;
}

/** Only a verified shopper may load profile, measurements or orders, or auto-link a customer. */
export function canAccessPrivateAccount(user: ShopperAuthUser | null | undefined): user is ShopperAuthUser {
  return Boolean(user && user.emailVerified === true && user.id);
}

export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use no more than ${PASSWORD_MAX} characters.`;
  if (password !== confirm) return "The two passwords do not match.";
  return null;
}

/** Only internal /account paths are accepted as post sign-in destinations. */
export function safeAccountNext(next: string | null | undefined): string {
  if (!next || !/^\/account(?:\/[A-Za-z0-9/_-]*)?$/.test(next) || next.includes("//")) return "/account";
  if (/^\/account\/(sign-in|sign-up|forgot-password|reset-password|verify-email)/.test(next)) return "/account";
  return next;
}
