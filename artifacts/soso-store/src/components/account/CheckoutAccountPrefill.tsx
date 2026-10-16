import { useEffect, useRef } from "react";
import { Link } from "wouter";
import { useVerifiedShopperAuth as useAuth } from "@/components/account/OwnedShopperAuthProvider";
import { getGetShopperProfileQueryKey, useGetShopperProfile } from "@workspace/api-client-react";

const FIELDS = ["name", "email", "phone"] as const;

function setNativeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Fills empty, untouched contact inputs in the surrounding form from the shopper profile. */
export function CheckoutAccountPrefill() {
  const { isLoaded, isSignedIn } = useAuth();
  const markerRef = useRef<HTMLDivElement>(null);
  const touched = useRef(new Set<string>());
  const profile = useGetShopperProfile({
    query: { enabled: Boolean(isLoaded && isSignedIn), retry: false, queryKey: getGetShopperProfileQueryKey() },
  });

  useEffect(() => {
    const form = markerRef.current?.closest("form");
    if (!form) return;
    const onInput = (event: Event) => {
      const target = event.target as HTMLInputElement | null;
      if (event.isTrusted && target?.name) touched.current.add(target.name);
    };
    form.addEventListener("input", onInput, true);
    return () => form.removeEventListener("input", onInput, true);
  }, []);

  const customer = isSignedIn ? profile.data?.customer : undefined;
  useEffect(() => {
    const form = markerRef.current?.closest("form");
    if (!form || !customer) return;
    const values: Record<(typeof FIELDS)[number], string> = {
      name: customer.name,
      email: customer.verifiedEmail,
      phone: customer.phone ?? "",
    };
    for (const field of FIELDS) {
      const input = form.elements.namedItem(field);
      if (!(input instanceof HTMLInputElement)) continue;
      if (touched.current.has(field) || input.value.trim() || !values[field]) continue;
      setNativeValue(input, values[field]);
    }
  }, [customer]);

  return (
    <div ref={markerRef} className="text-[12px] text-secondary" data-testid="checkout-account-prefill">
      {customer ? (
        <p>Details filled from <Link href="/account" className="underline underline-offset-4 hover:text-foreground" data-testid="link-checkout-my-account">my account</Link>. You can change them for this order.</p>
      ) : null}
    </div>
  );
}
