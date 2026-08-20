import React from 'react';
import { 
  useGetStaffProfile, 
  useGetStaffOverview, 
  useListStaffOrders, 
  useListStaffEnquiries 
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
  AlertCircle
} from 'lucide-react';

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
      
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 lg:gap-12 mt-12">
        <OrdersSection />
        <EnquiriesSection />
      </div>
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
