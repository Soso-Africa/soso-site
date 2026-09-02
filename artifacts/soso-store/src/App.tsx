import { type ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, useLocation, Router as WouterRouter, Redirect } from 'wouter';

import { CartProvider } from '@/context/CartContext';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { CartDrawer } from '@/components/CartDrawer';
import { ConsentManager } from '@/components/ConsentManager';
import { Seo } from '@/components/Seo';
import { getRedirect, isPrivateStorefrontPath } from '@workspace/api-client-react';
import { customFetch } from '@workspace/api-client-react';
import { usePlatformContent } from '@/data/platformContent';
import { legacyRedirectByPath } from '@/data/legacy-redirects';

import Home from '@/pages/Home';
import Shop from '@/pages/Shop';
import ProductDetail from '@/pages/ProductDetail';
import Checkout from '@/pages/Checkout';
import PaymentReturn from '@/pages/PaymentReturn';
import Journal from '@/pages/Journal';
import JournalPost from '@/pages/JournalPost';
import JournalPreview from '@/pages/JournalPreview';
import Policy from '@/pages/Policy';
import PolicyHub from '@/pages/PolicyHub';
import About from '@/pages/About';
import LegacyAboutPage from '@/pages/LegacyAboutPage';
import FAQ from '@/pages/FAQ';
import CollectionPage from '@/pages/CollectionPage';
import SignIn from '@/pages/SignIn';
import Staff from '@/pages/Staff';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/women"><Redirect to="/shop?department=women" /></Route>
        <Route path="/shop" component={Shop} />
        <Route path="/product/:slug" component={ProductDetail} />
        <Route path="/checkout" component={Checkout} />
        <Route path="/checkout/return" component={PaymentReturn} />
        <Route path="/journal" component={Journal} />
        <Route path="/journal/:slug" component={JournalPost} />
        <Route path="/journal/preview/:slug" component={JournalPreview} />
        <Route path="/about" component={About} />
        <Route path="/about/:slug" component={LegacyAboutPage} />
        <Route path="/faq" component={FAQ} />
        <Route path="/collections/:slug">
          {(params) => <CollectionPage slug={params.slug ?? ""} />}
        </Route>
        <Route path="/policies" component={PolicyHub} />
        <Route path="/policies/:slug">
          {() => <Policy />}
        </Route>
        <Route path="/privacy" component={Policy} />
        <Route path="/cookies" component={CookieRedirect} />
        <Route path="/terms" component={Policy} />
        <Route path="/delivery-returns" component={Policy} />
        <Route path="/delivery" component={DeliveryRedirect} />
        <Route path="/returns" component={ReturnsRedirect} />
        <Route path="/care" component={Policy} />
        <Route path="/sign-in/*?" component={SignIn} />
        <Route path="/sign-up/*?"><Redirect to="/sign-in" /></Route>
        <Route path="/staff" component={StaffGate} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function CookieRedirect() {
  return <Redirect to="/privacy#cookies" />;
}

function StaffGate() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void customFetch("/api/staff-auth/status")
      .then(() => { if (!cancelled) setSignedIn(true); })
      .catch(() => { if (!cancelled) setSignedIn(false); })
      .finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, []);
  if (!ready) return <div className="flex min-h-[45vh] items-center justify-center text-sm text-muted-foreground">Checking staff access…</div>;
  return signedIn ? <Staff /> : <Redirect to="/sign-in" />;
}

function DeliveryRedirect() {
  return <Redirect to="/delivery-returns#delivery" />;
}

function ReturnsRedirect() {
  return <Redirect to="/delivery-returns#returns" />;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <CartProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <AppShell />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </CartProvider>
    </QueryClientProvider>
  );
}

function AppShell() {
  const [location] = useLocation();
  const platform = usePlatformContent();
  const staffOrAuthSurface = isPrivateStorefrontPath(location);

  useEffect(() => {
    document.documentElement.classList.toggle("soso-staff-theme", staffOrAuthSurface);
    return () => document.documentElement.classList.remove("soso-staff-theme");
  }, [staffOrAuthSurface]);

  return (
    <>
      {platform.data && <a href="#main-content" className="soso-skip-link">{platform.data.content.site.skipLinkLabel}</a>}
      <div className="flex flex-col min-h-screen">
        {!staffOrAuthSurface && <Navbar />}
        {staffOrAuthSurface && (
          <Seo
            title="Staff access | SOSO Africa"
            description="Restricted SOSO Africa staff access."
            noIndex
          />
        )}
        <main id="main-content" className="flex-1" tabIndex={-1}>
          <RedirectGuard><Router /></RedirectGuard>
        </main>
        {!staffOrAuthSurface && <Footer />}
      </div>
      {!staffOrAuthSurface && (
        <>
          <CartDrawer />
          <ConsentManager />
        </>
      )}
    </>
  );
}

function RedirectGuard({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timedOut = false;
    setChecking(true);

    const normalizedPath = location !== "/" && location.endsWith("/")
      ? location
      : `${location}/`;
    const bundledRedirect = legacyRedirectByPath.get(location)
      ?? legacyRedirectByPath.get(normalizedPath);
    if (
      bundledRedirect
      && bundledRedirect.toPath !== location
      && bundledRedirect.toPath.startsWith("/")
      && !bundledRedirect.toPath.startsWith("//")
    ) {
      navigate(bundledRedirect.toPath, { replace: true });
      setChecking(false);
      return;
    }

    // Redirects are a convenience layer; the storefront must remain available
    // if that lookup is slow or unavailable.
    const fallbackTimer = window.setTimeout(() => {
      timedOut = true;
      if (!cancelled) setChecking(false);
    }, 4000);

    void getRedirect({ path: location })
      .then(({ redirect }) => {
        if (cancelled || timedOut) return;
        if (!redirect) return;
        if (
          redirect.toPath !== location
          && redirect.toPath.startsWith("/")
          && !redirect.toPath.startsWith("//")
        ) {
          navigate(redirect.toPath, { replace: true });
        }
      })
      .catch(() => {
        // A missing redirect is expected for almost every storefront route.
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
    };
  }, [location, navigate]);

  if (checking) {
    return (
      <div
        className="flex min-h-[45vh] items-center justify-center px-6 text-center"
        aria-busy="true"
        aria-live="polite"
        role="status"
      >
        <div className="h-6 w-6 animate-pulse rounded-full bg-muted" aria-hidden="true" />
      </div>
    );
  }
  return <>{children}</>;
}

export default App;
