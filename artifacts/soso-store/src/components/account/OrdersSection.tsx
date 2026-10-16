import { useState } from "react";
import {
  getGetShopperOrderQueryKey,
  useGetShopperOrder,
  useGetShopperOrders,
  type ShopperOrder,
} from "@workspace/api-client-react";
import { Empty, ErrorNote, Section, Skeleton, formatDate, ghostButton, humanize, labelClass } from "./shared";

function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "string" || typeof value === "boolean") return String(value);
  return "";
}

function DictList({ title, data }: { title: string; data?: Record<string, unknown> }) {
  const rows = Object.entries(data ?? {}).filter(([, v]) => display(v) !== "");
  if (!rows.length) return null;
  return (
    <div>
      <h4 className={labelClass}>{title}</h4>
      <dl className="mt-3 grid gap-2 text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b border-border/60 pb-2">
            <dt className="text-secondary">{humanize(k)}</dt>
            <dd className="text-right text-foreground">{display(v)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function isPhysicalOrder(order: ShopperOrder) {
  return /physical|in[-_ ]?store|offline|pos|retail|boutique|atelier[-_ ]?walk/i.test(order.source ?? "");
}

function orderLabel(order: ShopperOrder) {
  return order.number ? `Order ${order.number}` : "Order";
}

function OrderDetail({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const query = useGetShopperOrder(orderId, { query: { enabled: Boolean(orderId), queryKey: getGetShopperOrderQueryKey(orderId) } });
  return (
    <div className="mt-4 border border-border p-5 md:p-8" data-testid={`panel-order-${orderId}`}>
      <div className="mb-6 flex items-center justify-between gap-4">
        <p className="soso-display text-lg uppercase tracking-[0.12em]">{query.data ? orderLabel(query.data.order) : "Order details"}</p>
        <button type="button" onClick={onClose} className="text-[11px] font-semibold uppercase tracking-[0.2em] underline underline-offset-4" data-testid="button-close-order">Close</button>
      </div>
      {query.isLoading && <Skeleton rows={2} />}
      {query.isError && <ErrorNote error={query.error} onRetry={() => void query.refetch()} />}
      {query.data && (() => {
        const order = query.data.order;
        return (
          <div className="grid gap-8 md:grid-cols-2">
            {order.items && order.items.length > 0 && (
              <div className="md:col-span-2">
                <h4 className={labelClass}>Items</h4>
                <ul className="mt-3 grid gap-3">
                  {order.items.map((item, i) => {
                    const name = display(item.name ?? item.productName ?? item.title) || `Item ${i + 1}`;
                    const qty = display(item.quantity);
                    const size = display(item.size ?? item.selectedSize);
                    return (
                      <li key={i} className="flex justify-between gap-4 border-b border-border/60 pb-3 text-[13px]" data-testid={`row-order-item-${i}`}>
                        <span className="text-foreground">{name}{size && <span className="text-secondary"> / {size}</span>}</span>
                        {qty && <span className="text-secondary">Qty {qty}</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <DictList title="Amounts" data={order.amounts} />
            <DictList title="Payment" data={order.payment} />
            <DictList title="Fulfilment" data={order.fulfillment} />
            <DictList title="Delivery" data={order.delivery} />
            <DictList title="Original charge" data={order.originalCharge} />
          </div>
        );
      })()}
    </div>
  );
}

export function OrdersSection() {
  const [offset, setOffset] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const query = useGetShopperOrders({ offset });

  return (
    <Section title="Orders" eyebrow="Online orders" testId="section-orders">
      {query.isLoading && <Skeleton />}
      {query.isError && <ErrorNote error={query.error} onRetry={() => void query.refetch()} />}
      {query.data && query.data.orders.length === 0 && offset === 0 && (
        <Empty title="No orders yet" body="Orders linked to your customer account will appear here. Previous guest orders are not claimed automatically." />
      )}
      {query.data && query.data.orders.length > 0 && (
        <ul className="grid gap-3">
          {query.data.orders.map((order, i) => {
            const physical = isPhysicalOrder(order);
            const id = physical ? undefined : order.id;
            return (
              <li key={order.id ?? i}>
                <div className="flex flex-wrap items-center justify-between gap-4 border border-border px-5 py-4" data-testid={`row-order-${order.id ?? i}`}>
                  <div>
                    <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-foreground">{orderLabel(order)}</p>
                    <p className="mt-1 text-[12px] text-secondary">{[formatDate(order.createdAt), order.currency].filter(Boolean).join(" / ")}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    {order.status && <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-secondary" data-testid={`status-order-${order.id ?? i}`}>{humanize(order.status)}</span>}
                    {physical && <span className="text-[10px] uppercase tracking-[0.2em] text-secondary" data-testid={`label-order-summary-only-${order.id ?? i}`}>In-store order / summary only</span>}
                    {id && (
                      <button type="button" className={ghostButton} onClick={() => setOpenId(openId === id ? null : id)} aria-expanded={openId === id} data-testid={`button-view-order-${id}`}>
                        {openId === id ? "Hide" : "View"}
                      </button>
                    )}
                  </div>
                </div>
                {id && openId === id && <OrderDetail orderId={id} onClose={() => setOpenId(null)} />}
              </li>
            );
          })}
        </ul>
      )}
      {query.data && (offset > 0 || query.data.hasMore) && (
        <div className="mt-6 flex gap-3">
          <button type="button" className={ghostButton} disabled={offset === 0 || query.isFetching} onClick={() => { const prev = history[history.length - 1] ?? 0; setHistory(history.slice(0, -1)); setOffset(prev); setOpenId(null); }} data-testid="button-orders-previous">Previous</button>
          <button type="button" className={ghostButton} disabled={!query.data.hasMore || query.data.nextOffset === null || query.isFetching} onClick={() => { if (query.data?.nextOffset == null) return; setHistory([...history, offset]); setOffset(query.data.nextOffset); setOpenId(null); }} data-testid="button-orders-next">Next</button>
        </div>
      )}
    </Section>
  );
}
