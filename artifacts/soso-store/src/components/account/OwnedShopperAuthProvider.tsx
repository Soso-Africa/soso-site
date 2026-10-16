import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  getGetShopperAuthSessionQueryKey, useGetShopperAuthSession, useLogoutShopperAuth, type ShopperAuthSession,
} from "@workspace/api-client-react";
import {
  AUTH_SIGNAL_CHANNEL, AUTH_SIGNAL_STORAGE_KEY, canAccessPrivateAccount, isPrivateShopperQueryKey, shopperIdentityKey,
  type ShopperAuthUser,
} from "@/lib/shopper-auth";

export type OwnedShopperAuth = {
  /** True once the session is resolved and caches belonging to any earlier identity are purged. */
  isLoaded: boolean;
  /** A session exists (verified or pending). */
  isSignedIn: boolean;
  /** A session exists and its email is verified; the only state that may touch private account data. */
  isVerified: boolean;
  userId: string | null;
  user: ShopperAuthUser | null;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
  refresh: () => Promise<void>;
  /** Stores a session returned by login and tells other tabs. */
  applySession: (session: ShopperAuthSession) => Promise<void>;
  /** Purges private caches, refreshes the session and tells other tabs (after reset/verify). */
  identityChanged: () => Promise<void>;
  signOut: () => Promise<void>;
  signOutPending: boolean;
};

const Ctx = createContext<OwnedShopperAuth | null>(null);

export async function clearPrivateShopperCaches(queryClient: QueryClient) {
  const predicate = (q: { queryKey: readonly unknown[] }) => isPrivateShopperQueryKey(q.queryKey);
  await queryClient.cancelQueries({ predicate });
  queryClient.removeQueries({ predicate });
}

function notifyOtherTabs() {
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const ch = new BroadcastChannel(AUTH_SIGNAL_CHANNEL);
      ch.postMessage({ type: "identity-changed" });
      ch.close();
      return;
    }
  } catch { /* fall back to storage */ }
  try {
    // A timestamp only. No token or identity is ever written.
    window.localStorage.setItem(AUTH_SIGNAL_STORAGE_KEY, String(Date.now()));
  } catch { /* storage optional */ }
}

function AuthStatus() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading your account" className="mx-auto max-w-6xl px-6 py-16 lg:px-12">
      <div className="h-3 w-28 animate-pulse bg-muted" />
      <div className="mt-4 h-10 w-72 max-w-full animate-pulse bg-muted" />
      <div className="mt-10 h-64 animate-pulse bg-muted/70" />
    </div>
  );
}

/**
 * SOSO-owned shopper session. Cookies are HttpOnly; this only reads the session endpoint.
 * `privateAccount` gates children until the identity resolves and isolates their query cache per identity,
 * so late responses from a previous shopper land in a discarded client.
 */
export function OwnedShopperAuthProvider({ children, privateAccount = false }: { children: ReactNode; privateAccount?: boolean }) {
  const queryClient = useQueryClient();
  const sessionKey = getGetShopperAuthSessionQueryKey();
  const session = useGetShopperAuthSession({
    query: { queryKey: sessionKey, retry: 1, staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: "always", refetchInterval: (query) => query.state.data?.user ? 60_000 : false },
  });
  const refetchRef = useRef(session.refetch);
  refetchRef.current = session.refetch;

  const user = (session.isError ? null : session.data?.user ?? null) as ShopperAuthUser | null;
  // A failed session lookup resolves as signed out so guest checkout is never blocked.
  // Never authorize from cached status during a remount, cross-tab change or
  // revalidation. Private children unmount while the cookie identity is checked.
  const resolved = session.isFetchedAfterMount && !session.isFetching && (session.isSuccess || session.isError);
  const identity = resolved ? shopperIdentityKey(user) : undefined;

  const [readyFor, setReadyFor] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (identity === undefined) return;
    let live = true;
    // Also purges on first mount: another tab may have changed identity while this provider was absent.
    void clearPrivateShopperCaches(queryClient).then(() => { if (live) setReadyFor(identity); });
    return () => { live = false; };
  }, [identity, queryClient]);

  useEffect(() => {
    const refresh = () => { void refetchRef.current(); };
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    const onStorage = (e: StorageEvent) => { if (e.key === AUTH_SIGNAL_STORAGE_KEY) refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", onStorage);
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel(AUTH_SIGNAL_CHANNEL);
        channel.onmessage = refresh;
      }
    } catch { channel = null; }
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", onStorage);
      channel?.close();
    };
  }, []);

  const logout = useLogoutShopperAuth();
  const logoutRef = useRef(logout.mutateAsync);
  logoutRef.current = logout.mutateAsync;

  const refresh = useCallback(async () => { await refetchRef.current(); }, []);
  const applySession = useCallback(async (next: ShopperAuthSession) => {
    // A pre-login status response must not overwrite the newly rotated identity.
    await queryClient.cancelQueries({ queryKey: getGetShopperAuthSessionQueryKey(), exact: true });
    await clearPrivateShopperCaches(queryClient);
    queryClient.setQueryData(getGetShopperAuthSessionQueryKey(), next);
    notifyOtherTabs();
  }, [queryClient]);
  const identityChanged = useCallback(async () => {
    // Discard status reads started before a reset/revocation, then resolve the
    // actual cookie (which may already belong to a newer login in another tab).
    await queryClient.cancelQueries({ queryKey: getGetShopperAuthSessionQueryKey(), exact: true });
    await clearPrivateShopperCaches(queryClient);
    notifyOtherTabs();
    await refetchRef.current();
  }, [queryClient]);
  const signOut = useCallback(async () => {
    await logoutRef.current(); // throws on failure so callers can show feedback
    await queryClient.cancelQueries({ queryKey: getGetShopperAuthSessionQueryKey(), exact: true });
    await clearPrivateShopperCaches(queryClient);
    queryClient.setQueryData<ShopperAuthSession>(getGetShopperAuthSessionQueryKey(), { user: null });
    notifyOtherTabs();
  }, [queryClient]);

  const isLoaded = identity !== undefined && readyFor === identity;
  const value = useMemo<OwnedShopperAuth>(() => ({
    isLoaded,
    isSignedIn: isLoaded && !!user,
    isVerified: isLoaded && canAccessPrivateAccount(user),
    userId: isLoaded ? user?.id ?? null : null,
    user: isLoaded ? user : null,
    email: isLoaded ? user?.email ?? null : null,
    name: isLoaded ? user?.name ?? null : null,
    emailVerified: isLoaded && user?.emailVerified === true,
    refresh, applySession, identityChanged, signOut,
    signOutPending: logout.isPending,
  }), [isLoaded, user, refresh, applySession, identityChanged, signOut, logout.isPending]);

  return (
    <Ctx.Provider value={value}>
      {privateAccount ? <PrivateAccountBoundary>{children}</PrivateAccountBoundary> : children}
    </Ctx.Provider>
  );
}

/**
 * Gates private account children until the identity resolves and gives them a query cache per identity,
 * so late responses or mutation callbacks from a previous shopper land in a discarded client.
 * Auth pages (sign-in, verify, reset) stay outside so their result state survives identity changes.
 */
export function PrivateAccountBoundary({ children }: { children: ReactNode }) {
  const auth = useOwnedShopperAuth();
  const identity = auth.isLoaded ? shopperIdentityKey(auth.user) : undefined;
  const privateClient = useMemo(
    () => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [identity],
  );
  useEffect(() => () => privateClient.clear(), [privateClient]);
  if (!identity) return <AuthStatus />;
  return <QueryClientProvider key={identity} client={privateClient}>{children}</QueryClientProvider>;
}

export function useOwnedShopperAuth(): OwnedShopperAuth {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOwnedShopperAuth must be used inside OwnedShopperAuthProvider");
  return ctx;
}

/**
 * Identity for private data hooks. Pending-email sessions report signed out here, so every
 * profile/measurement/order hook and automatic link stays disabled until verification.
 */
export function useVerifiedShopperAuth() {
  const a = useOwnedShopperAuth();
  return { isLoaded: a.isLoaded, isSignedIn: a.isVerified, userId: a.isVerified ? a.userId : null, user: a.isVerified ? a.user : null };
}
