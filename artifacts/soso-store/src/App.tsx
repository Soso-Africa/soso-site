import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { Show } from "@clerk/react";

import { CartProvider } from '@/context/CartContext';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { WhatsAppButton } from '@/components/WhatsAppButton';
import { CartDrawer } from '@/components/CartDrawer';
import { ConsentManager } from '@/components/ConsentManager';

import Home from '@/pages/Home';
import Shop from '@/pages/Shop';
import ProductDetail from '@/pages/ProductDetail';
import Checkout from '@/pages/Checkout';
import Journal from '@/pages/Journal';
import JournalPost from '@/pages/JournalPost';
import Policy from '@/pages/Policy';
import PolicyHub from '@/pages/PolicyHub';
import SignIn from '@/pages/SignIn';
import SignUp from '@/pages/SignUp';
import Staff from '@/pages/Staff';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/shop" component={Shop} />
        <Route path="/product/:slug" component={ProductDetail} />
        <Route path="/checkout" component={Checkout} />
        <Route path="/journal" component={Journal} />
        <Route path="/journal/:slug" component={JournalPost} />
        <Route path="/policies" component={PolicyHub} />
        <Route path="/privacy" component={Policy} />
        <Route path="/cookies" component={CookieRedirect} />
        <Route path="/terms" component={Policy} />
        <Route path="/delivery-returns" component={Policy} />
        <Route path="/delivery" component={DeliveryRedirect} />
        <Route path="/returns" component={ReturnsRedirect} />
        <Route path="/care" component={Policy} />
        <Route path="/sign-in/*?" component={SignIn} />
        <Route path="/sign-up/*?" component={SignUp} />
        <Route path="/staff" component={StaffGate} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function StaffGate() {
  return (
    <>
      <Show when="signed-in">
        <Staff />
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function CookieRedirect() {
  return <Redirect to="/privacy#cookies" />;
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
  const staffOrAuthSurface = location.startsWith("/staff") || location.startsWith("/sign-");

  return (
    <>
      <div className="flex flex-col min-h-screen">
        {!staffOrAuthSurface && <Navbar />}
        <main className="flex-1">
          <Router />
        </main>
        {!staffOrAuthSurface && <Footer />}
      </div>
      {!staffOrAuthSurface && (
        <>
          <CartDrawer />
          <WhatsAppButton />
          <ConsentManager />
        </>
      )}
    </>
  );
}

export default App;
