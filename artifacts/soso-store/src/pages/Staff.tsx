import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlatformEditorSite } from "../components/staff/PlatformEditorSite";
import { PlatformEditorCatalogue } from "../components/staff/PlatformEditorCatalogue";
import { PlatformEditorHomepage } from "../components/staff/PlatformEditorHomepage";
import { PlatformEditorPages } from "../components/staff/PlatformEditorPages";
import {
  customFetch,
  getStaffExport,
  useAcknowledgeStaffNotification,
  useCreateStaffJournalPost,
  useCreateStaffPrivacyRequest,
  useGetStaffOverview,
  useGetStaffProfile,
  useListStaffAccess,
  useListStaffEnquiries,
  useListStaffJournalPosts,
  useListStaffJournalPostRevisions,
  useListStaffNotifications,
  useListStaffOrders,
  useListStaffPrivacyRequests,
  listStaffFaqHistory,
  useUpdateStaffEnquiry,
  useUpdateStaffJournalPost,
  useUpdateStaffOrder,
  useUpdateStaffPrivacyRequest,
  type StaffJournalPost,
  type StaffJournalPostInput,
  type Enquiry,
  type FaqHistoryEvent,
  type FaqHistorySnapshot,
  type StaffNotification,
  type StaffOverview,
  type StaffOrder,
  type StaffOrderUpdateStatus,
  type StaffPrivacyRequest,
  useGetStaffMarketingPixels,
  useUpdateStaffMarketingPixels,
  useListStaffMarketingPixelRevisions,
  type MarketingPixelSettings,
  useUpdateStaffMeasurement,
  type StaffMeasurementUpdateAction,
  type StaffMeasurement,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import {
  Activity,
  AlertCircle,
  Bell,
  BarChart3,
  Check,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Download,
  Eye,
  FileText,
  Globe,
  History,
  Info,
  ImageUp,
  Loader2,
  LockKeyhole,
  LayoutDashboard,
  Mail,
  Menu,
  MessageSquare,
  Package,
  PenLine,
  Plus,
  Save,
  ShieldAlert,
  ShieldCheck,
  KeyRound,
  Target,
  Trash2,
  Truck,
  Users,
  X,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ExperimentLog } from "@/components/ExperimentLog";
import type { PlatformContent } from "@/data/platformContent";
import { Suspense, lazy } from "react";

const AnalyticsDashboard = lazy(() =>
  import("../components/staff/analytics/AnalyticsDashboard").then((m) => ({
    default: m.AnalyticsDashboard,
  }))
);


type SignedMediaUpload = {
  uploadURL: string;
  uploadMethod: "POST";
  uploadFields: Record<string, string>;
  objectPath: string;
};

async function uploadStaffMedia(file: File): Promise<string> {
  const signed = await customFetch<SignedMediaUpload>("/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
    responseType: "json",
  });
  const form = new FormData();
  Object.entries(signed.uploadFields).forEach(([key, value]) => form.append(key, value));
  form.append("file", file);
  const uploaded = await fetch(signed.uploadURL, { method: signed.uploadMethod, body: form });
  if (!uploaded.ok) throw new Error(`Media upload failed (${uploaded.status}).`);
  const finalized = await customFetch<{ objectPath: string }>("/api/storage/uploads/finalize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ objectPath: signed.objectPath }),
    responseType: "json",
  });
  return finalized.objectPath;
}

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
  relatedArticleSlugs: null,
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

function formatDateSafe(value: string | Date | null | undefined, pattern: string, fallback = "Unavailable") {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : format(date, pattern);
}

type StaffTab = "overview" | "orders" | "enquiries" | "privacy" | "journal" | "platform" | "faq" | "policies" | "redirects" | "marketing-pixels" | "analytics" | "staff";
type StaffNavGroup = {
  label: string;
  items: { id: StaffTab; label: string; icon: React.ElementType }[];
};
const staffNavItem = (id: StaffTab, label: string, icon: React.ElementType) => ({ id, label, icon });

export default function Staff() {
  const { data: profile, isLoading: profileLoading, isError: profileError } = useGetStaffProfile();
  const [range, setRange] = useState(() => dateRangeFor(7));
  const [activeTab, setActiveTabState] = useState<StaffTab>("overview");
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const canManageOrders = profile?.role === "owner" || profile?.role === "operations";
  const canViewOrders = canManageOrders || profile?.role === "administrator" || profile?.role === "stylist";
  const canManageMeasurements = canManageOrders || profile?.role === "administrator" || profile?.role === "stylist";
  const canManageEnquiries = canManageOrders || profile?.role === "stylist";
  const canSeeAnalytics = profile?.role === "owner" || profile?.role === "administrator" || profile?.role === "analyst";
  const canManagePrivacy = canManageOrders;
  const isEditorial = ["owner", "administrator", "editor"].includes(profile?.role as string);

  const overview = useGetStaffOverview(range, { query: { queryKey: ["staff-overview", range.from, range.to], enabled: Boolean(profile), refetchInterval: 60_000 } });
  const orders = useListStaffOrders(range, { query: { queryKey: ["staff-orders", range.from, range.to], enabled: canViewOrders, refetchInterval: 45_000 } });
  const enquiries = useListStaffEnquiries({ query: { queryKey: ["staff-enquiries"], enabled: canManageEnquiries, refetchInterval: 45_000 } });
  const privacy = useListStaffPrivacyRequests({ query: { queryKey: ["staff-privacy"], enabled: canManagePrivacy, refetchInterval: 45_000 } });
  const notifications = useListStaffNotifications({ query: { queryKey: ["staff-notifications"], enabled: Boolean(profile), refetchInterval: 45_000 } });

  const availableTabs = new Set<StaffTab>(["overview"]);
  if (canViewOrders) availableTabs.add("orders");
  if (canManageEnquiries) availableTabs.add("enquiries");
  if (canManagePrivacy) availableTabs.add("privacy");
  if (isEditorial) {
    availableTabs.add("journal"); availableTabs.add("platform"); availableTabs.add("faq"); availableTabs.add("policies");
  }
  if (profile?.role === "owner" || profile?.role === "administrator" || profile?.role === "operations") availableTabs.add("redirects");
  if (profile?.role === "owner" || profile?.role === "administrator") availableTabs.add("marketing-pixels");
  if (canSeeAnalytics) availableTabs.add("analytics");
  if (profile?.role === "owner") availableTabs.add("staff");

  useEffect(() => {
    const syncFromHash = () => {
      const tab = window.location.hash.replace("#", "") as StaffTab;
      if (availableTabs.has(tab)) setActiveTabState(tab);
    };
    window.addEventListener("hashchange", syncFromHash);
    syncFromHash();
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [profile?.role]);

  if (profileLoading) {
    return <LoadingScreen />;
  }
  if (profileError || !profile) {
    return <AccessRestricted />;
  }
  const setActiveTab = (tab: StaffTab) => {
    setActiveTabState(tab);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${tab}`);
    setMobileNavigationOpen(false);
  };

  const navigation: StaffNavGroup[] = [
    { label: "Workspace", items: [staffNavItem("overview", "Overview", LayoutDashboard)] },
    { label: "Atelier", items: [
      ...(canViewOrders ? [staffNavItem("orders", "Orders", Package)] : []),
      ...(canManageEnquiries ? [staffNavItem("enquiries", "Enquiries", MessageSquare)] : []),
    ] },
    { label: "Customer care", items: canManagePrivacy ? [staffNavItem("privacy", "Privacy requests", LockKeyhole)] : [] },
    { label: "Editorial", items: isEditorial ? [
      staffNavItem("journal", "Journal", PenLine), staffNavItem("platform", "Platform content", Globe), staffNavItem("faq", "FAQs", FileText),
    ] : [] },
    { label: "Governance", items: [
      ...(isEditorial ? [staffNavItem("policies", "Policies", ClipboardCheck)] : []),
      ...((profile.role === "owner" || profile.role === "administrator" || profile.role === "operations") ? [staffNavItem("redirects", "Redirects", ChevronRight)] : []),
      ...((profile.role === "owner" || profile.role === "administrator") ? [staffNavItem("marketing-pixels", "Marketing pixels", Target)] : []),
    ] },
    { label: "Intelligence", items: canSeeAnalytics ? [staffNavItem("analytics", "Analytics", BarChart3)] : [] },
    { label: "Administration", items: profile.role === "owner" ? [staffNavItem("staff", "Staff access", Users)] : [] },
  ].filter((group) => group.items.length);

  const refreshOperations = () => {
    const refreshes: Promise<unknown>[] = [overview.refetch(), notifications.refetch()];
    if (canViewOrders) refreshes.push(orders.refetch());
    if (canManageEnquiries) refreshes.push(enquiries.refetch());
    if (canManagePrivacy) refreshes.push(privacy.refetch());
    void Promise.all(refreshes);
  };

  const activeNavigation = navigation.flatMap((group) => group.items).find((item) => item.id === activeTab);
  const sidebar = (
    <nav aria-label="Staff workspace navigation" className="h-full overflow-y-auto bg-[#faf8f3] p-4">
      <div className="border-b border-border pb-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">SOSO internal</p>
        <p className="mt-2 text-xl soso-display">Atelier workspace</p>
        <p className="mt-3 truncate text-xs text-muted-foreground">{profile.email}</p>
        <span className="mt-2 inline-block bg-primary/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-primary">{profile.role}</span>
      </div>
      <div className="mt-5 space-y-5">
        {navigation.map((group) => <div key={group.label}>
          <p className="mb-1 px-3 text-[9px] font-semibold uppercase tracking-[0.19em] text-muted-foreground">{group.label}</p>
          <div className="space-y-1">{group.items.map((item) => {
            const Icon = item.icon;
            const selected = item.id === activeTab;
            return <button key={item.id} type="button" onClick={() => setActiveTab(item.id)} aria-current={selected ? "page" : undefined} className={`flex min-h-10 w-full items-center gap-3 border-l-2 px-3 text-left text-xs font-medium transition-colors ${selected ? "border-primary bg-primary/10 text-foreground" : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}>
              <Icon size={15} className={selected ? "text-primary" : ""} />{item.label}
            </button>;
          })}</div>
        </div>)}
      </div>
    </nav>
  );

  return <main className="min-h-screen bg-background">
    <div className="mx-auto max-w-[1600px] lg:grid lg:grid-cols-[252px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen border-r border-border lg:block">{sidebar}</aside>
      {mobileNavigationOpen && <div className="fixed inset-0 z-50 bg-black/60 lg:hidden" onClick={() => setMobileNavigationOpen(false)}>
        <aside className="relative h-full w-[280px] border-r border-border shadow-2xl" onClick={(event) => event.stopPropagation()}>
          <button type="button" onClick={() => setMobileNavigationOpen(false)} className="absolute right-3 top-3 z-10 inline-flex min-h-9 min-w-9 items-center justify-center border border-border bg-background" aria-label="Close staff navigation"><X size={16} /></button>
          {sidebar}
        </aside>
      </div>}
      <section className="min-w-0 overflow-x-hidden px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setMobileNavigationOpen(true)} className="inline-flex min-h-10 min-w-10 items-center justify-center border border-border lg:hidden" aria-label="Open staff navigation"><Menu size={18} /></button>
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">{activeNavigation?.label ?? "Workspace"}</p><h1 className="mt-1 text-3xl soso-display">{activeNavigation?.label ?? "Overview"}</h1></div>
          </div>
          {["overview", "orders", "analytics"].includes(activeTab) && <DateRangeControl range={range} onChange={setRange} />}
        </header>
        {activeTab === "overview" && <><section className="mt-6 flex flex-col gap-3 border border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><Activity className="mt-0.5 shrink-0 text-primary" size={18} /><p className="text-sm text-muted-foreground">{overview.data ? `Showing ${overview.data.from} to ${overview.data.to}. Data refreshed ${formatDateSafe(overview.data.generatedAt, "HH:mm")}; operational figures refresh every ${overview.data.freshnessMinutes} minutes.` : "Loading the current operational view…"}</p></div><span className="text-xs uppercase tracking-widest text-muted-foreground">{format(new Date(), "EEEE, d MMMM")}</span></section><NotificationStrip notifications={notifications.data} loading={notifications.isLoading} onAcknowledged={() => void notifications.refetch()} /><RoleCapabilityBanner role={profile.role} /><Pulse overview={overview.data} loading={overview.isLoading} /></>}
        {activeTab === "orders" && <OrdersSection orders={orders.data} loading={orders.isLoading} canRefund={profile.role === "owner"} onChanged={refreshOperations} readOnly={!canManageOrders} canManageMeasurements={canManageMeasurements} />}
        {activeTab === "enquiries" && <EnquiriesSection enquiries={enquiries.data} loading={enquiries.isLoading} onChanged={refreshOperations} />}
        {activeTab === "privacy" && <PrivacySection role={profile.role} requests={privacy.data} loading={privacy.isLoading} onChanged={refreshOperations} />}
        {activeTab === "journal" && <JournalManagementSection />}
        {activeTab === "platform" && <PlatformContentManagementSection />}
        {activeTab === "faq" && <FaqManagementSection />}
        {activeTab === "policies" && <PolicyManagementSection role={profile.role} />}
        {activeTab === "redirects" && <RedirectsManagementSection />}
        {activeTab === "marketing-pixels" && <MarketingPixelsSection />}
        {activeTab === "analytics" && (
          <>
            <Suspense fallback={<div className="flex h-64 items-center justify-center border border-dashed border-border bg-muted/5 text-sm font-medium uppercase tracking-wider text-muted-foreground">Loading Analytics Workspace...</div>}>
              <AnalyticsDashboard range={range} role={profile.role} />
            </Suspense>
            <ExperimentLog />
          </>
        )}
        {activeTab === "staff" && <StaffAccessSection />}
      </section>
    </div>
  </main>;
}

function StaffAccessSection() {
  const access = useListStaffAccess({ query: { queryKey: ["staff-access"], refetchInterval: 60_000 } });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"owner" | "administrator" | "operations" | "stylist" | "editor" | "analyst">("operations");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      await customFetch("/api/staff/access", { method: "POST", body: JSON.stringify({ email, password, role }), headers: { "content-type": "application/json" } });
      setEmail(""); setPassword(""); setNotice("Staff account created. Share the temporary password securely."); void access.refetch();
    } catch (error) { setNotice(errorMessage(error, "Staff access could not be added.")); } finally { setSaving(false); }
  };
  const update = async (id: string, data: { role?: string; isActive?: boolean }) => {
    try { await customFetch(`/api/staff/access/${id}`, { method: "PATCH", body: JSON.stringify(data), headers: { "content-type": "application/json" } }); setNotice("Staff access updated."); void access.refetch(); }
    catch (error) { setNotice(errorMessage(error, "Staff access could not be updated.")); }
  };
  return <section className="mt-12 border-t border-border pt-10">
    <SectionHeading icon={Users} title="Staff access" description="Create SOSO-managed staff accounts, assign roles, reset passwords, and deactivate access. Every change is recorded." />
    <form onSubmit={submit} className="grid gap-3 border border-border bg-card p-5 md:grid-cols-[1fr_1fr_0.7fr_auto] md:items-end">
      <InputLabel label="Email"><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="staff-input mt-1" /></InputLabel>
      <InputLabel label="Temporary password"><input required minLength={12} type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="staff-input mt-1" placeholder="12+ characters" /></InputLabel>
      <InputLabel label="Role"><select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="staff-input mt-1">{["owner", "administrator", "operations", "stylist", "editor", "analyst"].map((item) => <option key={item}>{item}</option>)}</select></InputLabel>
      <button disabled={saving} className="inline-flex min-h-10 items-center justify-center gap-2 bg-primary px-4 text-xs font-semibold uppercase tracking-wider text-primary-foreground disabled:opacity-50"><Plus size={14} /> Add access</button>
    </form>
    {notice && <p role="status" className="mt-3 border border-primary/25 bg-primary/5 p-3 text-sm">{notice}</p>}
    <div className="mt-5 border border-border bg-card">{access.isLoading ? <LoadingRows /> : !access.data?.length ? <Empty label="No staff accounts yet." /> : <div className="divide-y divide-border">{access.data.map((member) => <StaffAccessRow key={member.id} member={member} update={update} onReset={() => void access.refetch()} />)}</div>}</div>
  </section>;
}

function StaffAccessRow({ member, update, onReset }: { member: { id: string; email: string; role: string; isActive: boolean; createdAt: string | Date }; update: (id: string, data: { role?: string; isActive?: boolean }) => Promise<void>; onReset: () => void }) {
  const [resetting, setResetting] = useState(false);
  const reset = async () => {
    const password = window.prompt(`Set a new temporary password for ${member.email} (at least 12 characters):`);
    if (!password) return;
    setResetting(true);
    try { await customFetch(`/api/staff/access/${member.id}/password`, { method: "POST", body: JSON.stringify({ password }) }); onReset(); }
    finally { setResetting(false); }
  };
  return <div className="flex flex-col gap-3 p-5 lg:flex-row lg:items-center lg:justify-between"><div><p className="font-medium">{member.email}</p><p className="mt-1 text-xs text-muted-foreground">SOSO-managed account · added {format(new Date(member.createdAt), "d MMM yyyy")}</p></div><div className="flex flex-wrap items-center gap-2"><span className={`border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${member.isActive ? "border-green-500/30 text-green-600" : "border-border text-muted-foreground"}`}>{member.isActive ? "Active" : "Inactive"}</span><select value={member.role} onChange={(e) => void update(member.id, { role: e.target.value })} className="staff-input w-auto" aria-label={`Role for ${member.email}`}>{["owner", "administrator", "operations", "stylist", "editor", "analyst"].map((item) => <option key={item}>{item}</option>)}</select><button type="button" disabled={resetting} onClick={() => void reset()} className="border border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wider hover:border-primary disabled:opacity-50"><KeyRound size={13} className="mr-1 inline" /> Reset password</button><button type="button" onClick={() => void update(member.id, { isActive: !member.isActive })} className="border border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wider hover:border-primary">{member.isActive ? "Deactivate" : "Reactivate"}</button></div></div>;
}

type PlatformContentRow = {
  draft: PlatformContent | null;
  published: PlatformContent | null;
  draftUpdatedAt: string | null;
  publishedAt: string | null;
};
type PlatformRevision = { id?: string; createdAt?: string; action?: string; publishedAt?: string | null };
type PlatformSection = "complete" | "site" | "homepage" | "catalogue" | "pages";
const platformSections: { id: PlatformSection; label: string }[] = [
  { id: "complete", label: "Complete document" },
  { id: "site", label: "Site & navigation" },
  { id: "homepage", label: "Homepage" },
  { id: "catalogue", label: "Catalogue" },
  { id: "pages", label: "Pages & SEO" },
];

function PlatformContentManagementSection() {
  const [row, setRow] = useState<PlatformContentRow | null>(null);
  const [content, setContent] = useState<PlatformContent | null>(null);
  const [section, setSection] = useState<PlatformSection>("complete");
  const sectionRef = useRef<PlatformSection>("complete");
  const [json, setJson] = useState("{}");
  const [status, setStatus] = useState("Loading platform content…");
  const [saving, setSaving] = useState(false);
  const [revisions, setRevisions] = useState<PlatformRevision[]>([]);
  const [uploadedObjectPath, setUploadedObjectPath] = useState("");
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [structuredEditorValid, setStructuredEditorValid] = useState(true);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const jsonEditorRef = useRef<HTMLTextAreaElement>(null);

  const sectionValue = (document: PlatformContent, selected: PlatformSection): unknown => {
    if (selected === "complete") return document;
    if (selected === "catalogue") return {
      products: document.products,
      collections: document.collections,
      sizeGuide: document.sizeGuide,
      productCopy: document.productCopy,
      supportCopy: document.supportCopy,
      interfaceCopy: document.interfaceCopy,
    };
    if (selected === "pages") return document.pages;
    return document[selected];
  };
  const load = useCallback(async () => {
    try {
      const next = await customFetch<PlatformContentRow>("/api/staff/content/platform", { responseType: "json" });
      const document = next.draft ?? next.published;
      setRow(next);
      setContent(document);
      setJson(JSON.stringify(document ? sectionValue(document, sectionRef.current) : {}, null, 2));
      setStatus(document ? "Draft and published content are versioned separately." : "No platform document exists yet. Paste a complete document in the editor.");
      const history = await customFetch<PlatformRevision[]>("/api/staff/content/platform/revisions", { responseType: "json" });
      setRevisions(history);
    } catch (error) {
      setStatus(errorMessage(error, "Unable to load platform content."));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const selectSection = (next: PlatformSection) => {
    setStructuredEditorValid(true);
    if (!content) {
      if (section !== "complete") { setStatus("Create the complete document before editing individual sections."); return; }
      try {
        const document = applyPlatformSection(null, "complete", JSON.parse(json) as unknown);
        setContent(document); setSection(next); sectionRef.current = next; setJson(JSON.stringify(sectionValue(document, next), null, 2)); setStatus("");
      } catch (error) { setStatus(errorMessage(error, "Enter a valid complete platform document first.")); }
      return;
    }
    try {
      const parsed = JSON.parse(json) as unknown;
      const updated = applyPlatformSection(content, section, parsed);
      setContent(updated);
      setSection(next);
      sectionRef.current = next;
      setJson(JSON.stringify(sectionValue(updated, next), null, 2));
      setStatus("");
    } catch {
      setStatus("Fix the JSON in this section before changing sections.");
    }
  };
  const parsedDocument = () => {
    return applyPlatformSection(content, section, JSON.parse(json) as unknown);
  };
  const save = async () => {
    if (!structuredEditorValid) {
      setStatus("Fix the highlighted fields before saving this draft.");
      return;
    }
    setSaving(true);
    try {
      const document = parsedDocument();
      const next = await customFetch<PlatformContentRow>("/api/staff/content/platform", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: document, expectedDraftUpdatedAt: row?.draftUpdatedAt ?? null }),
        responseType: "json",
      });
      setContent(document); setRow(next); setStatus("Draft saved. It is not public until published."); void load();
    } catch (error) {
      setStatus(error instanceof SyntaxError ? `Invalid JSON: ${error.message}` : errorMessage(error, "Draft could not be saved."));
    } finally { setSaving(false); }
  };
  const action = async (kind: "publish" | "unpublish") => {
    setSaving(true);
    try {
      if (kind === "publish") {
        await customFetch("/api/staff/content/platform/publish", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ expectedDraftUpdatedAt: row?.draftUpdatedAt ?? null }), responseType: "json",
        });
      } else {
        await customFetch("/api/staff/content/platform/unpublish", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ expectedDraftUpdatedAt: row?.draftUpdatedAt ?? null }), responseType: "json",
        });
      }
      setStatus(kind === "publish" ? "Draft published to the storefront." : "Platform content unpublished. The storefront now shows its safe unavailable state.");
      await load();
    } catch (error) { setStatus(errorMessage(error, `Content could not be ${kind}ed.`)); }
    finally { setSaving(false); }
  };
  const uploadMedia = async (file: File) => {
    setUploadingMedia(true);
    setUploadedObjectPath("");
    try {
      setUploadedObjectPath(await uploadStaffMedia(file));
      setStatus("Media uploaded to Cloudinary. Copy or insert its durable path, then save the document.");
    } catch (error) {
      setStatus(errorMessage(error, "Media could not be uploaded."));
    } finally {
      setUploadingMedia(false);
      if (mediaInputRef.current) mediaInputRef.current.value = "";
    }
  };
  const insertUploadedPath = () => {
    if (!uploadedObjectPath) return;
    const editor = jsonEditorRef.current;
    const start = editor?.selectionStart ?? json.length;
    const end = editor?.selectionEnd ?? start;
    const escapedPath = JSON.stringify(uploadedObjectPath).slice(1, -1);
    setJson(`${json.slice(0, start)}${escapedPath}${json.slice(end)}`);
    requestAnimationFrame(() => {
      editor?.focus();
      editor?.setSelectionRange(start + escapedPath.length, start + escapedPath.length);
    });
  };

  let structuredEditor: React.ReactNode = null;
  if (json) {
    try {
      const parsed = JSON.parse(json) as unknown;
      if (section === "site") {
        const allowedTargets = [
          "/shop",
          ...(content?.products.map((product) => `/product/${product.slug}`) ?? []),
          ...(content?.collections.map((collection) => `/collections/${collection.slug}`) ?? []),
        ];
        structuredEditor = <PlatformEditorSite
          data={parsed as PlatformContent["site"]}
          products={content?.products ?? []}
          allowedTargets={allowedTargets}
          onChange={(updated) => setJson(JSON.stringify(updated, null, 2))}
          onValidityChange={setStructuredEditorValid}
        />;
      } else if (section === "homepage") {
        const allowedTargets = [
          "/shop", "/journal", "/faq", "/about", "/#whatsapp",
          ...(content?.products.map((product) => `/product/${product.slug}`) ?? []),
          ...(content?.collections.map((collection) => `/collections/${collection.slug}`) ?? []),
        ];
        structuredEditor = <PlatformEditorHomepage
          data={parsed as PlatformContent["homepage"]}
          products={content?.products ?? []}
          allowedTargets={allowedTargets}
          onChange={(updated) => setJson(JSON.stringify(updated, null, 2))}
          onUploadMedia={async (file) => {
            const path = await uploadStaffMedia(file);
            setStatus("Category photo uploaded and added to the draft. Save the draft, review it, then publish.");
            return path;
          }}
        />;
      } else if (section === "catalogue") {
        structuredEditor = <PlatformEditorCatalogue
          data={parsed as Pick<PlatformContent, "products" | "collections" | "sizeGuide" | "productCopy" | "supportCopy" | "interfaceCopy">}
          onChange={(updated) => setJson(JSON.stringify(updated, null, 2))}
          onUploadMedia={async (file) => {
            const path = await uploadStaffMedia(file);
            setStatus("Catalogue asset uploaded and added to the draft. Save the draft to keep it.");
            return path;
          }}
        />;
      } else if (section === "pages") {
        structuredEditor = <PlatformEditorPages data={parsed as PlatformContent["pages"]} onChange={(updated) => setJson(JSON.stringify(updated, null, 2))} />;
      }
    } catch {
      // JSON is invalid, don't render structured editor
    }
  }

  return <section className="mt-12 border-t border-border pt-10">
    <SectionHeading icon={Globe} title="Platform content" description="Use structured controls for day-to-day navigation, homepage, and catalogue merchandising. Advanced JSON remains available as an escape hatch for compatible storefront content." />
    <div className="mb-4 grid gap-3 border border-border bg-card p-4 text-xs sm:grid-cols-3">
      <div><span className="text-muted-foreground">Draft updated</span><p className="mt-1">{row?.draftUpdatedAt ? format(new Date(row.draftUpdatedAt), "d MMM yyyy, HH:mm") : "No draft"}</p></div>
      <div><span className="text-muted-foreground">Published</span><p className="mt-1">{row?.publishedAt ? format(new Date(row.publishedAt), "d MMM yyyy, HH:mm") : "Not published"}</p></div>
      <div><a href="/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-primary underline underline-offset-4"><Eye size={14} /> Open storefront preview</a></div>
    </div>
    <div className="border border-border bg-card p-5">
      <div className="flex flex-wrap gap-2">{platformSections.map((item) => <button key={item.id} data-testid={`platform-section-${item.id}`} type="button" onClick={() => selectSection(item.id)} className={`min-h-10 border px-4 text-xs font-semibold uppercase tracking-wider ${section === item.id ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>{item.label}</button>)}</div>
      {section === "site" && <div className="mt-5 border border-primary/25 bg-primary/5 p-4 text-sm">
        <p className="font-semibold text-primary">Site navigation and search checks</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Keep Men first. Publish Women or Accessories only after that department has at least one available product and one or two approved featured product images.</li>
          <li>Use department-matched catalogue products for menu imagery; Women and Accessories must never reuse Men products as featured cards.</li>
          <li>Curate header searchSuggestions with unique, safe links to the shop or a published product or collection.</li>
          <li>Keep the search label, placeholder, close label, and suggestions heading clear for keyboard and screen-reader shoppers.</li>
        </ul>
      </div>}
      {section === "catalogue" && <div className="mt-5 border border-primary/25 bg-primary/5 p-4 text-sm">
        <p className="font-semibold text-primary">Hybrid catalogue publishing checks</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Assign every piece and collection to Men, Women, or Accessories. Women and Accessories are ready-to-wear only and cannot include Custom sizing.</li>
          <li>Set colour, fabric, fit, searchableTerms, merchandising priority, and Standard/Custom eligibility for every piece.</li>
          <li>Add product-specific composition, care, delivery, and returns copy when the piece needs guidance beyond the shared defaults.</li>
          <li>Use readyNowSizes only for Standard sizes physically ready now. An empty list stays purchasable when fulfilmentState is made_immediately.</li>
          <li>Use unavailable only when SOSO genuinely cannot fulfil the piece, and keep dispatchMessage about dispatch rather than delivery.</li>
          <li>Keep image alt text and provenance with every approved primary or alternate image, include the primary img in images, and use only verified bundled or SOSO Cloudinary image paths.</li>
          <li>Configure relatedProductSlugs with unique published product slugs only; do not reference the same piece.</li>
          <li>When commerceProductId is present, map every eligible Standard size and Custom choice to its current commerce variant ID. Never map unavailable or ineligible choices.</li>
        </ul>
      </div>}
      {section === "homepage" && <div className="mt-5 border border-primary/25 bg-primary/5 p-4 text-sm">
        <p className="font-semibold text-primary">Homepage content and hero media checks</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Keep title, suffix and accent together as one short editorial headline. The first viewport shows that headline, primaryCta and the optional stylistCtaLabel.</li>
          <li>Description and assurances remain in the document for compatibility, but supporting purchase guidance belongs in trustItems below the hero.</li>
          <li>Use mediaMode image with imageUrl, mobileImageUrl and imageAlt for a still hero. Do not include video fields.</li>
          <li>Use mediaMode video only with local MP4 or WebM paths in both videoUrl and mobileVideoUrl.</li>
          <li>imageUrl and mobileImageUrl remain the required approved poster and fallback for motion, reduced-motion, data-saving and failed playback. Use a static JPEG, PNG or WebP—animated images are rejected.</li>
          <li>Keep poster images at or under 512 KB and each motion file at or under 8 MB. playLabel and pauseLabel must clearly describe the control.</li>
        </ul>
      </div>}
      <div className="mt-5 border border-border bg-muted/20 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 border border-border px-4 text-xs font-semibold uppercase tracking-wider hover:border-primary">
            <ImageUp size={15} /> {uploadingMedia ? "Uploading…" : "Upload media"}
            <input ref={mediaInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" disabled={uploadingMedia} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadMedia(file); }} />
          </label>
          <span className="text-xs text-muted-foreground">JPEG, PNG, WebP or GIF up to 12 MB · MP4 or WebM up to 8 MB</span>
        </div>
        {uploadedObjectPath && <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="max-w-full overflow-x-auto border border-border bg-background px-3 py-2 text-xs">{uploadedObjectPath}</code>
          <button type="button" onClick={() => void navigator.clipboard.writeText(uploadedObjectPath)} className="inline-flex min-h-9 items-center gap-2 border border-border px-3 text-[10px] font-semibold uppercase tracking-wider hover:border-primary"><Copy size={13} /> Copy</button>
          <button type="button" onClick={insertUploadedPath} className="min-h-9 border border-primary px-3 text-[10px] font-semibold uppercase tracking-wider text-primary">Insert at cursor</button>
        </div>}
      </div>

      {structuredEditor}

      {section !== "complete" ? (
        <details className="mt-5 border border-border group" data-testid="advanced-json-details">
          <summary className="cursor-pointer bg-muted/20 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-primary list-none flex items-center justify-between">
            <span>Advanced JSON Details</span>
            <span className="text-[10px] normal-case tracking-normal">Structured controls above are primary</span>
          </summary>
          <div className="p-4 bg-background border-t border-border">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Raw section JSON (synced with structured controls)
              <textarea data-testid="advanced-json-textarea" ref={jsonEditorRef} value={json} onChange={(event) => setJson(event.target.value)} rows={28} spellCheck={false} className="staff-input mt-2 resize-y font-mono text-xs normal-case tracking-normal" />
            </label>
          </div>
        </details>
      ) : (
        <label className="mt-5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Validated section JSON
          <textarea data-testid="advanced-json-textarea" ref={jsonEditorRef} value={json} onChange={(event) => setJson(event.target.value)} rows={28} spellCheck={false} className="staff-input mt-2 resize-y font-mono text-xs normal-case tracking-normal" />
        </label>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button data-testid="btn-save-draft" type="button" disabled={saving || !structuredEditorValid} onClick={() => void save()} className="flex min-h-10 items-center gap-2 bg-primary px-4 text-xs font-semibold uppercase tracking-wider text-primary-foreground disabled:opacity-50"><Save size={15} /> Save draft</button>
        <button data-testid="btn-publish" type="button" disabled={saving || !row?.draft} onClick={() => void action("publish")} className="flex min-h-10 items-center gap-2 border border-primary px-4 text-xs font-semibold uppercase tracking-wider text-primary disabled:opacity-50"><Globe size={15} /> Publish</button>
        <button data-testid="btn-unpublish" type="button" disabled={saving || !row?.published} onClick={() => void action("unpublish")} className="min-h-10 border border-border px-4 text-xs font-semibold uppercase tracking-wider disabled:opacity-50">Unpublish</button>
      </div>
      {status && <p data-testid="status-message" role="status" className="mt-4 border border-primary/25 bg-primary/5 p-3 text-sm">{status}</p>}
    </div>
    <div className="mt-5 border border-border bg-card p-5"><h3 className="text-xs font-semibold uppercase tracking-wider">Recent revisions</h3>
      {!revisions.length ? <p className="mt-3 text-sm text-muted-foreground">No revisions recorded yet.</p> : <ul className="mt-3 divide-y divide-border">{revisions.slice(0, 10).map((revision, index) => <li key={revision.id ?? index} className="py-3 text-xs"><span className="font-medium">{revision.action ?? "Revision"}</span>{revision.createdAt ? ` · ${format(new Date(revision.createdAt), "d MMM yyyy, HH:mm")}` : ""}</li>)}</ul>}
    </div>
  </section>;
}

function applyPlatformSection(document: PlatformContent | null, section: PlatformSection, value: unknown): PlatformContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Each top-level section must be a JSON object.");
  if (section === "complete") {
    const complete = value as PlatformContent;
    if (!complete.site || !complete.homepage || !complete.pages || !Array.isArray(complete.products) || !Array.isArray(complete.collections)) {
      throw new Error("A complete document requires site, homepage, pages, products, and collections.");
    }
    return complete;
  }
  if (!document) throw new Error("Create the complete document before editing individual sections.");
  if (section === "site") return { ...document, site: value as PlatformContent["site"] };
  if (section === "homepage") return { ...document, homepage: value as PlatformContent["homepage"] };
  if (section === "pages") return { ...document, pages: value as PlatformContent["pages"] };
  const catalogue = value as Pick<PlatformContent, "products" | "collections" | "sizeGuide" | "productCopy" | "supportCopy" | "interfaceCopy">;
  if (!Array.isArray(catalogue.products) || !Array.isArray(catalogue.collections)) throw new Error("Catalogue products and collections must be arrays.");
  return { ...document, ...catalogue };
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

function DateRangeControl({ range, onChange }: { range: { from: string; to: string }; onChange: (range: { from: string; to: string }) => void }) {
  const rangeDays = Math.round((new Date(`${range.to}T00:00:00`).getTime() - new Date(`${range.from}T00:00:00`).getTime()) / 86_400_000) + 1;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2" aria-label="Reporting range">
      {[7, 30, 90].map((days) => (
        <button key={days} type="button" onClick={() => onChange(dateRangeFor(days))} className={`min-h-11 border px-3 text-[10px] font-semibold uppercase tracking-[0.14em] ${rangeDays === days ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:border-primary"}`}>
          {days === 7 ? "7 days" : `${days} days`}
        </button>
      ))}
      <label className="sr-only" htmlFor="staff-range-from">From date</label>
      <input id="staff-range-from" type="date" value={range.from} max={range.to} onChange={(event) => onChange({ ...range, from: event.target.value || range.from })} className="min-h-11 border border-border bg-background px-2 text-xs text-foreground" />
      <span className="text-xs text-muted-foreground">to</span>
      <label className="sr-only" htmlFor="staff-range-to">To date</label>
      <input id="staff-range-to" type="date" value={range.to} min={range.from} max={format(new Date(), "yyyy-MM-dd")} onChange={(event) => onChange({ ...range, to: event.target.value || range.to })} className="min-h-11 border border-border bg-background px-2 text-xs text-foreground" />
    </div>
  );
}

function Pulse({ overview, loading }: { overview: StaffOverview | undefined; loading: boolean }) {
  if (loading || !overview) return <div className="mt-8 h-44 animate-pulse border border-border bg-muted/20" />;
  return (
    <section className="mt-8">
      <div className="mb-4 flex flex-wrap items-center gap-2"><Activity size={18} className="text-primary" /><h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-foreground">Daily pulse</h2><span className="text-xs text-muted-foreground">For the selected reporting range.</span></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {overview.metrics.map((metric) => (
          <article key={metric.key} className="border border-border bg-card p-5">
            <div className="flex items-center gap-1.5"><p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{metric.label}</p><Tooltip><TooltipTrigger asChild><button type="button" aria-label={`Definition for ${metric.label}`} className="text-muted-foreground hover:text-primary"><Info size={13} /></button></TooltipTrigger><TooltipContent className="max-w-xs leading-relaxed">{metric.definition}</TooltipContent></Tooltip></div>
            <p className="mt-4 text-4xl soso-display text-foreground">{metric.value.toLocaleString()}</p>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Select the info icon for the metric definition.</p>
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

function OrdersSection({ orders, loading, canRefund, onChanged, readOnly, canManageMeasurements }: { orders: StaffOrder[] | undefined; loading: boolean; canRefund: boolean; onChanged: () => void; readOnly?: boolean; canManageMeasurements: boolean; }) {
  return (
    <section>
      <SectionHeading
        icon={Package}
        title={readOnly ? "Order lookup" : "Order & production queue"}
        description={
          readOnly
            ? "Active orders — for answering customer delivery and status queries. You can review and action Custom measurements. Contact operations to update workflow statuses."
            : "Every currently active paid, atelier, production, and ready-to-deliver order stays here until it reaches a terminal state."
        }
      />
      <div className="border border-border bg-card">
        {loading ? (
          <LoadingRows />
        ) : !orders?.length ? (
          <Empty label="There are no active orders in the atelier queue." />
        ) : (
          <div className="divide-y divide-border">
            {orders.map((order) => (
              <OrderRow key={order.id} order={order} canRefund={canRefund} onChanged={onChanged} readOnly={readOnly} canManageMeasurements={canManageMeasurements} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function OrderRow({ order, canRefund, onChanged, readOnly, canManageMeasurements }: { order: StaffOrder; canRefund: boolean; onChanged: () => void; readOnly?: boolean; canManageMeasurements: boolean; }) {
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

  const hasCustomItems = order.items.some(i => i.selectionType === 'custom');

  return (
    <article className="p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-primary">#{order.orderNumber}</span>
            <StatusBadge status={order.status} />
            {hasCustomItems && <span className="ml-2 px-2 py-0.5 bg-primary/20 text-[10px] font-bold text-primary uppercase tracking-widest">Custom Pieces</span>}
          </div>
          <p className="mt-2 text-sm font-medium">{order.customerName}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Mail size={12} /> {order.customerEmail}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="text-xl soso-display">{order.currency} {Number(order.total).toLocaleString()}</p>
          <p className="mt-1 text-xs text-muted-foreground">{format(new Date(order.createdAt), "d MMM yyyy")}</p>
        </div>
      </div>

      <div className="mt-6 border border-border bg-card">
        <div className="bg-muted/30 px-4 py-2 border-b border-border">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Order Items</p>
        </div>
        <div className="divide-y divide-border/50">
          {order.items.map(item => (
            <div key={item.id} className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium flex items-center gap-2">
                    {item.quantity}x {item.productName}
                    <span className="bg-muted text-[10px] px-1.5 py-0.5 border border-border uppercase tracking-widest text-muted-foreground">
                      {item.selectionType}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Line {item.lineNumber} {item.selectedSize ? `— Size: ${item.selectedSize}` : ""}{item.customColour ? ` · Colour: ${item.customColour}` : item.selectedColourLabel ? ` · Colour: ${item.selectedColourLabel}${item.selectedColourHex ? ` (${item.selectedColourHex})` : ""}` : ""}</p>
                </div>
              </div>

              {item.selectionType === 'custom' && item.measurement && (
                <StaffMeasurementView measurement={item.measurement} canManageMeasurements={canManageMeasurements} onChanged={onChanged} />
              )}
            </div>
          ))}
        </div>
      </div>

      {hasCustomItems && order.dispatchGuidance && (
        <div className="mt-4 flex items-start gap-2 bg-primary/10 border border-primary/20 p-3 text-xs text-primary" data-testid={`status-dispatch-guidance-${order.id}`}>
          <Info size={16} className="shrink-0 mt-0.5" />
          <p>{order.dispatchGuidance}</p>
        </div>
      )}

      {readOnly ? (
        order.atelierNotes && (
          <p className="mt-3 border-l-2 border-primary/30 pl-3 text-xs italic text-muted-foreground">Atelier: {order.atelierNotes}</p>
        )
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Workflow
              <select value={status} disabled={availableStatuses.length === 1} onChange={(event) => setStatus(event.target.value as StaffWorkflowDisplayStatus)} className="staff-input mt-1" data-testid={`select-workflow-${order.id}`}>
                <>{availableStatuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</>
              </select>
            </label>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Delivery note
              <input value={deliveryNotes} onChange={(event) => setDeliveryNotes(event.target.value)} placeholder="Dispatch, courier, or delivery note" className="staff-input mt-1" data-testid={`input-delivery-note-${order.id}`} />
            </label>
          </div>
          <label className="mt-3 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Atelier note
            <textarea value={atelierNotes} onChange={(event) => setAtelierNotes(event.target.value)} rows={2} placeholder="Production instruction or progress note" className="staff-input mt-1 resize-y" data-testid={`input-atelier-note-${order.id}`} />
          </label>

          <div className="mt-4 border border-border bg-muted/20 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Internal refund review</p>
            {order.refundRequestStatus ? (
              <div className="mt-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={`refund ${order.refundRequestStatus}`} />
                  <p className="text-xs text-muted-foreground">No payment refund is issued or confirmed from this workspace.</p>
                </div>
                <p className="mt-2 text-sm text-foreground/80">{order.refundRequestReason}</p>
                {order.refundDecisionNote && <p className="mt-1 text-xs text-muted-foreground">Decision note: {order.refundDecisionNote}</p>}
                {canRefund && order.refundRequestStatus === "requested" && (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input value={refundDecisionNote} onChange={(event) => setRefundDecisionNote(event.target.value)} minLength={8} placeholder="Owner decision note" className="staff-input flex-1" data-testid={`input-refund-decision-${order.id}`} />
                    <button type="button" disabled={update.isPending || refundDecisionNote.trim().length < 8} onClick={() => void reviewRefundRequest("approved")} className="min-h-10 border border-primary px-3 text-xs font-semibold uppercase tracking-wider text-primary disabled:opacity-50" data-testid={`btn-approve-refund-${order.id}`}>Approve internally</button>
                    <button type="button" disabled={update.isPending || refundDecisionNote.trim().length < 8} onClick={() => void reviewRefundRequest("declined")} className="min-h-10 border border-border px-3 text-xs font-semibold uppercase tracking-wider disabled:opacity-50" data-testid={`btn-decline-refund-${order.id}`}>Decline</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input value={refundRequestReason} onChange={(event) => setRefundRequestReason(event.target.value)} minLength={8} placeholder="Reason to request a payment refund review" className="staff-input flex-1" data-testid={`input-refund-reason-${order.id}`} />
                <button type="button" disabled={update.isPending || refundRequestReason.trim().length < 8} onClick={() => void requestRefundReview()} className="min-h-10 border border-border px-3 text-xs font-semibold uppercase tracking-wider hover:border-primary disabled:opacity-50" data-testid={`btn-request-refund-${order.id}`}>Request review</button>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <p role="status" className="text-xs text-muted-foreground">{notice}</p>
            <button type="button" disabled={update.isPending} onClick={() => void save()} className="inline-flex min-h-10 items-center gap-2 bg-primary px-3 text-xs font-semibold uppercase tracking-wider text-primary-foreground disabled:opacity-50" data-testid={`btn-save-order-${order.id}`}>
              {update.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
            </button>
          </div>
        </>
      )}
    </article>
  );
}

function StaffMeasurementView({ measurement, canManageMeasurements, onChanged }: { measurement: StaffMeasurement; canManageMeasurements: boolean; onChanged: () => void; }) {
  const updateMutation = useUpdateStaffMeasurement();
  const [clarificationNote, setClarificationNote] = useState("");
  const [productionException, setProductionException] = useState("");
  const [notice, setNotice] = useState("");

  const handleAction = async (action: StaffMeasurementUpdateAction, note?: string) => {
    setNotice("");
    try {
      await updateMutation.mutateAsync({
        id: measurement.id,
        data: {
          action,
          note,
          version: measurement.version
        }
      });
      if (action === "request_clarification") setClarificationNote("");
      if (action === "set_production_exception") setProductionException("");
      if (action === "clear_production_exception") setProductionException("");
      onChanged();
    } catch (err: any) {
      if (err?.response?.status === 409 || err?.status === 409) {
        setNotice("This measurement was updated elsewhere. Please refresh the page to see the latest version.");
      } else {
        setNotice(errorMessage(err, "Measurement action failed. Please refresh and try again."));
      }
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "needed": return "Customer Input Needed";
      case "submitted": return "Submitted - Needs Review";
      case "clarification_requested": return "Clarification Requested";
      case "confirmed": return "Measurements Confirmed";
      case "cancelled": return "Cancelled";
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "needed": return "text-primary border-primary";
      case "submitted": return "text-blue-400 border-blue-400";
      case "clarification_requested": return "text-amber-500 border-amber-500";
      case "confirmed": return "text-green-500 border-green-500";
      case "cancelled": return "text-red-500 border-red-500";
      default: return "text-muted-foreground border-border";
    }
  };

  return (
    <div className="mt-4 bg-card border border-border p-4">
      <div className="flex justify-between items-center mb-4 pb-3 border-b border-border/50">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Measurement Details</h4>
        <span role="status" data-testid={`status-staff-measurement-${measurement.id}`} className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${getStatusColor(measurement.status)}`}>
          {getStatusText(measurement.status)}
        </span>
      </div>

      {measurement.values ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          {Object.entries(measurement.values).map(([key, val]) => (
            <div key={key}>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
              <p className="text-sm font-medium">{val} {measurement.unit}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground mb-4">No measurements submitted yet.</p>
      )}

      {measurement.customerNote && (
        <div className="mb-4 bg-muted/20 p-3 text-sm italic border-l-2 border-primary/30">
          <p className="text-[10px] not-italic uppercase tracking-wider font-semibold text-muted-foreground mb-1">Customer Note</p>
          "{measurement.customerNote}"
        </div>
      )}

      {measurement.clarificationNote && (
        <div className="mb-4 bg-amber-500/10 p-3 text-sm text-amber-100 border border-amber-500/20">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-amber-500 mb-1">Clarification Requested</p>
          {measurement.clarificationNote}
        </div>
      )}

      {measurement.productionException && (
        <div className="mb-4 bg-red-500/10 p-3 text-sm text-red-100 border border-red-500/20 flex justify-between items-center gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-red-500 mb-1">Production Exception</p>
            {measurement.productionException}
          </div>
          {canManageMeasurements && (
            <button
              type="button"
              onClick={() => handleAction("clear_production_exception")}
              data-testid={`btn-clear-exception-${measurement.id}`}
              disabled={updateMutation.isPending}
              className="shrink-0 text-[10px] px-3 py-1.5 font-bold uppercase tracking-wider border border-red-500/50 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {canManageMeasurements && measurement.status === "submitted" && (
        <div className="mt-4 pt-4 border-t border-border/50 grid gap-4">
          <div className="flex gap-2">
            <input
              aria-label="Clarification request note"
              value={clarificationNote}
              onChange={e => setClarificationNote(e.target.value)}
              data-testid={`input-clarification-note-${measurement.id}`}
              placeholder="Reason for clarification..."
              className="staff-input flex-1 h-9 min-h-0 text-xs"
            />
            <button
              type="button"
              onClick={() => handleAction("request_clarification", clarificationNote)}
              data-testid={`btn-request-clarification-${measurement.id}`}
              disabled={!clarificationNote.trim() || updateMutation.isPending}
              className="h-9 px-3 text-[10px] font-bold uppercase tracking-wider border border-amber-500/50 text-amber-400 hover:bg-amber-500/10 disabled:opacity-50"
            >
              Request Clarification
            </button>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => handleAction("confirm")}
              data-testid={`btn-confirm-measurement-${measurement.id}`}
              disabled={updateMutation.isPending}
              className="h-9 px-6 bg-green-600 hover:bg-green-500 text-white text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
            >
              Confirm Measurements
            </button>
          </div>
        </div>
      )}

      {canManageMeasurements && !measurement.productionException && measurement.status !== "cancelled" && (
        <div className="mt-4 pt-4 border-t border-border/50">
          <div className="flex gap-2">
            <input
              aria-label="Production exception"
              value={productionException}
              onChange={e => setProductionException(e.target.value)}
              data-testid={`input-production-exception-${measurement.id}`}
              placeholder="Record a production exception..."
              className="staff-input flex-1 h-9 min-h-0 text-xs"
            />
            <button
              type="button"
              onClick={() => handleAction("set_production_exception", productionException)}
              data-testid={`btn-set-exception-${measurement.id}`}
              disabled={!productionException.trim() || updateMutation.isPending}
              className="h-9 px-3 text-[10px] font-bold uppercase tracking-wider border border-red-500/50 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
            >
              Set Exception
            </button>
          </div>
        </div>
      )}

      {notice && <p role="alert" className="mt-3 text-xs text-red-400">{notice}</p>}
    </div>
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
  const [packaging, setPackaging] = useState(false);
  const owner = role === "owner";
  const locked = request.status === "completed" || request.status === "rejected";
  useEffect(() => {
    setStatus(request.status);
    setVerificationNote(request.verificationNote ?? "");
    setResolutionNote(request.resolutionNote ?? "");
  }, [request.id, request.updatedAt, request.status, request.verificationNote, request.resolutionNote]);
  const canCreatePackage = owner && request.requestType === "access" && (request.status === "identity_verified" || request.status === "in_progress" || request.status === "completed");
  const generatePackage = async () => {
    setPackaging(true);
    setNotice("");
    try {
      const result = await customFetch<{ expiresAt: string; downloadPath: string }>(`/api/staff/privacy-requests/${request.id}/access-package`, { method: "POST" });
      setNotice(`Access package is ready until ${format(new Date(result.expiresAt), "d MMM, HH:mm")}. It can be downloaded once.`);
      window.location.assign(result.downloadPath);
      onChanged();
    } catch (error) {
      setNotice(errorMessage(error, "The controlled access package could not be generated."));
    } finally {
      setPackaging(false);
    }
  };
  return (
    <article className="p-5">
      <div className="flex flex-col justify-between gap-2 sm:flex-row"><div><p className="text-sm font-medium capitalize">{request.requestType} request</p><p className="mt-1 text-xs text-muted-foreground">{request.requesterName || "Requester"} · {request.requesterEmail}</p><p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">Policy version: {request.policyVersion}</p></div><StatusBadge status={request.status} /></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Procedure status<select value={status} disabled={locked} onChange={(event) => setStatus(event.target.value as typeof status)} className="staff-input mt-1"><option value="received">Received</option>{owner && <option value="identity_verified">Identity verified</option>}<option value="in_progress">In progress</option>{owner && request.requestType !== "deletion" && <option value="completed">Completed</option>}{owner && <option value="rejected">Rejected</option>}</select></label><label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Verification note<textarea disabled={locked || !owner} value={verificationNote} onChange={(event) => setVerificationNote(event.target.value)} rows={2} className="staff-input mt-1 resize-y" /></label></div>
      {request.requestType === "deletion" && <p className="mt-3 border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-relaxed text-muted-foreground">Deletion remains blocked: an approved retention policy and deletion procedure have not been supplied. Record verification and escalate; do not mark this request complete.</p>}
      {owner && <label className="mt-3 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Resolution note (required for complete/reject)<textarea disabled={locked} value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} rows={2} className="staff-input mt-1 resize-y" /></label>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-xs text-muted-foreground">{locked ? "This terminal privacy record is locked." : notice}</p><div className="flex flex-wrap gap-2">{canCreatePackage && <button type="button" disabled={packaging} onClick={() => void generatePackage()} className="inline-flex min-h-10 items-center gap-2 border border-primary px-3 text-xs font-semibold uppercase tracking-wider text-primary hover:bg-primary/5 disabled:opacity-50"><Download size={14} /> {packaging ? "Preparing…" : "Generate access package"}</button>}<button type="button" disabled={locked || update.isPending} onClick={async () => { try { await update.mutateAsync({ id: request.id, data: { status, verificationNote: verificationNote || null, ...(owner ? { resolutionNote: resolutionNote || null } : {}) } }); setNotice("Privacy request updated."); onChanged(); } catch (error) { setNotice(errorMessage(error, "This request could not be updated.")); } }} className="inline-flex min-h-10 items-center gap-2 border border-border px-3 text-xs font-semibold uppercase tracking-wider hover:border-primary disabled:opacity-50"><Save size={14} /> Save procedure step</button></div></div>
    </article>
  );
}

function JournalManagementSection() {
  const { data: posts, isLoading, refetch } = useListStaffJournalPosts();
  const create = useCreateStaffJournalPost();
  const update = useUpdateStaffJournalPost();
  const [article, setArticle] = useState<StaffJournalPostInput>(emptyArticle);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expectedRevision, setExpectedRevision] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [uploadingCover, setUploadingCover] = useState(false);
  const { data: revisions, isLoading: revisionsLoading, isError: revisionsError } = useListStaffJournalPostRevisions(editingId ?? "", {
    query: { queryKey: ["staff-journal-revisions", editingId], enabled: Boolean(editingId) },
  });
  const save = async (event: FormEvent) => { event.preventDefault(); try { if (editingId) { const saved = await customFetch<StaffJournalPost>(`/api/staff/journal/${editingId}`, { method: "PATCH", body: JSON.stringify(article), headers: { "content-type": "application/json", ...(expectedRevision ? { "x-soso-expected-revision": expectedRevision } : {}) } }); setExpectedRevision(saved.updatedAt); } else { const result = await create.mutateAsync({ data: article }); setEditingId(result.id); setExpectedRevision(result.updatedAt); } setNotice("Article saved."); void refetch(); } catch (error) { setNotice(errorMessage(error, "Article could not be saved. If another editor made a change, reopen the article before trying again.")); } };
  const edit = (post: StaffJournalPost) => {
    setEditingId(post.id);
    setExpectedRevision(post.updatedAt);
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
      relatedArticleSlugs: post.relatedArticleSlugs ?? null,
      status: post.status,
    });
    setNotice("");
  };

  const uploadCover = async (file: File) => {
    setUploadingCover(true);
    try {
      const objectPath = await uploadStaffMedia(file);
      setArticle((current) => ({ ...current, coverImageUrl: objectPath }));
      setNotice("Cover image uploaded to Cloudinary.");
    } catch (error) {
      setNotice(errorMessage(error, "Cover image could not be uploaded."));
    } finally {
      setUploadingCover(false);
    }
  };

  return (
    <section className="mt-12 border-t border-border pt-10">
      <SectionHeading icon={PenLine} title="Journal management" description="Draft, publish, archive, and revise approved editorial. Cover images are stored durably in SOSO Cloudinary." />
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
            <button type="button" onClick={() => { setEditingId(null); setExpectedRevision(null); setArticle(emptyArticle); }} className="text-xs uppercase tracking-wider text-primary">
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
              <input value={article.coverImageUrl ?? ""} onChange={(e) => setArticle({ ...article, coverImageUrl: e.target.value || null })} placeholder="/api/storage/objects/uploads/…" className="staff-input flex-1" />
              <label className="inline-flex shrink-0 cursor-pointer items-center border border-border px-3 text-[10px] uppercase tracking-wider hover:border-primary">
                {uploadingCover ? "Uploading…" : "Upload"}
                <input
                  className="sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  disabled={uploadingCover}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadCover(file);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
          </InputLabel>
          <InputLabel label="Image alt text"><input value={article.coverImageAlt ?? ""} onChange={(e) => setArticle({ ...article, coverImageAlt: e.target.value || null })} placeholder="Descriptive alt text for the cover image" className="staff-input mt-1" /></InputLabel>

          {/* SEO overrides */}
          <p className="mt-5 mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-t border-border pt-4">SEO overrides (optional)</p>
          <InputLabel label="SEO title (override)"><input value={article.seoTitle ?? ""} onChange={(e) => setArticle({ ...article, seoTitle: e.target.value || null })} placeholder="Defaults to article title" maxLength={120} className="staff-input mt-1" /></InputLabel>
          <InputLabel label="SEO description (override)"><textarea rows={2} value={article.seoDescription ?? ""} onChange={(e) => setArticle({ ...article, seoDescription: e.target.value || null })} placeholder="Defaults to excerpt" maxLength={320} className="staff-input mt-1 resize-y" /></InputLabel>
          <InputLabel label="Related product slugs (comma-separated)"><input value={(article.relatedProductSlugs ?? []).join(", ")} onChange={(e) => setArticle({ ...article, relatedProductSlugs: e.target.value ? e.target.value.split(",").map((s) => s.trim()).filter(Boolean) : null })} placeholder="e.g. vault, ivory-kaftan" className="staff-input mt-1" /></InputLabel>
          <InputLabel label="Related article slugs (comma-separated)"><input value={(article.relatedArticleSlugs ?? []).join(", ")} onChange={(e) => setArticle({ ...article, relatedArticleSlugs: e.target.value ? e.target.value.split(",").map((s) => s.trim()).filter(Boolean) : null })} placeholder="e.g. how-to-wear-a-kaftan, abuja-wedding-guide" className="staff-input mt-1" /></InputLabel>

          {/* Article body */}
          <InputLabel label="Article body"><textarea required minLength={100} rows={10} value={article.body} onChange={(e) => setArticle({ ...article, body: e.target.value })} className="staff-input mt-1 resize-y" /></InputLabel>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <p role="status" className="text-xs text-muted-foreground">{notice}</p>
              {article.slug && (
                <a href={`/journal/preview/${article.slug}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 border border-border px-4 text-xs font-semibold uppercase tracking-wider hover:border-primary transition-colors">
                  <Eye size={14} /> Preview
                </a>
              )}
            </div>
            <button disabled={create.isPending || update.isPending} className="inline-flex min-h-11 items-center gap-2 bg-primary px-4 text-xs font-semibold uppercase tracking-wider text-primary-foreground disabled:opacity-50">
              <Save size={14} /> Save article
            </button>
          </div>
          {editingId && (
            <section className="mt-6 border-t border-border pt-5" aria-labelledby="journal-revision-history">
              <div className="flex items-center gap-2">
                <History size={15} className="text-primary" />
                <h3 id="journal-revision-history" className="text-xs font-semibold uppercase tracking-wider">Revision history</h3>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Immutable snapshots, newest first. Restoring a previous version remains a deliberate manual edit.</p>
              {revisionsLoading && <p className="mt-3 text-xs text-muted-foreground">Loading revision history…</p>}
              {revisionsError && <p className="mt-3 text-xs text-destructive">Revision history could not be loaded.</p>}
              {!revisionsLoading && !revisionsError && !revisions?.length && <p className="mt-3 text-xs text-muted-foreground">No revision snapshots are available for this article.</p>}
              <div className="mt-3 space-y-2">
                {revisions?.map((revision, index) => (
                  <details key={revision.id} className="border border-border/70 p-3">
                    <summary className="cursor-pointer list-none">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-medium">{index === 0 ? "Current saved revision" : `Revision ${revisions.length - index}`}</span>
                        <time className="text-[10px] uppercase tracking-wider text-muted-foreground">{format(new Date(revision.createdAt), "d MMM yyyy, HH:mm")}</time>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{revision.snapshot.status} · {revision.snapshot.title}</p>
                    </summary>
                    <div className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                      <p><span className="font-medium text-foreground">Slug:</span> {revision.snapshot.slug}</p>
                      <p className="mt-1"><span className="font-medium text-foreground">Excerpt:</span> {revision.snapshot.excerpt}</p>
                      <p className="mt-1"><span className="font-medium text-foreground">Body:</span> {revision.snapshot.body.length.toLocaleString()} characters</p>
                      <p className="mt-2 font-mono text-[10px] break-all text-muted-foreground">Fingerprint: {revision.contentHash}</p>
                    </div>
                  </details>
                ))}
              </div>
            </section>
          )}
        </form>
      </div>
    </section>
  );
}

type FaqRow = { id: string; question: string; answer: string; category: string | null; sortOrder: number; isPublished: boolean; createdAt: string; updatedAt: string };
type RedirectRow = { id: string; fromPath: string; toPath: string; statusCode: number; isPublished: boolean; createdAt: string; updatedAt: string };

const FAQ_HISTORY_PAGE_SIZE = 20;

function changedFaqFields(event: FaqHistoryEvent): string[] {
  const previous = event.metadata.previousSnapshot;
  const current = event.metadata.snapshot;
  if (!previous || !current) return [];
  const fields: Array<[keyof FaqHistorySnapshot, string]> = [
    ["question", "question"],
    ["answer", "answer"],
    ["category", "category"],
    ["sortOrder", "sort order"],
    ["isPublished", "status"],
  ];
  return fields.filter(([key]) => previous[key] !== current[key]).map(([, label]) => label);
}

function FaqHistorySnapshotView({ title, snapshot }: { title: string; snapshot: FaqHistorySnapshot }) {
  return <div className="border border-border bg-card p-3 text-muted-foreground">
    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-foreground">{title}</p>
    <p><span className="font-medium text-foreground">Question:</span> {snapshot.question}</p>
    <p className="mt-1 whitespace-pre-wrap"><span className="font-medium text-foreground">Answer:</span> {snapshot.answer}</p>
    <p className="mt-1"><span className="font-medium text-foreground">Category:</span> {snapshot.category || "Uncategorised"}</p>
    <p className="mt-1"><span className="font-medium text-foreground">Order:</span> {snapshot.sortOrder} · {snapshot.isPublished ? "Published" : "Draft"}</p>
  </div>;
}

function useCrudFetch<T>(path: string, enabled: boolean) {
  const [data, setData] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    if (!enabled) return;
    setLoading(true);
    void customFetch<T[]>(`/api${path}`)
      .then((d: T[]) => setData(d))
      .catch((e: unknown) => setError(errorMessage(e, "Failed to load.")))
      .finally(() => setLoading(false));
  }, [path, enabled]);
  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}

function FaqManagementSection() {
  const { data: items, loading, reload } = useCrudFetch<FaqRow>("/staff/faq", true);
  const [editing, setEditing] = useState<Partial<FaqRow> | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [history, setHistory] = useState<FaqHistoryEvent[] | null>(null);
  const [historyNextCursor, setHistoryNextCursor] = useState<string | null>(null);
  const [historyCursor, setHistoryCursor] = useState<string | undefined>();
  const [historyBackStack, setHistoryBackStack] = useState<Array<string | undefined>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const historyRequestRef = useRef(0);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setNotice("");
    try {
      if (editing.id) {
        await customFetch(`/api/staff/faq/${editing.id}`, { method: "PATCH", body: JSON.stringify(editing) });
      } else {
        await customFetch("/api/staff/faq", { method: "POST", body: JSON.stringify(editing) });
      }
      setNotice("Saved.");
      setEditing(null);
      reload();
    } catch (err) {
      setNotice(errorMessage(err, "Save failed."));
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: string) => {
    setDeletingId(id);
    try {
      await customFetch(`/api/staff/faq/${id}`, { method: "DELETE" });
      reload();
    } catch (err) {
      setNotice(errorMessage(err, "Delete failed."));
    } finally {
      setDeletingId(null);
    }
  };

  const loadHistoryPage = async (
    id: string,
    cursor: string | undefined,
    backStack: Array<string | undefined>,
  ) => {
    const requestId = ++historyRequestRef.current;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const page = await listStaffFaqHistory({ id, limit: FAQ_HISTORY_PAGE_SIZE, cursor });
      if (historyRequestRef.current !== requestId) return;
      setHistory(page.items);
      setHistoryNextCursor(page.nextCursor);
      setHistoryCursor(cursor);
      setHistoryBackStack(backStack);
    } catch (err) {
      if (historyRequestRef.current !== requestId) return;
      setHistoryError(errorMessage(err, "History could not be loaded."));
    } finally {
      if (historyRequestRef.current === requestId) setHistoryLoading(false);
    }
  };

  const showHistory = async (id: string) => {
    if (historyId === id) {
      historyRequestRef.current += 1;
      setHistoryId(null);
      setHistory(null);
      setHistoryNextCursor(null);
      setHistoryCursor(undefined);
      setHistoryBackStack([]);
      setHistoryLoading(false);
      setHistoryError("");
      return;
    }
    setHistoryId(id);
    setHistory(null);
    setHistoryNextCursor(null);
    setHistoryCursor(undefined);
    setHistoryBackStack([]);
    await loadHistoryPage(id, undefined, []);
  };

  const loadOlderHistory = async () => {
    if (!historyId || !historyNextCursor || historyLoading) return;
    await loadHistoryPage(historyId, historyNextCursor, [...historyBackStack, historyCursor]);
  };

  const loadNewerHistory = async () => {
    if (!historyId || !historyBackStack.length || historyLoading) return;
    const cursor = historyBackStack.at(-1);
    await loadHistoryPage(historyId, cursor, historyBackStack.slice(0, -1));
  };

  return (
    <section className="mt-12 border-t border-border pt-10">
      <SectionHeading icon={FileText} title="FAQ management" description="Manage the FAQ items shown on the public /faq page. Published items appear on site; draft items are hidden." />
      {notice && <p role="status" className="mb-4 border border-primary/25 bg-primary/5 p-3 text-sm">{notice}</p>}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-muted-foreground">{items?.length ?? 0} items</span>
        <button type="button" onClick={() => setEditing({ isPublished: true, sortOrder: (items?.length ?? 0) * 10 })} className="inline-flex min-h-10 items-center gap-2 bg-primary px-3 text-xs font-semibold uppercase tracking-wider text-primary-foreground hover:bg-primary/90">
          <Plus size={13} /> New FAQ item
        </button>
      </div>

      {editing && (
        <form onSubmit={(e) => void save(e)} className="mb-6 border border-primary/40 bg-primary/5 p-5 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">{editing.id ? "Edit item" : "New item"}</p>
          <InputLabel label="Question"><input required value={editing.question ?? ""} onChange={(e) => setEditing({ ...editing, question: e.target.value })} className="staff-input mt-1" /></InputLabel>
          <InputLabel label="Answer"><textarea required rows={3} value={editing.answer ?? ""} onChange={(e) => setEditing({ ...editing, answer: e.target.value })} className="staff-input mt-1 resize-y" /></InputLabel>
          <InputLabel label="Category"><input value={editing.category ?? ""} onChange={(e) => setEditing({ ...editing, category: e.target.value || null })} placeholder="e.g. Sizing, Ordering" className="staff-input mt-1" /></InputLabel>
          <div className="grid grid-cols-2 gap-3">
            <InputLabel label="Sort order (ascending)"><input type="number" value={editing.sortOrder ?? 0} onChange={(e) => setEditing({ ...editing, sortOrder: Number(e.target.value) })} className="staff-input mt-1" /></InputLabel>
            <InputLabel label="Status"><select value={editing.isPublished ? "published" : "draft"} onChange={(e) => setEditing({ ...editing, isPublished: e.target.value === "published" })} className="staff-input mt-1">
              <option value="published">Published</option><option value="draft">Draft</option>
            </select></InputLabel>
          </div>
          <div className="flex gap-2 pt-2">
            <button disabled={saving} className="inline-flex min-h-10 items-center gap-2 bg-primary px-4 text-xs font-semibold uppercase tracking-wider text-primary-foreground disabled:opacity-50"><Save size={13} /> Save</button>
            <button type="button" onClick={() => setEditing(null)} className="inline-flex min-h-10 items-center px-4 text-xs border border-border hover:border-primary">Cancel</button>
          </div>
        </form>
      )}

      <div className="border border-border bg-card">
        {loading ? <LoadingRows /> : !items?.length ? <Empty label="No FAQ items yet. Add the first one above." /> : (
          <div className="divide-y divide-border">
            {items.map((item) => (
              <React.Fragment key={item.id}>
              <div className="flex items-start gap-4 p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {item.category && <span className="text-[9px] uppercase tracking-wider border border-primary/30 px-2 py-0.5 text-primary/70">{item.category}</span>}
                    <StatusBadge status={item.isPublished ? "published" : "draft"} />
                    <span className="text-[10px] text-muted-foreground">#{item.sortOrder}</span>
                  </div>
                  <p className="mt-1 text-sm font-medium">{item.question}</p>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{item.answer}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => void showHistory(item.id)} aria-expanded={historyId === item.id} className="inline-flex min-h-9 items-center gap-1 border border-border px-2 text-xs hover:border-primary"><History size={12} /> {historyId === item.id ? "Hide history" : "History"}</button>
                  <button type="button" onClick={() => setEditing(item)} className="inline-flex min-h-9 items-center gap-1 border border-border px-2 text-xs hover:border-primary"><PenLine size={12} /> Edit</button>
                  <button type="button" disabled={deletingId === item.id} onClick={() => void del(item.id)} className="inline-flex min-h-9 items-center gap-1 border border-destructive/50 px-2 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"><Trash2 size={12} /></button>
                </div>
              </div>
              {historyId === item.id && <div className="border-t border-border bg-muted/20 px-4 py-4 sm:pl-8">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">Change history</p>
                    <p className="mt-1 text-xs text-muted-foreground">Newest changes appear first. Audit records are read-only and cannot be restored here.</p>
                  </div>
                  {history && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Page {historyBackStack.length + 1} · {history.length} records</span>}
                </div>
                {historyLoading && !history && <p className="mt-3 text-xs text-muted-foreground">Loading history…</p>}
                {historyError && <p role="alert" className="mt-3 text-xs text-destructive">{historyError}</p>}
                {!historyLoading && !historyError && !history?.length && <p className="mt-3 text-xs text-muted-foreground">No audit records are available.</p>}
                <div className="mt-3 space-y-3">
                  {history?.map((event) => {
                    const transition = event.metadata?.transition;
                    const previous = event.metadata?.previousSnapshot;
                    const current = event.metadata?.snapshot;
                    const changedFields = changedFaqFields(event);
                    return <div key={event.id} className="border-l-2 border-primary/30 pl-3 text-xs">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold">{event.action.replace("faq.", "").replace(".", " ")}</span>
                        {transition && <span className="text-muted-foreground">{transition.from ?? "new"} → {transition.to}</span>}
                        <time className="text-muted-foreground">{format(new Date(event.createdAt), "d MMM yyyy, HH:mm")}</time>
                      </div>
                      <p className="mt-1 text-muted-foreground">By {event.actorClerkUserId}</p>
                      {changedFields.length > 0 && <p className="mt-1 text-foreground">Changed: {changedFields.join(", ")}</p>}
                      {(previous || current) && <details className="mt-2">
                        <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-primary">Review snapshot</summary>
                        <div className="mt-2 grid gap-2 lg:grid-cols-2">
                          {previous && <FaqHistorySnapshotView title={current ? "Before" : "Last saved state"} snapshot={previous} />}
                          {current && <FaqHistorySnapshotView title={previous ? "After" : "Created state"} snapshot={current} />}
                        </div>
                      </details>}
                    </div>;
                  })}
                </div>
                {(historyBackStack.length > 0 || historyNextCursor) && <div className="mt-4 flex flex-wrap items-center gap-2">
                  {historyBackStack.length > 0 && <button
                    type="button"
                    disabled={historyLoading}
                    onClick={() => void loadNewerHistory()}
                    className="inline-flex min-h-9 items-center border border-border px-3 text-xs font-semibold hover:border-primary disabled:opacity-50"
                  >
                    Newer changes
                  </button>}
                  {historyNextCursor && <button
                    type="button"
                    disabled={historyLoading}
                    onClick={() => void loadOlderHistory()}
                    className="inline-flex min-h-9 items-center border border-border px-3 text-xs font-semibold hover:border-primary disabled:opacity-50"
                  >
                    Older changes
                  </button>}
                  {historyLoading && <span className="text-xs text-muted-foreground">Loading page…</span>}
                </div>}
              </div>}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function PolicyManagementSection({ role: _role }: { role: string }) {
  type PolicyRow = {
    id: string; slug: string; title: string; summary: string;
    sections: unknown[]; version: number; status: string; effectiveAt: string | null;
    reviewedAt: string | null; approvedAt: string | null;
  };
  const { data: policies, loading, reload } = useCrudFetch<PolicyRow>("/staff/policies", true);
  const [editing, setEditing] = useState<Partial<PolicyRow> | null>(null);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setSaving(true); setNotice("");
    try {
      const sections = typeof editing.sections === "string" ? JSON.parse(editing.sections) : editing.sections;
      const body = {
        slug: editing.slug,
        title: editing.title,
        summary: editing.summary,
        sections,
      };
      if (editing.id) await customFetch(`/api/staff/policies/${editing.id}`, { method: "PUT", body: JSON.stringify(body) });
      else await customFetch("/api/staff/policies", { method: "POST", body: JSON.stringify(body) });
      setEditing(null); setNotice("Policy draft saved."); reload();
    } catch (error) { setNotice(errorMessage(error, "Policy could not be saved. Check the sections JSON.")); }
    finally { setSaving(false); }
  };
  const publish = async (id: string) => {
    try {
      const effectiveAt = window.prompt("Effective date (YYYY-MM-DD)", new Date().toISOString().slice(0, 10));
      if (!effectiveAt) return;
      await customFetch(`/api/staff/policies/${id}/publish`, { method: "POST", body: JSON.stringify({ effectiveAt }) });
      setNotice("Policy published."); reload();
    } catch (error) { setNotice(errorMessage(error, "Policy could not be published.")); }
  };
  const archive = async (id: string) => {
    try {
      await customFetch(`/api/staff/policies/${id}`, { method: "DELETE" });
      if (editing?.id === id) setEditing(null);
      setNotice("Policy draft archived."); reload();
    } catch (error) { setNotice(errorMessage(error, "Policy draft could not be archived.")); }
  };
  return <section className="mt-12 border-t border-border pt-10">
    <SectionHeading icon={FileText} title="Policy governance" description="Create and edit drafts, then publish them with an effective date. Published versions are immutable." />
    {notice && <p role="status" className="mb-4 border border-primary/25 bg-primary/5 p-3 text-sm">{notice}</p>}
    <div className="flex items-center justify-between mb-4"><span className="text-xs text-muted-foreground">{policies?.length ?? 0} versions</span>
      <button type="button" onClick={() => setEditing({ slug: "privacy", title: "", summary: "", sections: [], status: "draft" })} className="inline-flex min-h-10 items-center gap-2 bg-primary px-3 text-xs font-semibold uppercase tracking-wider text-primary-foreground"><Plus size={13} /> New policy version</button>
    </div>
    {editing && <form onSubmit={(event) => void save(event)} className="mb-6 space-y-3 border border-primary/40 bg-primary/5 p-5">
      <InputLabel label="Slug"><input required value={editing.slug ?? ""} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} placeholder="privacy, terms, care" className="staff-input mt-1" /></InputLabel>
      <InputLabel label="Title"><input required value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className="staff-input mt-1" /></InputLabel>
      <InputLabel label="Summary"><input required value={editing.summary ?? ""} onChange={(e) => setEditing({ ...editing, summary: e.target.value })} className="staff-input mt-1" /></InputLabel>
      <InputLabel label="Sections (JSON array of { id, heading, paragraphs?, bullets? })"><textarea required rows={8} value={typeof editing.sections === "string" ? editing.sections : JSON.stringify(editing.sections ?? [], null, 2)} onChange={(e) => setEditing({ ...editing, sections: e.target.value as unknown as unknown[] })} className="staff-input mt-1 font-mono text-xs" /></InputLabel>
      <div className="flex gap-2"><button disabled={saving} className="inline-flex min-h-10 bg-primary px-4 text-xs font-semibold uppercase tracking-wider text-primary-foreground"><Save size={13} className="mr-2" /> Save draft</button><button type="button" onClick={() => setEditing(null)} className="border border-border px-4 text-xs">Cancel</button></div>
    </form>}
    {loading ? <LoadingRows /> : <div className="divide-y divide-border border border-border bg-card">
      {!policies?.length && <Empty label="No policy versions yet. Create the first draft above." />}
      {policies?.map((policy) => <div key={policy.id} className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1"><p className="text-sm font-medium">{policy.title} <span className="text-xs text-muted-foreground">v{policy.version} · {policy.slug}</span></p><StatusBadge status={policy.status} /></div>
        {policy.status === "draft" && <button type="button" onClick={() => setEditing(policy)} className="border border-border px-2 py-2 text-xs">Edit</button>}
        {policy.status === "draft" && <button type="button" onClick={() => void publish(policy.id)} className="bg-primary px-2 py-2 text-xs text-primary-foreground">Publish</button>}
        {policy.status === "draft" && <button type="button" onClick={() => void archive(policy.id)} className="border border-destructive/50 px-2 py-2 text-xs text-destructive">Archive draft</button>}
      </div>)}
    </div>}
  </section>;
}
function RedirectsManagementSection() {
  const { data: redirects, loading, reload } = useCrudFetch<RedirectRow>("/staff/redirects", true);
  const [form, setForm] = useState({ fromPath: "", toPath: "", statusCode: 301 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice("");
    try {
      const current = redirects?.find((redirect) => redirect.id === editingId);
      await customFetch(editingId ? `/api/staff/redirects/${editingId}` : "/api/staff/redirects", {
        method: editingId ? "PUT" : "POST",
        headers: current ? { "x-soso-expected-revision": current.updatedAt } : undefined,
        body: JSON.stringify(form),
      });
      setNotice(editingId ? "Redirect draft updated." : "Unpublished redirect created.");
      setForm({ fromPath: "", toPath: "", statusCode: 301 });
      setEditingId(null);
      reload();
    } catch (err) {
      setNotice(errorMessage(err, "Save failed."));
    } finally {
      setSaving(false);
    }
  };

  const setPublication = async (redirect: RedirectRow, published: boolean) => {
    setBusyId(redirect.id); setNotice("");
    try {
      await customFetch(`/api/staff/redirects/${redirect.id}/publish`, {
        method: "POST",
        headers: { "x-soso-expected-revision": redirect.updatedAt },
        body: JSON.stringify({ published }),
      });
      setNotice(published ? "Redirect published." : "Redirect unpublished and no longer active.");
      reload();
    } catch (err) {
      setNotice(errorMessage(err, "Publication state could not be changed. The list has been refreshed."));
      reload();
    } finally {
      setBusyId(null);
    }
  };

  const del = async (redirect: RedirectRow) => {
    if (!window.confirm(`Delete redirect ${redirect.fromPath}? Its revision history will remain in the audit record.`)) return;
    setBusyId(redirect.id); setNotice("");
    try {
      await customFetch(`/api/staff/redirects/${redirect.id}`, {
        method: "DELETE",
        headers: { "x-soso-expected-revision": redirect.updatedAt },
      });
      if (editingId === redirect.id) {
        setEditingId(null);
        setForm({ fromPath: "", toPath: "", statusCode: 301 });
      }
      setNotice("Redirect deleted.");
      reload();
    } catch (err) {
      setNotice(errorMessage(err, "Delete failed. The list has been refreshed."));
      reload();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="mt-12 border-t border-border pt-10">
      <SectionHeading icon={Globe} title="Redirect management" description="Create unpublished internal redirects, review them, and explicitly publish or retire them. Both paths must begin with /." />
      {notice && <p role="status" className="mb-4 border border-primary/25 bg-primary/5 p-3 text-sm">{notice}</p>}
      <form onSubmit={(e) => void save(e)} className="mb-6 grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] items-end border border-border p-4">
        <InputLabel label="From path"><input required value={form.fromPath} onChange={(e) => setForm({ ...form, fromPath: e.target.value })} placeholder="/old-url" className="staff-input mt-1" /></InputLabel>
        <InputLabel label="To path / URL"><input required value={form.toPath} onChange={(e) => setForm({ ...form, toPath: e.target.value })} placeholder="/new-url" className="staff-input mt-1" /></InputLabel>
        <InputLabel label="Code"><select value={form.statusCode} onChange={(e) => setForm({ ...form, statusCode: Number(e.target.value) })} className="staff-input mt-1">
          <option value={301}>301 Permanent</option><option value={302}>302 Temporary</option><option value={307}>307 Temp (POST)</option><option value={308}>308 Perm (POST)</option>
        </select></InputLabel>
        <div className="flex gap-2">
          <button disabled={saving} className="inline-flex min-h-11 items-center gap-2 bg-primary px-4 text-xs font-semibold uppercase tracking-wider text-primary-foreground disabled:opacity-50">{editingId ? <Save size={13} /> : <Plus size={13} />} {editingId ? "Save" : "Add draft"}</button>
          {editingId && <button type="button" onClick={() => { setEditingId(null); setForm({ fromPath: "", toPath: "", statusCode: 301 }); }} className="min-h-11 border border-border px-3 text-xs">Cancel</button>}
        </div>
      </form>

      <div className="border border-border bg-card">
        {loading ? <LoadingRows /> : !redirects?.length ? <Empty label="No redirects configured yet." /> : (
          <div className="divide-y divide-border">
            {redirects.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
                <div className="flex-1 min-w-0 grid sm:grid-cols-[1fr_auto_1fr_auto] gap-x-3 gap-y-0.5 items-center">
                  <span className="text-sm font-mono truncate">{r.fromPath}</span>
                  <ChevronRight size={14} className="text-muted-foreground hidden sm:block" />
                  <span className="text-sm font-mono text-primary truncate">{r.toPath}</span>
                  <div className="flex items-center gap-2"><span className="text-[10px] border border-border px-1.5 py-0.5 text-muted-foreground w-fit">{r.statusCode}</span><StatusBadge status={r.isPublished ? "published" : "draft"} /></div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busyId === r.id} onClick={() => { setEditingId(r.id); setForm({ fromPath: r.fromPath, toPath: r.toPath, statusCode: r.statusCode }); }} className="inline-flex min-h-9 items-center gap-1 border border-border px-2 text-xs hover:border-primary disabled:opacity-50"><PenLine size={12} /> Edit</button>
                  <button type="button" disabled={busyId === r.id} onClick={() => void setPublication(r, !r.isPublished)} className="inline-flex min-h-9 items-center gap-1 border border-primary px-2 text-xs text-primary disabled:opacity-50">{r.isPublished ? "Unpublish" : "Publish"}</button>
                  <button type="button" disabled={busyId === r.id} onClick={() => void del(r)} className="inline-flex min-h-9 items-center gap-1 border border-destructive/50 px-2 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"><Trash2 size={12} /> Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

const ROLE_CAPABILITIES: Record<string, { summary: string; actions: string[] }> = {
  owner: {
    summary: "You hold the sensitive-decision and escalation boundary for the atelier day.",
    actions: [
      "Oversee order workflow, operational handoffs, and internal refund decisions",
      "Approve verified privacy access-package generation and one-time downloads",
      "Review aggregate reporting and audit visibility without treating intent events as paid orders",
      "Confirm on-duty role assignments and escalate provider, payment, security, or policy incidents",
    ],
  },
  administrator: {
    summary: "You administer published editorial surfaces without access to staff accounts.",
    actions: [
      "Create, review, publish, and unpublish platform content",
      "Manage journal, FAQ, and policy content",
      "Staff access, role assignment, and password controls remain owner-only",
    ],
  },
  operations: {
    summary: "You manage the atelier's order queue, customer enquiries, and privacy requests.",
    actions: [
      "Move paid orders through the production workflow — atelier confirmation → in production → ready → fulfilled",
      "Handle customer support enquiries and log internal handling notes",
      "Log and progress privacy requests; escalate identity verification and closure to the owner",
      "Escalate refund requests to the owner for review",
    ],
  },
  stylist: {
    summary: "You handle customer enquiries and can look up active orders to answer delivery queries.",
    actions: [
      "Reply to customer styling, sizing, and fitting questions",
      "Look up active order status to answer 'where is my order?' queries",
      "To update an order status, contact operations",
    ],
  },
  analyst: {
    summary: "You review analytics, funnel data, and the operational audit trail.",
    actions: [
      "View consented event counts and conversion funnel data",
      "Browse the audit trail of operational actions",
      "Export aggregate operational reports",
    ],
  },
  editor: {
    summary: "You manage SOSO Journal content — articles, editorial metadata, and cover images.",
    actions: [
      "Create and edit journal articles, including draft and published states",
      "Upload cover images via the Cloudinary upload widget",
      "Set per-article SEO title, description, tags, category, and reading time",
    ],
  },
};

function RoleCapabilityBanner({ role }: { role: string }) {
  const cap = ROLE_CAPABILITIES[role];
  if (!cap) return null;
  return (
    <div className="mt-5 border border-border/60 bg-muted/10 p-4 sm:flex sm:gap-6">
      <div className="shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">{role}</p>
        <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">{cap.summary}</p>
      </div>
      <ul className="mt-3 space-y-1.5 sm:mt-0 sm:border-l sm:border-border/40 sm:pl-6">
        {cap.actions.map((action) => (
          <li key={action} className="flex items-baseline gap-2 text-xs text-muted-foreground">
            <span className="shrink-0 text-primary">·</span>
            {action}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SectionHeading({ icon: Icon, title, description }: { icon: typeof Package; title: string; description: string }) {
  return <div className="mb-4"><div className="flex items-center gap-2"><Icon size={18} className="text-primary" /><h2 className="text-lg soso-display">{title}</h2></div><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p></div>;
}

function MarketingPixelsSection() {
  const pixels = useGetStaffMarketingPixels({ query: { queryKey: ["staff-marketing-pixels"], refetchInterval: 60_000 } });
  const revisions = useListStaffMarketingPixelRevisions({ query: { queryKey: ["staff-marketing-pixel-revisions"], refetchInterval: 60_000 } });
  const updatePixels = useUpdateStaffMarketingPixels();

  const [settings, setSettings] = useState<MarketingPixelSettings>({
    schemaVersion: 1,
    meta: { pixelId: null, enabled: false },
    googleAds: { pixelId: null, enabled: false },
    x: { pixelId: null, enabled: false },
    tiktok: { pixelId: null, enabled: false },
  });

  const [baseRevision, setBaseRevision] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (pixels.data && (baseRevision === null || (!dirty && baseRevision !== pixels.data.revision))) {
      setSettings(pixels.data.settings);
      setBaseRevision(pixels.data.revision);
    }
  }, [baseRevision, dirty, pixels.data]);

  const [notice, setNotice] = useState<{ message: string; isError: boolean } | null>(null);

  const isValidId = (provider: keyof Omit<MarketingPixelSettings, "schemaVersion">, id: string | null) => {
    if (!id) return false;
    if (provider === "meta") return /^[0-9]{5,20}$/.test(id);
    if (provider === "googleAds") return /^AW-[0-9]{6,20}$/.test(id);
    if (provider === "x") return /^[A-Za-z0-9]{5,20}$/.test(id);
    if (provider === "tiktok") return /^[A-Za-z0-9]{10,30}$/.test(id);
    return false;
  };

  const handleChange = (provider: keyof Omit<MarketingPixelSettings, "schemaVersion">, field: "pixelId" | "enabled", value: string | boolean) => {
    setDirty(true);
    setNotice(null);
    setSettings((prev) => {
      const nextId = field === "pixelId" ? (value === "" ? null : (value as string)) : prev[provider].pixelId;
      let nextEnabled = field === "enabled" ? (value as boolean) : prev[provider].enabled;

      if (field === "pixelId") {
        if (!isValidId(provider, nextId)) nextEnabled = false;
      }

      return {
        ...prev,
        [provider]: {
          ...prev[provider],
          pixelId: nextId,
          enabled: nextEnabled,
        }
      };
    });
  };

  const handleToggle = (provider: keyof Omit<MarketingPixelSettings, "schemaVersion">, checked: boolean) => {
    if (checked && !isValidId(provider, settings[provider].pixelId)) {
      setNotice({ message: "Enter a valid identifier before enabling this provider.", isError: true });
      return;
    }
    handleChange(provider, "enabled", checked);
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (baseRevision === null) return;
    const invalidProviders = providers.filter(({ key }) => (
      Boolean(settings[key].pixelId) && !isValidId(key, settings[key].pixelId)
    ));
    if (invalidProviders.length > 0) {
      setNotice({
        message: `Correct the ${invalidProviders.map(({ label }) => label).join(", ")} identifier before saving.`,
        isError: true,
      });
      return;
    }
    setNotice(null);
    updatePixels.mutate({
      data: {
        settings,
        expectedRevision: baseRevision
      }
    }, {
      onSuccess: (updated) => {
        setNotice({ message: "Marketing pixels configuration saved.", isError: false });
        setSettings(updated.settings);
        setBaseRevision(updated.revision);
        setDirty(false);
        void pixels.refetch();
        void revisions.refetch();
      },
      onError: (error) => {
        setNotice({ message: errorMessage(error, "Failed to save marketing pixels configuration."), isError: true });
      }
    });
  };

  const reload = () => {
    if (!pixels.data) return;
    setSettings(pixels.data.settings);
    setBaseRevision(pixels.data.revision);
    setDirty(false);
    setNotice(null);
  };

  const providers: { key: keyof Omit<MarketingPixelSettings, "schemaVersion">; label: string; format: string }[] = [
    { key: "meta", label: "Meta Pixel", format: "Digits only, e.g. 123456789012345" },
    { key: "googleAds", label: "Google Ads Tag", format: "Starts with AW-, e.g. AW-123456789" },
    { key: "x", label: "X (Twitter) Pixel", format: "Alphanumeric, e.g. a1b2c" },
    { key: "tiktok", label: "TikTok Pixel", format: "Alphanumeric, e.g. C123ABCD456EFGH789IJ" },
  ];

  return (
    <section className="mt-12 border-t border-border pt-10">
      <SectionHeading icon={Target} title="Marketing pixels" description="Manage identifiers for third-party advertising trackers. These are strictly public tag identifiers (like AW-123456) and never API keys, access tokens, secrets, or raw script snippets." />
      {notice && (
        <div data-testid="status-pixels-notice" className={`mb-6 p-4 text-sm border ${notice.isError ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-primary/25 bg-primary/5"}`}>
          {notice.message}
        </div>
      )}
      <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
        <form onSubmit={save} className="space-y-6">
          <fieldset disabled={pixels.isLoading || updatePixels.isPending} className="space-y-6 border-0 p-0 m-0">
            <div className="border border-border bg-card p-5 space-y-6">
              {providers.map((p) => {
                const config = settings[p.key];
                const invalid = Boolean(config.pixelId) && !isValidId(p.key, config.pixelId);
                return (
                  <div key={p.key} className="grid sm:grid-cols-[1fr_auto] gap-4 items-start border-b border-border pb-6 last:border-0 last:pb-0">
                    <div>
                      <label className="block text-sm font-medium">{p.label}</label>
                      <p className="text-xs text-muted-foreground mt-1 mb-3">{p.format}</p>
                      <input
                        type="text"
                        data-testid={`input-pixel-${p.key}`}
                        value={config.pixelId ?? ""}
                        onChange={(e) => handleChange(p.key, "pixelId", e.target.value)}
                        placeholder="e.g. 123456"
                        aria-invalid={invalid}
                        aria-describedby={invalid ? `pixel-error-${p.key}` : undefined}
                        className="staff-input"
                      />
                      {invalid && (
                        <p id={`pixel-error-${p.key}`} data-testid={`error-pixel-${p.key}`} className="mt-2 text-xs text-destructive">
                          Enter an identifier in the format shown above. Script snippets, URLs, and credentials are not accepted.
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col sm:items-end gap-2 pt-1 sm:pt-8">
                      <label className="flex items-center gap-2 text-xs font-medium cursor-pointer uppercase tracking-wider">
                        <input
                          type="checkbox"
                          data-testid={`toggle-pixel-${p.key}`}
                          checked={config.enabled}
                          onChange={(e) => handleToggle(p.key, e.target.checked)}
                          className="w-4 h-4 accent-primary"
                        />
                        Enable Tracker
                      </label>
                      <div data-testid={`status-pixel-${p.key}`} className="text-[10px] uppercase tracking-wider font-semibold">
                        {config.enabled ? <span className="text-green-500">Active</span> : config.pixelId ? <span className="text-primary">Configured</span> : <span className="text-muted-foreground">Inactive</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                data-testid="button-save-pixels"
                disabled={updatePixels.isPending || pixels.isLoading}
                className="flex min-h-10 items-center gap-2 bg-primary px-4 text-xs font-semibold uppercase tracking-wider text-primary-foreground disabled:opacity-50"
              >
                <Save size={15} /> Save Configuration
              </button>
              <button
                type="button"
                data-testid="button-reload-pixels"
                onClick={reload}
                disabled={updatePixels.isPending || pixels.isLoading}
                className="flex min-h-10 items-center gap-2 border border-border px-4 text-xs font-semibold uppercase tracking-wider hover:border-primary disabled:opacity-50"
              >
                <History size={15} /> Revert Changes
              </button>
            </div>
          </fieldset>
        </form>

        <div className="border border-border bg-card">
          <div className="p-4 border-b border-border bg-muted/20">
            <h3 className="text-xs font-semibold uppercase tracking-wider">Revision History</h3>
            {pixels.data?.updatedAt && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Current revision {pixels.data.revision}, updated {format(new Date(pixels.data.updatedAt), "d MMM yyyy, HH:mm")}.
              </p>
            )}
          </div>
          <div className="divide-y divide-border overflow-y-auto max-h-[500px]">
            {revisions.isLoading ? <LoadingRows /> : !revisions.data?.length ? <Empty label="No revisions recorded yet." /> : revisions.data.map((rev) => (
              <div key={rev.id} data-testid={`row-pixel-revision-${rev.id}`} className="p-4 flex flex-col gap-1 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs">Revision {rev.revision}</span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-widest">{format(new Date(rev.createdAt), "HH:mm")}</span>
                </div>
                <span className="text-xs text-muted-foreground">{format(new Date(rev.createdAt), "d MMMM yyyy")}</span>
                <span className="text-[10px] text-primary truncate mt-1">By {rev.createdByClerkUserId}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
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
  const tone = status === "completed" || status === "fulfilled" || status === "resolved" ? "border-green-500/30 bg-green-500/10 text-green-700" : status === "refunded" || status === "rejected" || status === "cancelled" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-primary/20 bg-primary/5 text-primary";
  return <span className={`border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${tone}`}>{status.replaceAll("_", " ")}</span>;
}
