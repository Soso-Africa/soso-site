import { Redirect, Route, Switch } from "wouter";
import { OwnedShopperAuthProvider, PrivateAccountBoundary, useOwnedShopperAuth } from "@/components/account/OwnedShopperAuthProvider";
import { VerifyPendingPanel } from "@/components/account/ShopperAuthPages";
import { Seo } from "@/components/Seo";
import { AccountDashboard } from "@/components/account/AccountDashboard";

/** Original measurements/atelier dashboard. Sign-in and recovery live under the /account nest. */
function AtelierHome() {
  const auth = useOwnedShopperAuth();
  if (!auth.isSignedIn) return <Redirect to={`/account/sign-in?next=${encodeURIComponent("/account/atelier")}`} />;
  if (!auth.emailVerified) return <VerifyPendingPanel />;
  return <AccountDashboard />;
}

export default function ShopperAccount() {
  return (
    <OwnedShopperAuthProvider>
      <Seo title="My account | SOSO Africa" description="Your SOSO Africa customer account." path="/account" noIndex />
      <Switch>
        <Route path="/account/atelier/*?">{() => <PrivateAccountBoundary><AtelierHome /></PrivateAccountBoundary>}</Route>
        <Route><Redirect to="/account" /></Route>
      </Switch>
    </OwnedShopperAuthProvider>
  );
}
