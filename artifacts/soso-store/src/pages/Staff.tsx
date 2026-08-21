import React, { FormEvent, useState } from 'react';
import { 
  useGetStaffProfile, 
  useGetStaffOverview, 
  useGetStaffFunnel,
  useListStaffOrders, 
  useListStaffEnquiries,
  useListStaffJournalPosts,
  useCreateStaffJournalPost,
  useUpdateStaffJournalPost,
  type StaffJournalPost,
  type StaffJournalPostInput,
} from '@workspace/api-client-react';
import { format } from 'date-fns';
import { 
  ShieldAlert, 
  Loader2, 
  Package, 
  Clock, 
  MessageSquare, 
  Activity, 
  ChevronRight,
  Mail,
  Phone,
  Search,
  AlertCircle,
  FileText,
  PenLine,
  Plus,
  Save,
  BarChart3,
} from 'lucide-react';

const emptyArticle: StaffJournalPostInput = {
  slug: '',
  title: '',
  excerpt: '',
  body: '',
  coverImageUrl: null,
  authorName: '',
  status: 'draft',
};

export default function Staff() {
  const { data: profile, isLoading: isProfileLoading, isError: isProfileError } = useGetStaffProfile();
  
  if (isProfileLoading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isProfileError || !profile) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
        <ShieldAlert className="w-12 h-12 text-destructive mb-6" strokeWidth={1} />
        <h1 className="text-3xl soso-display mb-3 text-foreground">Access Restricted</h1>
        <p className="text-muted-foreground max-w-md">
          This surface is restricted to authenticated SOSO personnel. Please sign in with appropriate credentials to access the atelier operations portal.
        </p>
      </div>
    );
  }

  const canViewOrders = profile.role === 'owner' || profile.role === 'operations';
  const canViewEnquiries = canViewOrders || profile.role === 'stylist';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20 fade-in">
      <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border pb-8">
        <div>
          <h1 className="text-4xl soso-display mb-3 text-foreground">Atelier Operations</h1>
          <div className="flex items-center gap-3 text-sm">
            <span className="bg-primary/10 text-primary px-2.5 py-1 uppercase tracking-widest font-medium text-xs">
              {profile.role}
            </span>
            <span className="text-muted-foreground">{profile.email}</span>
          </div>
        </div>
        <div className="text-left md:text-right">
          <p className="text-sm text-muted-foreground uppercase tracking-widest">
            {format(new Date(), 'EEEE, MMMM do, yyyy')}
          </p>
        </div>
      </header>
      
      <OverviewSection />
       {(profile.role === 'owner' || profile.role === 'analyst') && <FunnelSection />}
      
       {(canViewOrders || canViewEnquiries) && (
         <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 lg:gap-12 mt-12">
           {canViewOrders && <OrdersSection />}
           {canViewEnquiries && <EnquiriesSection />}
         </div>
       )}
        {(profile.role === 'owner' || profile.role === 'editor') && <JournalManagementSection canManage />}
    </div>
  );
}

function OverviewSection() {
  const { data: overview, isLoading } = useGetStaffOverview();

  if (isLoading) {
    return <div className="h-32 border border-border animate-pulse bg-muted/20" />;
  }

  if (!overview) return null;

  const stats = [
    { label: "Orders in Production", value: overview.ordersInProduction, icon: Package },
    { label: "Open Enquiries", value: overview.openEnquiries, icon: MessageSquare },
    { label: "Total Lifetime Orders", value: overview.ordersTotal, icon: Activity },
    { label: "Storefront Events (7d)", value: overview.storefrontEvents7d, icon: Search },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium tracking-wide uppercase text-foreground/80 flex items-center gap-2">
        <Activity className="w-5 h-5 text-primary" />
        Pulse
      </h2>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <div key={i} className="border border-border p-6 bg-card relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <stat.icon className="w-16 h-16 text-foreground" />
            </div>
            <p className="text-sm text-muted-foreground mb-4 uppercase tracking-wider">{stat.label}</p>
            <p className="text-4xl soso-display text-foreground">{stat.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {!overview.paymentIsLive && (
        <div className="bg-destructive/5 border border-destructive/20 p-5 flex items-start gap-4">
          <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-destructive mb-1 uppercase tracking-wider">Payments Offline</h3>
            <p className="text-sm text-destructive/80">The storefront is currently unable to process real transactions. Test mode is active.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function FunnelSection() {
  const { data: funnel, isLoading, isError } = useGetStaffFunnel();

  return (
    <section className="mt-12">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-medium uppercase tracking-wide text-foreground/80">Storefront signal</h2>
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        Raw first-party event counts from visitors who opted into measurement during the last seven days. These are not person-level conversion rates.
      </p>
      <div className="mt-5 border border-border bg-card">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground"><Loader2 className="mx-auto animate-spin text-primary" size={22} /></div>
        ) : isError || !funnel ? (
          <div className="p-6 text-sm text-muted-foreground">Measurement data is unavailable right now.</div>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border">
            {funnel.events.map((event) => (
              <div key={event.eventName} className="p-5">
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{event.eventName.replaceAll('_', ' ')}</p>
                <p className="mt-3 soso-display text-3xl text-foreground">{event.count.toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function OrdersSection() {
  const { data: orders, isLoading } = useListStaffOrders();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium tracking-wide uppercase text-foreground/80 flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          Recent Orders
        </h2>
      </div>

      <div className="border border-border bg-card">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-primary" />
            <p className="uppercase tracking-widest text-xs">Loading orders...</p>
          </div>
        ) : !orders?.length ? (
          <div className="p-12 text-center text-muted-foreground">
            <p className="uppercase tracking-widest text-sm">No orders found.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {orders.map(order => (
              <div key={order.id} className="p-5 sm:p-6 hover:bg-white/[0.02] transition-colors group">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-mono text-sm text-primary tracking-wider">#{order.orderNumber}</span>
                      <OrderStatusBadge status={order.status} />
                    </div>
                    <p className="text-foreground font-medium tracking-wide">{order.customerName}</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                      <Mail className="w-3 h-3" /> {order.customerEmail}
                    </p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-xl soso-display tracking-wide">{order.currency} {parseFloat(order.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-xs text-muted-foreground flex items-center sm:justify-end gap-1.5 mt-2 uppercase tracking-widest">
                      <Clock className="w-3 h-3" /> {format(new Date(order.createdAt), 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EnquiriesSection() {
  const { data: enquiries, isLoading } = useListStaffEnquiries();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium tracking-wide uppercase text-foreground/80 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          Customer Enquiries
        </h2>
      </div>

      <div className="border border-border bg-card">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-primary" />
            <p className="uppercase tracking-widest text-xs">Loading enquiries...</p>
          </div>
        ) : !enquiries?.length ? (
          <div className="p-12 text-center text-muted-foreground">
            <p className="uppercase tracking-widest text-sm">No pending enquiries.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {enquiries.map(enq => (
              <div key={enq.id} className="p-5 sm:p-6 hover:bg-white/[0.02] transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-foreground font-medium tracking-wide">{enq.name || 'Anonymous'}</h3>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mt-2">
                      {enq.email && <span className="flex items-center gap-1.5"><Mail className="w-3 h-3" /> {enq.email}</span>}
                      {enq.phone && <span className="flex items-center gap-1.5"><Phone className="w-3 h-3" /> {enq.phone}</span>}
                    </div>
                  </div>
                  <div className="sm:text-right shrink-0">
                    <span className="inline-block bg-border px-2.5 py-1 text-[10px] uppercase tracking-widest text-foreground font-medium">
                      {enq.status}
                    </span>
                    <p className="text-[10px] text-muted-foreground mt-3 uppercase tracking-widest">
                      {format(new Date(enq.createdAt), 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>
                
                {enq.productSlug && (
                  <div className="mb-4">
                    <span className="text-xs uppercase tracking-widest text-primary border border-primary/20 px-2.5 py-1 bg-primary/5">
                      Ref: {enq.productSlug}
                    </span>
                  </div>
                )}
                
                <p className="text-sm text-foreground/80 line-clamp-2 leading-relaxed font-serif italic">
                  "{enq.message}"
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function JournalManagementSection({ canManage }: { canManage: boolean }) {
  const { data: posts, isLoading, refetch } = useListStaffJournalPosts();
  const createArticle = useCreateStaffJournalPost();
  const updateArticle = useUpdateStaffJournalPost();
  const [article, setArticle] = useState<StaffJournalPostInput>(emptyArticle);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const isSaving = createArticle.isPending || updateArticle.isPending;

  const startNew = () => {
    setEditingId(null);
    setArticle(emptyArticle);
    setNotice('');
  };

  const editArticle = (post: StaffJournalPost) => {
    setEditingId(post.id);
    setArticle({
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      body: post.body,
      coverImageUrl: post.coverImageUrl,
      authorName: post.authorName,
      status: post.status,
    });
    setNotice('');
  };

  const saveArticle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice('');

    try {
      if (editingId) {
        await updateArticle.mutateAsync({ id: editingId, data: article });
        setNotice('Article saved.');
      } else {
        const created = await createArticle.mutateAsync({ data: article });
        setEditingId(created.id);
        setNotice('Article created.');
      }
      await refetch();
    } catch {
      setNotice('We could not save this article. Check the required fields and your staff role.');
    }
  };

  return (
    <section className="mt-12 border-t border-border pt-12">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-7">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-primary">Editorial</p>
          <h2 className="mt-2 text-3xl soso-display text-foreground">Journal management</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Draft, publish, or archive approved editorial. Only published articles appear in the public Journal.
          </p>
        </div>
        {canManage && (
          <button type="button" onClick={startNew} className="inline-flex items-center justify-center gap-2 border border-primary bg-primary px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-primary-foreground">
            <Plus size={15} /> New article
          </button>
        )}
      </div>

      <div className={`grid gap-8 ${canManage ? 'xl:grid-cols-[0.9fr_1.1fr]' : ''}`}>
        <div className="border border-border bg-card">
          {isLoading ? (
            <div className="p-12 text-center text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-primary" />
              <p className="uppercase tracking-widest text-xs">Loading editorial...</p>
            </div>
          ) : !posts?.length ? (
            <div className="p-10 text-center text-muted-foreground">
              <FileText className="w-7 h-7 mx-auto mb-3 text-primary" />
              <p className="uppercase tracking-widest text-xs">No articles yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {posts.map((post) => (
                <article key={post.id} className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="font-medium text-foreground truncate">{post.title}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">/{post.slug} · {post.authorName}</p>
                    </div>
                    <span className={`shrink-0 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest ${
                      post.status === 'published' ? 'bg-primary/10 text-primary' : post.status === 'archived' ? 'bg-muted text-muted-foreground' : 'bg-blue-500/10 text-blue-400'
                    }`}>
                      {post.status}
                    </span>
                  </div>
                  {canManage && (
                    <button type="button" onClick={() => editArticle(post)} className="mt-4 inline-flex items-center gap-2 text-xs uppercase tracking-widest text-primary underline underline-offset-4">
                      <PenLine size={13} /> Edit
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>

        {canManage && (
          <form onSubmit={saveArticle} className="border border-border bg-card p-5 sm:p-7 space-y-5">
            <div className="flex items-center justify-between gap-4">
              <h3 className="soso-display text-2xl text-foreground">{editingId ? 'Edit article' : 'New article'}</h3>
              <span className="text-xs uppercase tracking-widest text-muted-foreground">{article.status}</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Title">
                <input required minLength={4} maxLength={180} value={article.title} onChange={(event) => setArticle({ ...article, title: event.target.value })} className="staff-input" />
              </Field>
              <Field label="Article URL">
                <input required minLength={3} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={article.slug} onChange={(event) => setArticle({ ...article, slug: event.target.value.trim().toLowerCase() })} placeholder="modern-kaftan-style" className="staff-input" />
              </Field>
            </div>
            <Field label="Standfirst">
              <textarea required minLength={20} maxLength={360} rows={3} value={article.excerpt} onChange={(event) => setArticle({ ...article, excerpt: event.target.value })} className="staff-input resize-y" />
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Author">
                <input required minLength={2} maxLength={120} value={article.authorName} onChange={(event) => setArticle({ ...article, authorName: event.target.value })} className="staff-input" />
              </Field>
              <Field label="Status">
                <select value={article.status} onChange={(event) => setArticle({ ...article, status: event.target.value as StaffJournalPostInput['status'] })} className="staff-input">
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </Field>
            </div>
            <Field label="Cover image URL">
              <input type="url" value={article.coverImageUrl ?? ''} onChange={(event) => setArticle({ ...article, coverImageUrl: event.target.value || null })} placeholder="https://…" className="staff-input" />
            </Field>
            <Field label="Article body">
              <textarea required minLength={100} maxLength={50000} rows={12} value={article.body} onChange={(event) => setArticle({ ...article, body: event.target.value })} className="staff-input resize-y font-serif leading-relaxed" />
            </Field>
            {notice && <p role="status" className="border border-primary/25 bg-primary/5 px-4 py-3 text-sm text-foreground">{notice}</p>}
            <button disabled={isSaving} className="inline-flex w-full items-center justify-center gap-2 bg-primary px-4 py-3.5 text-xs font-semibold uppercase tracking-[0.16em] text-primary-foreground disabled:opacity-60">
              {isSaving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
              {isSaving ? 'Saving…' : editingId ? 'Save article' : 'Create article'}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
      {label}
      <span className="mt-2 block [&_.staff-input]:w-full [&_.staff-input]:border [&_.staff-input]:border-border [&_.staff-input]:bg-background [&_.staff-input]:px-3 [&_.staff-input]:py-2.5 [&_.staff-input]:text-sm [&_.staff-input]:text-foreground [&_.staff-input]:outline-none [&_.staff-input]:focus:border-primary">
        {children}
      </span>
    </label>
  );
}

function OrderStatusBadge({ status }: { status: string }) {
  let colorClass = "bg-border text-foreground";
  const lower = status.toLowerCase();
  
  if (lower.includes('production') || lower === 'processing') {
    colorClass = "bg-primary/10 text-primary border border-primary/20";
  } else if (lower === 'completed' || lower === 'delivered') {
    colorClass = "bg-green-500/10 text-green-400 border border-green-500/20";
  } else if (lower === 'cancelled') {
    colorClass = "bg-destructive/10 text-destructive border border-destructive/20";
  } else if (lower === 'paid') {
    colorClass = "bg-blue-500/10 text-blue-400 border border-blue-500/20";
  }

  return (
    <span className={`text-[10px] font-medium uppercase tracking-widest px-2.5 py-0.5 ${colorClass}`}>
      {status}
    </span>
  );
}
