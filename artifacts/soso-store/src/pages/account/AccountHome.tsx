import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetVerifiedShopperOrdersQueryKey, getGetVerifiedShopperProfileQueryKey, useGetVerifiedShopperOrders, useUpdateVerifiedShopperProfile, type ShopperProfile,
} from "@workspace/api-client-react";
import { useVerifiedShopperAuth as useAuth } from "@/components/account/OwnedShopperAuthProvider";
import { ArrowUpRight, Check, Package, RotateCw } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { apiErrorInfo, formatMinor, humanize, shopperScopedKey } from "@/components/account/ShopperClerkProvider";
import { SignOutButton } from "./AccountApp";

export default function AccountHome({ profile }: { profile: ShopperProfile }) {
  const { items } = useCart();
  const first = profile.name.split(/\s+/)[0] || profile.name;
  return (
    <div className="mx-auto max-w-6xl px-6 py-12 md:py-16 lg:px-12">
      <div className="soso-rise flex flex-wrap items-end justify-between gap-6 border-b border-border pb-8">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-[#8a6a22]">My account</p>
          <h1 className="soso-display mt-3 text-4xl md:text-5xl" data-testid="text-account-greeting">Hello, {first}</h1>
          <p className="mt-3 text-sm text-secondary" data-testid="text-account-email">{profile.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          {items.length > 0 && <Link href="~/checkout" className="text-xs font-semibold uppercase tracking-[0.18em] underline underline-offset-4" data-testid="link-return-checkout">Return to checkout</Link>}
          <Link href="/atelier" className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a6a22] underline underline-offset-4" data-testid="link-account-atelier">Measurements and atelier updates</Link>
          <Link href="~/shop" className="text-xs uppercase tracking-[0.18em] text-secondary hover:text-foreground" data-testid="link-keep-shopping">Keep shopping</Link>
          <SignOutButton />
          <Link href="/sessions" className="text-xs underline underline-offset-4">Signed-in devices</Link>
        </div>
      </div>
      <div className="mt-12 grid gap-14 lg:grid-cols-[0.85fr_1.15fr]">
        <ProfileForm profile={profile} />
        <OrderHistory />
      </div>
    </div>
  );
}

function ProfileForm({ profile }: { profile: ShopperProfile }) {
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [address, setAddress] = useState(profile.address ?? "");
  const [saved, setSaved] = useState(false);
  const initialised = useRef(false);
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    setName(profile.name); setPhone(profile.phone ?? ""); setAddress(profile.address ?? "");
  }, [profile]);
  const update = useUpdateVerifiedShopperProfile({
    mutation: {
      onSuccess: (next) => {
        queryClient.setQueryData(shopperScopedKey(getGetVerifiedShopperProfileQueryKey(), userId), next);
        setSaved(true);
      },
    },
  });
  const err = apiErrorInfo(update.error);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    update.mutate({ data: { name: name.trim(), phone: phone.trim() || null, address: address.trim() || null } });
  };
  const touch = () => setSaved(false);
  return (
    <section aria-labelledby="profile-heading">
      <h2 id="profile-heading" className="text-[11px] font-bold uppercase tracking-[0.24em]">Your details</h2>
      <p className="mt-2 text-sm text-secondary">Used to prefill checkout. Change them whenever you like.</p>
      <form onSubmit={submit} className="mt-6 space-y-5">
        <label className="block text-sm">Name
          <input required maxLength={255} value={name} onChange={(e) => { setName(e.target.value); touch(); }} autoComplete="name" className="soso-account-input mt-2" data-testid="input-profile-name" />
        </label>
        <label className="block text-sm">Email <span className="text-xs text-secondary">(verified sign-in email)</span>
          <input readOnly value={profile.email} className="soso-account-input mt-2" data-testid="input-profile-email" />
        </label>
        <label className="block text-sm">Phone
          <input maxLength={50} value={phone} onChange={(e) => { setPhone(e.target.value); touch(); }} inputMode="tel" autoComplete="tel" className="soso-account-input mt-2" data-testid="input-profile-phone" />
        </label>
        <label className="block text-sm">Saved delivery address
          <textarea rows={4} maxLength={2000} value={address} onChange={(e) => { setAddress(e.target.value); touch(); }} autoComplete="street-address" placeholder="Street, area, city, state" className="soso-account-input mt-2" data-testid="input-profile-address" />
        </label>
        {address && <button type="button" onClick={() => { setAddress(""); touch(); }} className="text-xs text-secondary underline underline-offset-4" data-testid="button-clear-address">Clear saved address</button>}
        {update.isError && <p role="alert" className="text-sm text-destructive">{err.message ?? "Your details were not saved. Please try again."}</p>}
        <div className="flex items-center gap-4">
          <button disabled={update.isPending} className="bg-foreground px-7 py-3.5 text-xs font-bold uppercase tracking-[0.2em] text-background disabled:opacity-60" data-testid="button-save-profile">
            {update.isPending ? "Saving…" : "Save details"}
          </button>
          {saved && <span role="status" className="inline-flex items-center gap-1.5 text-xs text-[#2f6b3a]" data-testid="status-profile-saved"><Check size={14} /> Saved</span>}
        </div>
      </form>
    </section>
  );
}

function OrderHistory() {
  const [offsets, setOffsets] = useState<number[]>([0]);
  return (
    <section aria-labelledby="orders-heading">
      <h2 id="orders-heading" className="text-[11px] font-bold uppercase tracking-[0.24em]">Purchases</h2>
      <p className="mt-2 text-sm text-secondary">Orders linked to your SOSO customer profile. Earlier guest orders are not claimed automatically by email.</p>
      <ul className="mt-6 border-t border-border">
        {offsets.map((offset, index) => (
          <OrdersPage
            key={offset}
            offset={offset}
            isLast={index === offsets.length - 1}
            isFirst={index === 0}
            onMore={(next) => setOffsets((current) => current.includes(next) ? current : [...current, next])}
          />
        ))}
      </ul>
    </section>
  );
}

function OrdersPage({ offset, isLast, isFirst, onMore }: { offset: number; isLast: boolean; isFirst: boolean; onMore: (next: number) => void }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const params = { offset };
  const query = useGetVerifiedShopperOrders(params, {
    query: { enabled: isLoaded && !!isSignedIn && !!userId, retry: false, queryKey: shopperScopedKey(getGetVerifiedShopperOrdersQueryKey(params), userId) },
  });
  if (query.isLoading) return <>{[0, 1, 2].map((i) => <li key={i} className="h-20 animate-pulse border-b border-border bg-muted/50" />)}</>;
  if (query.isError) {
    return (
      <li className="border-b border-border py-6 text-sm">
        <p role="alert" className="text-destructive">{apiErrorInfo(query.error).message ?? "Your purchases did not load."}</p>
        <button type="button" onClick={() => void query.refetch()} className="mt-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] underline underline-offset-4" data-testid="button-retry-orders"><RotateCw size={13} /> Try again</button>
      </li>
    );
  }
  const data = query.data;
  if (!data) return null;
  if (isFirst && data.orders.length === 0) {
    return (
      <li className="flex flex-col items-start gap-4 border-b border-border py-12">
        <Package className="text-[#b8923a]" size={28} strokeWidth={1.25} />
        <p className="soso-display text-2xl">No purchases yet</p>
        <p className="max-w-sm text-sm text-secondary">Orders placed while signed in, and purchases the atelier links to your customer profile, will appear here.</p>
        <Link href="~/shop" className="text-xs font-semibold uppercase tracking-[0.18em] underline underline-offset-4" data-testid="link-empty-shop">Browse the collection</Link>
      </li>
    );
  }
  return (
    <>
      {data.orders.map((order) => {
        const body = (
          <div className="flex items-center justify-between gap-4 py-5">
            <div className="min-w-0">
              <p className="text-sm font-semibold tracking-wide">{order.number ? `Order ${order.number}` : "Order"}</p>
              <p className="mt-1 text-xs text-secondary">
                {order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Date pending"}
                {order.source ? ` · ${humanize(order.source)}` : ""}{" · "}{humanize(order.paymentStatus ?? order.status)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-sm" data-testid={`text-order-total-${order.id}`}>{formatMinor(order.totalMinor, order.currency)}</span>
              <ArrowUpRight size={16} className="text-secondary transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </div>
          </div>
        );
        return (
          <li key={order.id} className="border-b border-border" data-testid={`row-order-${order.id}`}>
            <Link href={`/orders/${encodeURIComponent(order.id)}`} className="group block hover:bg-muted/40" data-testid={`link-order-${order.id}`}>{body}</Link>
          </li>
        );
      })}
      {isLast && data.hasMore && data.nextOffset !== null && (
        <li className="pt-6">
          <button type="button" onClick={() => onMore(data.nextOffset as number)} className="w-full border border-border py-3.5 text-xs uppercase tracking-[0.18em] hover:bg-muted" data-testid="button-more-orders">Show earlier purchases</button>
        </li>
      )}
    </>
  );
}
