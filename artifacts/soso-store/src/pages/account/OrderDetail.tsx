import { Link } from "wouter";
import { useVerifiedShopperAuth as useAuth } from "@/components/account/OwnedShopperAuthProvider";
import { getGetVerifiedShopperOrderQueryKey, useGetVerifiedShopperOrder, type ShopperProfile } from "@workspace/api-client-react";
import { ChevronLeft, RotateCw } from "lucide-react";
import { apiErrorInfo, formatMinor, humanize, shopperScopedKey } from "@/components/account/ShopperClerkProvider";

export default function OrderDetail({ id, profile }: { id: string; profile: ShopperProfile }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const query = useGetVerifiedShopperOrder(id, {
    query: { enabled: isLoaded && !!isSignedIn && !!userId && !!id, retry: false, queryKey: shopperScopedKey(getGetVerifiedShopperOrderQueryKey(id), userId) },
  });
  const back = (
    <Link href="/" className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-secondary hover:text-foreground" data-testid="link-back-account">
      <ChevronLeft size={15} /> My account
    </Link>
  );
  if (query.isLoading) {
    return <div className="mx-auto max-w-3xl px-6 py-14" role="status" aria-busy="true">{back}<div className="mt-8 h-10 w-64 animate-pulse bg-muted" /><div className="mt-8 h-56 animate-pulse bg-muted/60" /></div>;
  }
  if (query.isError) {
    const err = apiErrorInfo(query.error);
    return (
      <div className="mx-auto max-w-3xl px-6 py-14">
        {back}
        <h1 className="soso-display mt-8 text-3xl">{err.status === 404 ? "Order details unavailable" : "This order did not load"}</h1>
        <p className="mt-4 text-sm text-secondary" role="alert">
          {err.status === 404 ? "Online details are not available for this purchase. Some orders, such as in-store purchases, appear in your history without an online detail view." : err.message ?? "Please try again."}
        </p>
        {err.status !== 404 && <button type="button" onClick={() => void query.refetch()} className="mt-6 inline-flex items-center gap-2 bg-foreground px-5 py-3 text-xs font-bold uppercase tracking-[0.2em] text-background" data-testid="button-retry-order"><RotateCw size={14} /> Try again</button>}
      </div>
    );
  }
  const detail = query.data;
  if (!detail) return null;
  const { order } = detail;
  const facts: [string, string][] = [
    ["Order status", humanize(order.status)],
    ["Payment", humanize(order.paymentStatus)],
    ["Fulfilment", humanize(detail.fulfillmentStatus)],
    ["Delivery", humanize(detail.deliveryStatus)],
  ];
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 md:py-16">
      {back}
      <div className="soso-rise mt-8 border-b border-border pb-8">
        <p className="text-[11px] uppercase tracking-[0.3em] text-[#8a6a22]">Order for {profile.name}</p>
        <h1 className="soso-display mt-3 text-4xl" data-testid="text-order-number">{order.number ? `Order ${order.number}` : "Your order"}</h1>
        {order.createdAt && <p className="mt-2 text-sm text-secondary">Placed {new Date(order.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>}
      </div>
      <dl className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
        {facts.map(([label, value]) => (
          <div key={label} className="bg-background p-4">
            <dt className="text-[10px] uppercase tracking-[0.2em] text-secondary">{label}</dt>
            <dd className="mt-2 text-sm">{value}</dd>
          </div>
        ))}
      </dl>
      {detail.trackingReference && <p className="mt-5 text-sm">Tracking reference: <span className="font-semibold" data-testid="text-tracking">{detail.trackingReference}</span></p>}
      <ul className="mt-10 border-t border-border">
        {detail.items.map((item, i) => (
          <li key={`${item.name}-${i}`} className="flex justify-between gap-4 border-b border-border py-4 text-sm" data-testid={`row-order-item-${i}`}>
            <span>{item.name} <span className="text-secondary">× {item.quantity}</span></span>
            <span>{formatMinor(item.totalMinor, order.currency)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6 space-y-2 text-sm">
        <div className="flex justify-between text-lg"><span>Total</span><strong>{formatMinor(order.totalMinor, order.currency)}</strong></div>
        <div className="flex justify-between text-secondary"><span>Paid</span><span>{formatMinor(order.paidMinor, order.currency)}</span></div>
      </div>
    </div>
  );
}
