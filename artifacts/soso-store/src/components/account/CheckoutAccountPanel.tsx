import { useEffect, useRef, useState, type RefObject } from "react";
import { Link } from "wouter";
import { useOwnedShopperAuth } from "./OwnedShopperAuthProvider";
import { useQueryClient } from "@tanstack/react-query";
import { getGetVerifiedShopperProfileQueryKey, useGetVerifiedShopperProfile, type ShopperProfile } from "@workspace/api-client-react";
import { RotateCw, UserRound } from "lucide-react";
import { apiErrorInfo, clearShopperCache, shopperScopedKey } from "./ShopperClerkProvider";

type Filled = Map<string, string>;

function fillIfEmpty(form: HTMLFormElement, name: string, value: string | null | undefined, filled: Filled) {
  const input = form.elements.namedItem(name);
  if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;
  if (input.value || !value) return;
  if (input.maxLength > 0 && value.length > input.maxLength) return;
  input.value = value;
  filled.set(name, value);
}

function clearFilled(form: HTMLFormElement, filled: Filled) {
  for (const [name, value] of filled) {
    const input = form.elements.namedItem(name);
    if ((input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) && input.value === value) input.value = "";
  }
  filled.clear();
}

/**
 * Guest invitation for signed-out shoppers; prefill from the linked profile for signed-in shoppers.
 * Reports readiness: signed-in shoppers can only quote once their profile is linked.
 */
export function CheckoutAccountPanel({
  formRef, fulfillmentType, onReadyChange, onIdentityChange,
}: {
  formRef: RefObject<HTMLFormElement | null>;
  fulfillmentType: "pickup" | "delivery";
  onReadyChange: (ready: boolean) => void;
  onIdentityChange: () => void;
}) {
  const auth = useOwnedShopperAuth();
  // Pending-email sessions check out as guests: no private profile hook runs until verified.
  const { isLoaded, signOut } = auth;
  const isSignedIn = auth.isVerified;
  const userId = auth.isVerified ? auth.userId : null;
  const [signOutFailed, setSignOutFailed] = useState(false);
  const queryClient = useQueryClient();
  const profile = useGetVerifiedShopperProfile({
    query: {
      enabled: isLoaded && !!isSignedIn && !!userId,
      retry: false,
      queryKey: shopperScopedKey(getGetVerifiedShopperProfileQueryKey(), userId),
    },
  });
  const linked: ShopperProfile | null = profile.data?.linked ? profile.data : null;
  const ready = isLoaded && (!isSignedIn || !!linked);

  const readyRef = useRef(onReadyChange);
  readyRef.current = onReadyChange;
  const identityRef = useRef(onIdentityChange);
  identityRef.current = onIdentityChange;
  useEffect(() => { readyRef.current(ready); }, [ready]);

  const filled = useRef<Filled>(new Map());
  const identity = useRef<string | null | undefined>(undefined);

  // Identity changed (sign-in, sign-out, user switch, link completed): clear details we filled for someone else.
  const identityKey = isLoaded ? `${userId ?? "guest"}:${linked?.email ?? ""}` : undefined;
  useEffect(() => {
    if (identityKey === undefined) return;
    const form = formRef.current;
    if (identity.current !== undefined && identity.current !== identityKey) {
      if (form) clearFilled(form, filled.current);
      identityRef.current();
    }
    identity.current = identityKey;
    const email = form?.elements.namedItem("email");
    if (email instanceof HTMLInputElement && !linked && email.readOnly) {
      email.readOnly = false;
      email.value = "";
    }
  }, [identityKey, linked, formRef]);

  // Prefill (re-runs when the delivery fields mount); only empty fields, never user edits.
  useEffect(() => {
    const form = formRef.current;
    if (!form || !linked) return;
    const email = form.elements.namedItem("email");
    if (email instanceof HTMLInputElement) {
      if (email.value !== linked.email) identityRef.current();
      email.value = linked.email; // must equal the verified linked email; server enforces it too
      email.readOnly = true;
    }
    fillIfEmpty(form, "name", linked.name, filled.current);
    fillIfEmpty(form, "phone", linked.phone, filled.current);
    // Delivery is structured (street, region, city, postcode). A freeform saved address is never split
    // into those fields; it is shown below as a reference instead.
  }, [linked, formRef]);

  const switchToGuest = () => {
    setSignOutFailed(false);
    void clearShopperCache(queryClient).then(() => signOut()).catch(() => setSignOutFailed(true));
  };

  if (!isLoaded) return <div className="mt-10 h-[74px] animate-pulse bg-muted/60" role="status" aria-label="Checking your account" />;

  if (!isSignedIn) {
    return (
      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border border-border bg-[#f6f1e7] px-5 py-4" data-testid="panel-checkout-guest">
        <p className="text-sm leading-relaxed">
          <span className="font-semibold">Checking out as a guest.</span>{" "}
          <span className="text-secondary">{auth.isSignedIn
            ? `Verify ${auth.email ?? "your email"} to use your saved details. You can still check out now.`
            : "Sign in to use your saved details and keep this order in your account."}</span>
        </p>
        <div className="flex gap-4 text-xs font-semibold uppercase tracking-[0.16em]">
          {auth.isSignedIn ? (
            <Link href="/account" className="underline underline-offset-4" data-testid="link-checkout-verify">Verify email</Link>
          ) : (<>
          <Link href="/account/sign-in" className="underline underline-offset-4" data-testid="link-checkout-sign-in">Sign in</Link>
          <Link href="/account/sign-up" className="text-secondary underline underline-offset-4 hover:text-foreground" data-testid="link-checkout-sign-up">Create account</Link>
          </>)}
        </div>
      </div>
    );
  }

  if (linked) {
    return (
      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border border-border px-5 py-4" data-testid="panel-checkout-account">
        <p className="flex items-center gap-3 text-sm">
          <UserRound size={18} className="shrink-0 text-[#8a6a22]" />
          <span>Signed in as <span className="font-semibold">{linked.email}</span>. Saved details fill empty fields; edit anything for this order.</span>
        </p>
        {fulfillmentType === "delivery" && linked.address && (
          <div className="w-full border-l-2 border-[#b8923a] bg-[#f6f1e7] px-4 py-3 text-xs leading-relaxed" data-testid="text-checkout-saved-address">
            <p className="font-semibold uppercase tracking-[0.16em] text-secondary">Your saved address, for reference</p>
            <p className="mt-1 whitespace-pre-line text-sm text-foreground">{linked.address}</p>
            <p className="mt-1 text-secondary">Enter it in the delivery fields below so we can price and route it correctly.</p>
          </div>
        )}
        <div className="flex gap-4 text-xs font-semibold uppercase tracking-[0.16em]">
          <Link href="/account" className="underline underline-offset-4" data-testid="link-checkout-account">My account</Link>
          <button type="button" onClick={switchToGuest} className="text-secondary underline underline-offset-4 hover:text-foreground" data-testid="button-checkout-guest">Sign out</button>
          {signOutFailed && <span role="alert" className="normal-case tracking-normal text-destructive" data-testid="text-checkout-sign-out-error">Sign-out did not complete. Try again.</span>}
        </div>
      </div>
    );
  }

  if (profile.isLoading || (!profile.isError && !profile.data)) {
    return <div className="mt-10 h-[74px] animate-pulse bg-muted/60" role="status" aria-label="Loading your saved details" />;
  }

  const err = apiErrorInfo(profile.error);
  const notLinked = err.status === 404 || (profile.data && !profile.data.linked);
  return (
    <div role="alert" className="mt-10 border border-[#e7c9a0] bg-[#fbf3e6] px-5 py-4 text-sm" data-testid="panel-checkout-unlinked">
      <p>
        {notLinked
          ? "You are signed in, but your account setup is not finished. Finish it to check out signed in, or sign out to check out as a guest."
          : (err.message ?? "We could not load your account details.") + " Try again, or sign out to check out as a guest."}
      </p>
      <div className="mt-4 flex flex-wrap gap-4 text-xs font-semibold uppercase tracking-[0.16em]">
        {notLinked
          ? <Link href="/account" className="underline underline-offset-4" data-testid="link-checkout-finish-account">Finish account setup</Link>
          : <button type="button" onClick={() => void profile.refetch()} className="inline-flex items-center gap-1.5 underline underline-offset-4" data-testid="button-checkout-retry-profile"><RotateCw size={13} /> Try again</button>}
        <button type="button" onClick={switchToGuest} className="underline underline-offset-4" data-testid="button-checkout-guest">Sign out and continue as guest</button>
          {signOutFailed && <span role="alert" className="normal-case tracking-normal text-destructive" data-testid="text-checkout-sign-out-error">Sign-out did not complete. Try again.</span>}
      </div>
    </div>
  );
}
