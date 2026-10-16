/**
 * Compatibility module (filename retained). Clerk has been removed; shopper auth is SOSO-owned.
 * See OwnedShopperAuthProvider.
 */
import type { QueryClient } from "@tanstack/react-query";
import { isPrivateShopperQueryKey } from "@/lib/shopper-auth";
import { clearPrivateShopperCaches } from "./OwnedShopperAuthProvider";

export { OwnedShopperAuthProvider } from "./OwnedShopperAuthProvider";

export const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
export const accountSignInPath = `${basePath}/account/sign-in`;
export const accountSignUpPath = `${basePath}/account/sign-up`;
export const accountHomePath = `${basePath}/account`;

/** Absolute in-app href that escapes any nested Wouter base. `sub` is like "/account/sign-in". */
export function appHref(sub: string) {
  return `~${basePath}${sub}`;
}

export function isShopperQueryKey(key: readonly unknown[]) {
  return isPrivateShopperQueryKey(key);
}

/** Every shopper query key is scoped by the shopper id so one shopper's cache can never satisfy another's query. */
export function shopperScopedKey<K extends readonly unknown[]>(key: K, userId: string | null | undefined) {
  return [...key, { shopper: userId ?? "anonymous" }] as const;
}

export async function clearShopperCache(queryClient: QueryClient) {
  await clearPrivateShopperCaches(queryClient);
}

export function apiErrorInfo(error: unknown): { status: number | null; code: string | null; message: string | null } {
  if (error && typeof error === "object" && typeof (error as { status?: unknown }).status === "number") {
    const e = error as { status: number; data?: unknown };
    const data = (e.data ?? {}) as { code?: unknown; error?: unknown };
    return {
      status: e.status,
      code: typeof data.code === "string" ? data.code : null,
      message: typeof data.error === "string" ? data.error : null,
    };
  }
  return { status: null, code: null, message: null };
}

export function formatMinor(minor: string, currency: string) {
  if (currency === "NGN") {
    try {
      return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(Number(BigInt(minor)) / 100);
    } catch { /* fall through */ }
  }
  return `${currency} ${minor} (minor units)`;
}

export function humanize(value: string | null | undefined) {
  if (!value) return "—";
  return value.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
