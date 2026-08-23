import React, { FormEvent, useEffect, useMemo, useState } from "react";
import {
  getStaffExport,
  useAcknowledgeStaffNotification,
  useCreateStaffJournalPost,
  useCreateStaffPrivacyRequest,
  useGetStaffFunnel,
  useGetStaffOverview,
  useGetStaffProfile,
  useListStaffAuditEvents,
  useListStaffEnquiries,
  useListStaffJournalPosts,
  useListStaffNotifications,
  useListStaffOrders,
  useListStaffPrivacyRequests,
  useUpdateStaffEnquiry,
  useUpdateStaffJournalPost,
  useUpdateStaffOrder,
  useUpdateStaffPrivacyRequest,
  type StaffJournalPost,
  type StaffJournalPostInput,
  type Enquiry,
  type StaffAuditEvent,
  type StaffFunnel,
  type StaffNotification,
  type StaffOverview,
  type StaffOrder,
  type StaffOrderUpdateStatus,
  type StaffPrivacyRequest,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import {
  Activity,
  AlertCircle,
  Bell,
  Check,
  ChevronRight,
  ClipboardCheck,
  Download,
  FileText,
  Loader2,
  LockKeyhole,
  Mail,
  MessageSquare,
  Package,
  PenLine,
  Plus,
  Save,
  ShieldAlert,
  ShieldCheck,
  Truck,
} from "lucide-react";

type StaffWorkflowDisplayStatus = StaffOrderUpdateStatus | "paid";

const nextOrderStatuses: Record<StaffWorkflowDisplayStatus, StaffOrderUpdateStatus[]> = {
  paid: ["atelier_confirmation", "cancelled"],
  atelier_confirmation: ["in_production", "cancelled"],
  in_production: ["ready"],
  ready: ["fulfilled"],
  fulfilled: [],
  cancelled: [],
};

const emptyArticle: StaffJournalPostInput = {
  slug: "",
  title: "",
  excerpt: "",
  body: "",
  coverImageUrl: null,
  coverImageAlt: null,
  authorName: "",
  category: null,
  tags: null,
  seoTitle: null,
  seoDescription: null,
  readTimeMinutes: null,
  relatedProductSlugs: null,
  status: "draft",
};

function dateRangeFor(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  return { from: format(start, "yyyy-MM-dd"), to: format(end, "yyyy-MM-dd") };
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function Staff() {
  const { data: profile, isLoading: profileLoading, isError: profileError } = useGetStaffProfile();
  const [rangeDays, setRangeDays] = useState(7);
  const range = useMemo(() => dateRangeFor(rangeDays), [rangeDays]);
  const canManageOrders = profile?.role === "owner" || profile?.role === "operations";
  const canManageEnquiries = canManageOrders || profile?.role === "stylist";
  const canSeeAnalytics = profile?.role === "owner" || profile?.role === "analyst";
  const canManagePrivacy = canManageOrders;

  const overview = useGetStaffOverview(range, { query: { queryKey: ["staff-overview", range.from, range.to], enabled: Boolean(profile), refetchInterval: 60_000 } });
  const funnel = useGetStaffFunnel(range, { query: { queryKey: ["staff-funnel", range.from, range.to], enabled: canSeeAnalytics, refetchInterval: 60_000 } });
  const orders = useListStaffOrders(range, { query: { queryKey: ["staff-orders", range.from, range.to], enabled: canManageOrders, refetchInterval: 45_000 } });
  const enquiries = useListStaffEnquiries({ query: { queryKey: ["staff-enquiries"], enabled: canManageEnquiries, refetchInterval: 45_000 } });
  const privacy = useListStaffPrivacyRequests({ query: { queryKey: ["staff-privacy"], enabled: canManagePrivacy, refetchInterval: 45_000 } });
  const notifications = useListStaffNotifications({ query: { queryKey: ["staff-notifications"], enabled: Boolean(profile), refetchInterval: 45_000 } });
  const audit = useListStaffAuditEvents(range, { query: { queryKey: ["staff-audit", range.from, range.to], enabled: canSeeAnalytics, refetchInterval: 60_000 } });

  if (profileLoading) {
    return <LoadingScreen />;
  }
  if (profileError || !profile) {
    return <AccessRestricted />;
  }

  const refreshOperations = () => {
    const refreshes: Promise<unknown>[] = [overview.refetch(), notifications.refetch()];
    if (canManageOrders) refreshes.push(orders.refetch());
    if (canManageEnquiries) refreshes.push(enquiries.refetch());
    if (canManagePrivacy) refreshes.push(privacy.refetch());
    if (canSeeAnalytics) refreshes.push(audit.refetch(), funnel.refetch());
    void Promise.all(refreshes);
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <header className="border-b border-border pb-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-primary">SOSO internal</p>
            <h1 className="mt-2 text-4xl soso-display text-foreground">Atelier operations</h1>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <span className="bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">{profile.role}</span>
              <span className="text-muted-foreground">{profile.email}</span>
            </div>
          </div>
          <DateRangeControl rangeDays={rangeDays} onChange={setRangeDays} />
        </div>
      </header>

      <section className="mt-7 flex flex-col gap-3 border border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Activity className="mt-0.5 shrink-0 text-primary" size={18} />
          <p className="text-sm text-muted-foreground">
            {overview.data ? `Showing ${overview.data.from} to ${overview.data.to}. Data refreshed ${format(new Date(overview.data.generatedAt), "HH:mm")}; operational figures refresh every ${overview.data.freshnessMinutes} minutes.` : "Loading the current operational view…"}
          </p>
        </div>
        <span className="text-xs uppercase tracking-widest text-muted-foreground">{format(new Date(), "EEEE, d MMMM")}</span>
      </section>

      <NotificationStrip notifications={notifications.data} loading={notifications.isLoading} onAcknowledged={() => void notifications.refetch()} />
      <Pulse overview={overview.data} loading={overview.isLoading} />

      {canSeeAnalytics && (
        <AnalyticsSection
          funnel={funnel.data}
          auditEvents={audit.data}
          loading={funnel.isLoading || audit.isLoading}
          range={range}
          role={profile.role}
          onExported={() => void audit.refetch()}
        />
      )}

      {(canManageOrders || canManageEnquiries) && (
        <section className="mt-12 grid gap-8 xl:grid-cols-2">
          {canManageOrders && <OrdersSection orders={orders.data} loading={orders.isLoading} canRefund={profile.role === "owner"} onChanged={refreshOperations} />}
          {canManageEnquiries && <EnquiriesSection enquiries={enquiries.data} loading={enquiries.isLoading} onChanged={refreshOperations} />}
        </section>
      )}

      {canManagePrivacy && <PrivacySection role={profile.role} requests={privacy.data} loading={privacy.isLoading} onChanged={refreshOperations} />}
      {(profile.role === "owner" || profile.role === "editor") && <JournalManagementSection />}
    </main>
  );
}

function LoadingScreen() {
  return <div className="flex min-h-[70vh] items-center justify-center"><Loader2 className="animate-spin text-primary" size={32} /></div>;
}

function AccessRestricted() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <ShieldAlert className="mb-5 text-destructive" size={46} strokeWidth={1} />
      <h1 className="text-3xl soso-display text-foreground">Access restricted</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">This workspace is only available to staff accounts that have been assigned a SOSO role.</p>
    </div>
  );
}

function DateRangeControl({ rangeDays, onChange }: { rangeDays: number; onChange: (days: number) => void }) {
  return (
    <div className="flex items-center gap-2" aria-label="Reporting range">
      {[7, 30, 90].map((days) => (
        <button key={days} type="button" onClick={() => onChange(days)} className={`min-h-11 border px-3 text-[10px] font-semibold uppercase tracking-[0.14em] ${rangeDays === days ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:border-primary"}`}>
          {days === 7 ? "7 days" : `${days} days`}
        </button>
      ))}
    </div>
  );
}

function Pulse({ overview, loading }: { overview: StaffOverview | undefined; loading: boolean }) {
  if (loading || !overview) return <div className="mt-8 h-44 animate-pulse border border-border bg-muted/20" />;
  return (
    <section className="mt-8">
      <div className="mb-4 flex items-center gap-2"><Activity size={18} className="text-primary" /><h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-foreground">Daily pulse</h2></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {overview.metrics.map((metric) => (
          <article key={metric.key} className="border border-border bg-card p-5">
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{metric.label}</p>
            <p className="mt-4 text-4xl soso-display text-foreground">{metric.value.toLocaleString()}</p>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{metric.definition}</p>
          </article>
        ))}
      </div>
      {!overview.paymentIsLive && (
        <div className="mt-4 flex gap-3 border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 shrink-0" size={18} />
          <p><strong>Payments are not live.</strong> No checkout confirmation should be treated as a verified order until the payment workflow is enabled.</p>
        </div>
      )}
    </section>
  );
}

function NotificationStrip({ notifications, loading, onAcknowledged }: { notifications: StaffNotification[] | undefined; loading: boolean; onAcknowledged: () => void }) {
  const acknowledge = useAcknowledgeStaffNotification();
  const active = notifications?.filter((item) => !item.acknowledged) ?? [];
  if (loading || !active.length) return null;
  return (
    <section className="mt-7 border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3"><Bell size={16} className="text-primary" /><h2 className="text-xs font-semibold uppercase tracking-[0.16em]">Operational notifications</h2></div>
      <div className="divide-y divide-border">
        {active.slice(0, 4).map((item) => (
          <div key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-sm font-medium text-foreground">{item.title}</p><p className="mt-1 text-sm text-muted-foreground">{item.body}</p></div>
            <button type="button" disabled={acknowledge.isPending} onClick={async () => { await acknowledge.mutateAsync({ id: item.id, data: { acknowledged: true } }); onAcknowledged(); }} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 border border-border px-3 text-xs font-semibold uppercase tracking-wider hover:border-primary disabled:opacity-50"><Check size={14} /> Acknowledge</button>
          </div>
        ))}
      </div>
    </section>
  );
}

function AnalyticsSection({ funnel, auditEvents, loading, range, role, onExported }: { funnel: StaffFunnel | undefined; auditEvents: StaffAuditEvent[] | undefined; loading: boolean; range: { from: string; to: string }; role: string; onExported: () => void }) {
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const download = async (report: "operations_summary" | "analytics_summary") => {
    setExporting(true);
    setNotice("");
    try {
      const result = await getStaffExport({ report, ...range });
      const csv = [result.columns.join(","), ...result.rows.map((row) => result.columns.map((column) => JSON.stringify(row[column] ?? "")).join(","))].join("\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice(`${result.filename} downloaded. ${result.privacyNote}`);
      onExported();
    } catch (error) {
      setNotice(errorMessage(error, "The controlled export could not be generated."));
    } finally {
      setExporting(false);
    }
  };
  return (
    <section className="mt-12 border-t border-border pt-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs uppercase tracking-[0.2em] text-primary">Owner & analyst reporting</p><h2 className="mt-2 text-3xl soso-display">Privacy-safe storefront signal</h2><p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{funnel?.privacyNote ?? "Only consented, aggregate first-party data is used in this report."}</p></div>
        <div className="flex gap-2">
          <button type="button" disabled={exporting} onClick={() => void download("analytics_summary")} className="inline-flex min-h-11 items-center gap-2 border border-border px-3 text-xs font-semibold uppercase tracking-wider hover:border-primary disabled:opacity-50"><Download size={15} /> Analytics CSV</button>
          {role === "owner" && <button type="button" disabled={exporting} onClick={() => void download("operations_summary")} className="inline-flex min-h-11 items-center gap-2 bg-primary px-3 text-xs font-semibold uppercase tracking-wider text-primary-foreground disabled:opacity-50"><Download size={15} /> Operations CSV</button>}
        </div>
      </div>
      {notice && <p role="status" className="mt-4 border border-primary/25 bg-primary/5 p-3 text-sm text-foreground">{notice}</p>}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="border border-border bg-card">{loading || !funnel ? <LoadingRows /> : <><div className="border-b border-border p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Consented event counts · {funnel.from} to {funnel.to}</div><div className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-3">{funnel.events.map((event) => <div key={event.eventName} className="p-4"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{event.eventName.replaceAll("_", " ")}</p><p className="mt-3 text-2xl soso-display">{event.count.toLocaleString()}</p></div>)}</div></>}</div>
        <div className="border border-border bg-card"><div className="border-b border-border p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Audit visibility</div>{loading ? <LoadingRows /> : !auditEvents?.length ? <Empty label="No audited operational actions in this period." /> : <div className="divide-y divide-border">{auditEvents.slice(0, 6).map((event) => <div key={event.id} className="p-4"><p className="text-sm font-medium">{event.action.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-muted-foreground">{event.entityType.replaceAll("_", " ")} · {format(new Date(event.createdAt), "d MMM, HH:mm")}</p></div>)}</div>}</div>
      </div>
    </section>
  );
}

function OrdersSection({ orders, loading, canRefund, onChanged }: { orders: StaffOrder[] | undefined; loading: boolean; canRefund: boolean; onChanged: () => void }) {
  return <section><SectionHeading icon={Package} title="Order & production queue" description="Every currently active paid, atelier, production, and ready-to-deliver order stays here until it reaches a terminal state." /> <div className="border border-border bg-card">{loading ? <LoadingRows /> : !orders?.length ? <Empty label="There are no active orders in the atelier queue." /> : <div className="divide-y divide-border">{orders.map((order) => <OrderRow key={order.id} order={order} canRefund={canRefund} onChanged={onChanged} />)}</div>}</div></section>;
}

function OrderRow({ order, canRefund, onChanged }: { order: StaffOrder; canRefund: boolean; onChanged: () => void }) {
  const update = useUpdateStaffOrder();
  const [status, setStatus] = useState<StaffWorkflowDisplayStatus>(order.status as StaffWorkflowDisplayStatus);
  const [atelierNotes, setAtelierNotes] = useState(order.atelierNotes ?? "");
  const [deliveryNotes, setDeliveryNotes] = useState(order.deliveryNotes ?? "");
  const [refundRequestReason, setRefundRequestReason] = useState("");
  const [refundDecisionNote, setRefundDecisionNote] = useState("");
  const [notice, setNotice] = useState("");
  const currentStatus = order.status as StaffWorkflowDisplayStatus;
  const availableStatuses = [currentStatus, ...nextOrderStatuses[currentStatus]];
  useEffect(() => {
    setStatus(currentStatus);
    setAtelierNotes(order.atelierNotes ?? "");
    setDeliveryNotes(order.deliveryNotes ?? "");
    setRefundRequestReason("");
    setRefundDecisionNote("");
  }, [order.id, order.updatedAt, order.atelierNotes, order.deliveryNotes, currentStatus]);
  const save = async () => {
    setNotice("");
    try {
      const statusUpdate = status !== currentStatus && status !== "paid" ? status : undefined;
      await update.mutateAsync({ id: order.id, data: { ...(statusUpdate ? { status: statusUpdate } : {}), atelierNotes: atelierNotes || null, deliveryNotes: deliveryNotes || null } });
      setNotice("Order updated.");
      onChanged();
    } catch (error) { setNotice(errorMessage(error, "This order could not be updated.")); }
  };
  const requestRefundReview = async () => {
    try {
      await update.mutateAsync({ id: order.id, data: { refundRequestReason } });
      setNotice("Internal refund request sent for owner review. No payment refund has been issued.");
      onChanged();
    } catch (error) { setNotice(errorMessage(error, "The internal refund request could not be recorded.")); }
  };
  const reviewRefundRequest = async (refundRequestDecision: "approved" | "declined") => {
    try {
      await update.mutateAsync({ id: order.id, data: { refundRequestDecision, refundDecisionNote } });
      setNotice(`Internal refund request ${refundRequestDecision}. Payment-provider execution remains separate.`);
      onChanged();
    } catch (error) { setNotice(errorMessage(error, "The refund request could not be reviewed.")); }
  };
  return (
    <article className="p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row"><div><div className="flex items-center gap-2"><span className="font-mono text-sm text-primary">#{order.orderNumber}</span><StatusBadge status={order.status} /></div><p className="mt-2 text-sm font-medium">{order.customerName}</p><p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Mail size={12} /> {order.customerEmail}</p></div><div className="sm:text-right"><p className="text-xl soso-display">{order.currency} {Number(order.total).toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">{format(new Date(order.createdAt), "d MMM yyyy")}</p></div></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Workflow<select value={status} disabled={availableStatuses.length === 1} onChange={(event) => setStatus(event.target.value as StaffWorkflowDisplayStatus)} className="staff-input mt-1"><>{availableStatuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</></select></label><label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Delivery note<input value={deliveryNotes} onChange={(event) => setDeliveryNotes(event.target.value)} placeholder="Dispatch, courier, or delivery note" className="staff-input mt-1" /></label></div>
      <label className="mt-3 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Atelier note<textarea value={atelierNotes} onChange={(event) => setAtelierNotes(event.target.value)} rows={2} placeholder="Production instruction or progress note" className="staff-input mt-1 resize-y" /></label>
      <div className="mt-4 border border-border bg-muted/20 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Internal refund review</p>
        {order.refundRequestStatus ? (
          <div className="mt-2">
            <div className="flex flex-wrap items-center gap-2"><StatusBadge status={`refund ${order.refundRequestStatus}`} /><p className="text-xs text-muted-foreground">No payment refund is issued or confirmed from this workspace.</p></div>
            <p className="mt-2 text-sm text-foreground/80">{order.refundRequestReason}</p>
            {order.refundDecisionNote && <p className="mt-1 text-xs text-muted-foreground">Decision note: {order.refundDecisionNote}</p>}
            {canRefund && order.refundRequestStatus === "requested" && <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={refundDecisionNote} onChange={(event) => setRefundDecisionNote(event.target.value)} minLength={8} placeholder="Owner decision note" className="staff-input flex-1" /><button type="button" disabled={update.isPending || refundDecisionNote.trim().length < 8} onClick={() => void reviewRefundRequest("approved")} className="min-h-10 border border-primary px-3 text-xs font-semibold uppercase tracking-wider text-primary disabled:opacity-50">Approve internally</button><button type="button" disabled={update.isPending || refundDecisionNote.trim().length < 8} onClick={() => void reviewRefundRequest("declined")} className="min-h-10 border border-border px-3 text-xs font-semibold uppercase tracking-wider disabled:opacity-50">Decline</button></div>}
          </div>
        ) : (
          <div className="mt-2 flex flex-col gap-2 sm:flex-row"><input value={refundRequestReason} onChange={(event) => setRefundRequestReason(event.target.value)} minLength={8} placeholder="Reason to request a payment refund review" className="staff-input flex-1" /><button type="button" disabled={update.isPending || refundRequestReason.trim().length < 8} onClick={() => void requestRefundReview()} className="min-h-10 border border-border px-3 text-xs font-semibold uppercase tracking-wider hover:border-primary disabled:opacity-50">Request review</button></div>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3"><p role="status" className="text-xs text-muted-foreground">{notice}</p><button type="button" disabled={update.isPending} onClick={() => void save()} className="inline-flex min-h-10 items-center gap-2 bg-primary px-3 text-xs font-semibold uppercase tracking-wider text-primary-foreground disabled:opacity-50">{update.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save</button></div>
    </article>
  );
}

function EnquiriesSection({ enquiries, loading, onChanged }: { enquiries: Enquiry[] | undefined; loading: boolean; onChanged: () => void }) {
  return <section><SectionHeading icon={MessageSquare} title="Customer support queue" description="Track the internal handling state; use your approved client channel for replies." /><div className="border border-border bg-card">{loading ? <LoadingRows /> : !enquiries?.length ? <Empty label="Inbox zero. There are no customer enquiries." /> : <div className="divide-y divide-border">{enquiries.map((enquiry) => <EnquiryRow key={enquiry.id} enquiry={enquiry} onChanged={onChanged} />)}</div>}</div></section>;
}

function EnquiryRow({ enquiry, onChanged }: { enquiry: Enquiry; onChanged: () => void }) {
  const update = useUpdateStaffEnquiry();
  const [status, setStatus] = useState(enquiry.status);
  const [handlingNotes, setHandlingNotes] = useState(enquiry.handlingNotes ?? "");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    setStatus(enquiry.status);
    setHandlingNotes(enquiry.handlingNotes ?? "");
  }, [enquiry.id, enquiry.updatedAt, enquiry.status, enquiry.handlingNotes]);
  return <article className="p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row"><div><p className="font-medium">{enquiry.name || "Anonymous client"}</p>{enquiry.email && <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Mail size={12} /> {enquiry.email}</p>}{enquiry.productSlug && <p className="mt-2 text-[10px] uppercase tracking-wider text-primary">Reference: {enquiry.productSlug}</p>}</div><span className="h-fit border border-border px-2 py-1 text-[10px] uppercase tracking-wider">{enquiry.status.replaceAll("_", " ")}</span></div><p className="mt-4 text-sm leading-relaxed text-foreground/80">“{enquiry.message}”</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Queue status<select value={status} onChange={(event) => setStatus(event.target.value)} className="staff-input mt-1"><option value="new">New</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></label><label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Internal handling note<textarea value={handlingNotes} onChange={(event) => setHandlingNotes(event.target.value)} rows={2} className="staff-input mt-1 resize-y" /></label></div><div className="mt-3 flex items-center justify-between"><p role="status" className="text-xs text-muted-foreground">{notice}</p><button type="button" disabled={update.isPending} onClick={async () => { try { await update.mutateAsync({ id: enquiry.id, data: { status: status as "new" | "in_progress" | "resolved" | "closed", handlingNotes: handlingNotes || null } }); setNotice("Enquiry updated."); onChanged(); } catch (error) { setNotice(errorMessage(error, "This enquiry could not be updated.")); } }} className="inline-flex min-h-10 items-center gap-2 border border-border px-3 text-xs font-semibold uppercase tracking-wider hover:border-primary disabled:opacity-50"><ClipboardCheck size={14} /> Update</button></div></article>;
}

function PrivacySection({ role, requests, loading, onChanged }: { role: string; requests: StaffPrivacyRequest[] | undefined; loading: boolean; onChanged: () => void }) {
  const create = useCreateStaffPrivacyRequest();
  const [requestType, setRequestType] = useState<"access" | "deletion">("access");
  const [requesterEmail, setRequesterEmail] = useState("");
  const [requesterName, setRequesterName] = useState("");
  const [notice, setNotice] = useState("");
  const submit = async (event: FormEvent) => { event.preventDefault(); try { await create.mutateAsync({ data: { requestType, requesterEmail, requesterName: requesterName || null } }); setRequesterEmail(""); setRequesterName(""); setNotice("Privacy request logged for verification."); onChanged(); } catch (error) { setNotice(errorMessage(error, "The privacy request could not be logged.")); } };
  return <section className="mt-12 border-t border-border pt-10"><SectionHeading icon={LockKeyhole} title="Privacy request procedure" description="Log an access or deletion request, verify identity, then only an owner may complete or reject it with a recorded resolution." /><div className="grid gap-6 xl:grid-cols-[0.7fr_1.3fr]"><form onSubmit={submit} className="border border-border bg-card p-5"><p className="text-sm font-medium">Log received request</p><div className="mt-4 space-y-3"><label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Request type<select value={requestType} onChange={(event) => setRequestType(event.target.value as "access" | "deletion")} className="staff-input mt-1"><option value="access">Data access</option><option value="deletion">Data deletion</option></select></label><label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Requester email<input required type="email" value={requesterEmail} onChange={(event) => setRequesterEmail(event.target.value)} className="staff-input mt-1" /></label><label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Requester name (if provided)<input value={requesterName} onChange={(event) => setRequesterName(event.target.value)} className="staff-input mt-1" /></label><button disabled={create.isPending} className="inline-flex min-h-11 w-full items-center justify-center gap-2 bg-primary text-xs font-semibold uppercase tracking-wider text-primary-foreground disabled:opacity-50"><ShieldCheck size={15} /> {create.isPending ? "Logging…" : "Log request"}</button><p role="status" className="text-xs text-muted-foreground">{notice}</p></div></form><div className="border border-border bg-card">{loading ? <LoadingRows /> : !requests?.length ? <Empty label="No privacy requests are waiting." /> : <div className="divide-y divide-border">{requests.map((request) => <PrivacyRow key={request.id} request={request} role={role} onChanged={onChanged} />)}</div>}</div></div></section>;
}

function PrivacyRow({ request, role, onChanged }: { request: StaffPrivacyRequest; role: string; onChanged: () => void }) {
  const update = useUpdateStaffPrivacyRequest();
  const [status, setStatus] = useState(request.status);
  const [verificationNote, setVerificationNote] = useState(request.verificationNote ?? "");
  const [resolutionNote, setResolutionNote] = useState(request.resolutionNote ?? "");
  const [notice, setNotice] = useState("");
  const owner = role === "owner";
  const locked = request.status === "completed" || request.status === "rejected";
  useEffect(() => {
    setStatus(request.status);
    setVerificationNote(request.verificationNote ?? "");
    setResolutionNote(request.resolutionNote ?? "");
  }, [request.id, request.updatedAt, request.status, request.verificationNote, request.resolutionNote]);
  return <article className="p-5"><div className="flex flex-col justify-between gap-2 sm:flex-row"><div><p className="text-sm font-medium capitalize">{request.requestType} request</p><p className="mt-1 text-xs text-muted-foreground">{request.requesterName || "Requester"} · {request.requesterEmail}</p></div><StatusBadge status={request.status} /></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Procedure status<select value={status} disabled={locked} onChange={(event) => setStatus(event.target.value as typeof status)} className="staff-input mt-1"><option value="received">Received</option><option value="identity_verified">Identity verified</option><option value="in_progress">In progress</option>{owner && <><option value="completed">Completed</option><option value="rejected">Rejected</option></>}</select></label><label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Verification note<textarea disabled={locked} value={verificationNote} onChange={(event) => setVerificationNote(event.target.value)} rows={2} className="staff-input mt-1 resize-y" /></label></div>{owner && <label className="mt-3 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Resolution note (required for complete/reject)<textarea disabled={locked} value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} rows={2} className="staff-input mt-1 resize-y" /></label>}<div className="mt-3 flex items-center justify-between"><p role="status" className="text-xs text-muted-foreground">{locked ? "This terminal privacy record is locked." : notice}</p><button type="button" disabled={locked || update.isPending} onClick={async () => { try { await update.mutateAsync({ id: request.id, data: { status, verificationNote: verificationNote || null, ...(owner ? { resolutionNote: resolutionNote || null } : {}) } }); setNotice("Privacy request updated."); onChanged(); } catch (error) { setNotice(errorMessage(error, "This request could not be updated.")); } }} className="inline-flex min-h-10 items-center gap-2 border border-border px-3 text-xs font-semibold uppercase tracking-wider hover:border-primary disabled:opacity-50"><Save size={14} /> Save procedure step</button></div></article>;
}

function JournalManagementSection() {
  const { data: posts, isLoading, refetch } = useListStaffJournalPosts();
  const create = useCreateStaffJournalPost();
  const update = useUpdateStaffJournalPost();
  const [article, setArticle] = useState<StaffJournalPostInput>(emptyArticle);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const save = async (event: FormEvent) => { event.preventDefault(); try { if (editingId) { await update.mutateAsync({ id: editingId, data: article }); } else { const result = await create.mutateAsync({ data: article }); setEditingId(result.id); } setNotice("Article saved."); void refetch(); } catch (error) { setNotice(errorMessage(error, "Article could not be saved.")); } };
  const edit = (post: StaffJournalPost) => {
    setEditingId(post.id);
    setArticle({
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      body: post.body,
      coverImageUrl: post.coverImageUrl ?? null,
      coverImageAlt: post.coverImageAlt ?? null,
      authorName: post.authorName,
      category: post.category ?? null,
      tags: post.tags ?? null,
      seoTitle: post.seoTitle ?? null,
      seoDescription: post.seoDescription ?? null,
      readTimeMinutes: post.readTimeMinutes ?? null,
      relatedProductSlugs: post.relatedProductSlugs ?? null,
      status: post.status,
    });
    setNotice("");
  };

  const cloudinaryPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined;
  const cloudName = "kc9ubkqs";

  const openCloudinaryWidget = () => {
    const w = window as unknown as Record<string, unknown>;
    if (typeof w["cloudinary"] !== "object" || w["cloudinary"] === null) {
      alert("Cloudinary widget is loading. Please wait a moment and try again.");
      return;
    }
    const cloudinary = w["cloudinary"] as { createUploadWidget: (opts: Record<string, unknown>, cb: (err: unknown, result: { event: string; info: { secure_url: string; alt_text?: string } }) => void) => { open: () => void } };
    const widget = cloudinary.createUploadWidget(
      { cloudName, uploadPreset: cloudinaryPreset, multiple: false, sources: ["local", "url"], resourceType: "image", maxFileSize: 10000000 },
      (_err, result) => {
        if (result.event === "success") {
          setArticle((prev) => ({ ...prev, coverImageUrl: result.info.secure_url }));
          setNotice("Image uploaded via Cloudinary.");
        }
      },
    );
    widget.open();
  };

  return (
    <section className="mt-12 border-t border-border pt-10">
      <SectionHeading icon={PenLine} title="Journal management" description="Draft, publish, and archive approved editorial. Cloudinary image uploads require a signed upload preset — paste an image URL directly if the preset is not yet configured." />
      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        {/* Article list */}
        <div className="border border-border bg-card">
          {isLoading ? <LoadingRows /> : !posts?.length ? <Empty label="No Journal articles yet." /> : (
            <div className="divide-y divide-border">
              {posts.map((post) => (
                <button type="button" onClick={() => edit(post)} key={post.id} className="block w-full p-4 text-left hover:bg-muted/30">
                  <div className="flex justify-between gap-3">
                    <p className="font-medium">{post.title}</p>
                    <span className="text-[10px] uppercase tracking-wider text-primary">{post.status}</span>
                  </div>
                  {post.category && <p className="mt-0.5 text-[10px] uppercase tracking-wider text-primary/60">{post.category}</p>}
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{post.excerpt}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Article editor */}
        <form onSubmit={save} className="border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium">{editingId ? "Edit article" : "New article"}</p>
            <button type="button" onClick={() => { setEditingId(null); setArticle(emptyArticle); }} className="text-xs uppercase tracking-wider text-primary">
              <Plus size={13} className="mr-1 inline" /> New
            </button>
          </div>

          {/* Core fields */}
          <div className="grid gap-3 sm:grid-cols-2">
            <InputLabel label="Title"><input required minLength={4} value={article.title} onChange={(e) => setArticle({ ...article, title: e.target.value })} className="staff-input mt-1" /></InputLabel>
            <InputLabel label="Slug (URL)"><input required minLength={3} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={article.slug} onChange={(e) => setArticle({ ...article, slug: e.target.value.toLowerCase() })} className="staff-input mt-1" /></InputLabel>
          </div>
          <InputLabel label="Standfirst / excerpt"><textarea required minLength={20} rows={2} value={article.excerpt} onChange={(e) => setArticle({ ...article, excerpt: e.target.value })} className="staff-input mt-1 resize-y" /></InputLabel>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <InputLabel label="Author"><input required minLength={2} value={article.authorName} onChange={(e) => setArticle({ ...article, authorName: e.target.value })} className="staff-input mt-1" /></InputLabel>
            <InputLabel label="Category"><input value={article.category ?? ""} onChange={(e) => setArticle({ ...article, category: e.target.value || null })} placeholder="e.g. Craft" className="staff-input mt-1" /></InputLabel>
            <InputLabel label="Status"><select value={article.status} onChange={(e) => setArticle({ ...article, status: e.target.value as StaffJournalPostInput["status"] })} className="staff-input mt-1"><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></InputLabel>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <InputLabel label="Tags (comma-separated)"><input value={(article.tags ?? []).join(", ")} onChange={(e) => setArticle({ ...article, tags: e.target.value ? e.target.value.split(",").map((t) => t.trim()).filter(Boolean) : null })} placeholder="e.g. Kaftan, Abuja, Craft" className="staff-input mt-1" /></InputLabel>
            <InputLabel label="Reading time (minutes)"><input type="number" min={1} max={120} value={article.readTimeMinutes ?? ""} onChange={(e) => setArticle({ ...article, readTimeMinutes: e.target.value ? Number(e.target.value) : null })} placeholder="e.g. 5" className="staff-input mt-1" /></InputLabel>
          </div>

          {/* Cover image */}
          <InputLabel label="Cover image URL">
            <div className="mt-1 flex gap-2">
              <input value={article.coverImageUrl ?? ""} onChange={(e) => setArticle({ ...article, coverImageUrl: e.target.value || null })} placeholder="https://res.cloudinary.com/..." className="staff-input flex-1" />
              {cloudinaryPreset ? (
                <button type="button" onClick={openCloudinaryWidget} className="shrink-0 border border-border px-3 text-[10px] uppercase tracking-wider hover:border-primary">Upload</button>
              ) : (
                <span className="shrink-0 text-[10px] text-muted-foreground self-center">No upload preset yet — paste URL</span>
              )}
            </div>
          </InputLabel>
          <InputLabel label="Image alt text"><input value={article.coverImageAlt ?? ""} onChange={(e) => setArticle({ ...article, coverImageAlt: e.target.value || null })} placeholder="Descriptive alt text for the cover image" className="staff-input mt-1" /></InputLabel>

          {/* SEO overrides */}
          <p className="mt-5 mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-t border-border pt-4">SEO overrides (optional)</p>
          <InputLabel label="SEO title (override)"><input value={article.seoTitle ?? ""} onChange={(e) => setArticle({ ...article, seoTitle: e.target.value || null })} placeholder="Defaults to article title" maxLength={120} className="staff-input mt-1" /></InputLabel>
          <InputLabel label="SEO description (override)"><textarea rows={2} value={article.seoDescription ?? ""} onChange={(e) => setArticle({ ...article, seoDescription: e.target.value || null })} placeholder="Defaults to excerpt" maxLength={320} className="staff-input mt-1 resize-y" /></InputLabel>
          <InputLabel label="Related product slugs (comma-separated)"><input value={(article.relatedProductSlugs ?? []).join(", ")} onChange={(e) => setArticle({ ...article, relatedProductSlugs: e.target.value ? e.target.value.split(",").map((s) => s.trim()).filter(Boolean) : null })} placeholder="e.g. vault, ivory-kaftan" className="staff-input mt-1" /></InputLabel>

          {/* Article body */}
          <InputLabel label="Article body"><textarea required minLength={100} rows={10} value={article.body} onChange={(e) => setArticle({ ...article, body: e.target.value })} className="staff-input mt-1 resize-y" /></InputLabel>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p role="status" className="text-xs text-muted-foreground">{notice}</p>
            <button disabled={create.isPending || update.isPending} className="inline-flex min-h-11 items-center gap-2 bg-primary px-4 text-xs font-semibold uppercase tracking-wider text-primary-foreground disabled:opacity-50">
              <Save size={14} /> Save article
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function SectionHeading({ icon: Icon, title, description }: { icon: typeof Package; title: string; description: string }) {
  return <div className="mb-4"><div className="flex items-center gap-2"><Icon size={18} className="text-primary" /><h2 className="text-lg soso-display">{title}</h2></div><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p></div>;
}

function InputLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="mt-3 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}{children}</label>;
}

function LoadingRows() {
  return <div className="space-y-3 p-5">{[0, 1, 2].map((item) => <div key={item} className="h-14 animate-pulse bg-muted/40" />)}</div>;
}

function Empty({ label }: { label: string }) {
  return <div className="p-10 text-center text-sm text-muted-foreground"><FileText className="mx-auto mb-3 text-primary" size={22} />{label}</div>;
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === "completed" || status === "fulfilled" || status === "resolved" ? "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400" : status === "refunded" || status === "rejected" || status === "cancelled" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-primary/20 bg-primary/5 text-primary";
  return <span className={`border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${tone}`}>{status.replaceAll("_", " ")}</span>;
}