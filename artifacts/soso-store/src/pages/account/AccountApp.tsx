import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Redirect, Route, Switch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { getGetVerifiedShopperProfileQueryKey, useGetVerifiedShopperProfile, useLinkVerifiedShopperProfile, type ShopperProfile } from "@workspace/api-client-react";
import { MailCheck, RotateCw } from "lucide-react";
import { Seo } from "@/components/Seo";
import { apiErrorInfo, shopperScopedKey } from "@/components/account/ShopperClerkProvider";
import { OwnedShopperAuthProvider, PrivateAccountBoundary, useOwnedShopperAuth, useVerifiedShopperAuth } from "@/components/account/OwnedShopperAuthProvider";
import {
  ForgotPasswordPage, ResetPasswordPage, SignInPage, SignOutButton, SignUpPage, VerifyEmailPage, VerifyPendingPanel,
} from "@/components/account/ShopperAuthPages";
import AccountHome from "./AccountHome";
import OrderDetail from "./OrderDetail";
import AccountSessions from "./AccountSessions";

export { SignOutButton };

export default function AccountApp() {
  // Inside the nested "/account" router. Auth pages sit outside the private boundary so their
  // success state survives the identity change they cause.
  return (
    <OwnedShopperAuthProvider>
      <Seo title="Your account | SOSO Africa" description="Your private SOSO Africa account." noIndex />
      <Switch>
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/forgot-password" component={ForgotPasswordPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route path="/verify-email" component={VerifyEmailPage} />
        <Route path="/sessions">{() => <PrivateAccountBoundary><AccountSessions /></PrivateAccountBoundary>}</Route>
        <Route path="/orders/:id">{(params) => <PrivateAccountBoundary><AccountGate>{(profile) => <OrderDetail id={params.id ?? ""} profile={profile} />}</AccountGate></PrivateAccountBoundary>}</Route>
        <Route path="/">{() => <PrivateAccountBoundary><AccountGate>{(profile) => <AccountHome profile={profile} />}</AccountGate></PrivateAccountBoundary>}</Route>
        <Route><Redirect to="/" /></Route>
      </Switch>
    </OwnedShopperAuthProvider>
  );
}

export function AccountSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16 lg:px-12" aria-busy="true" role="status" aria-label="Loading your account">
      <div className="h-3 w-28 animate-pulse bg-muted" />
      <div className="mt-4 h-10 w-72 max-w-full animate-pulse bg-muted" />
      <div className="mt-12 grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="h-80 animate-pulse bg-muted/70" />
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse bg-muted/70" />)}</div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-lg flex-col justify-center px-6 py-16">
      <p className="text-[11px] uppercase tracking-[0.3em] text-secondary">Your account</p>
      <h1 className="soso-display mt-3 text-3xl md:text-4xl">{title}</h1>
      <div className="mt-6 text-sm leading-relaxed text-secondary">{children}</div>
    </div>
  );
}

/** Ensures the signed-in, verified shopper is linked to a SOSO customer before any account page renders. */
function AccountGate({ children }: { children: (profile: ShopperProfile) => ReactNode }) {
  const auth = useOwnedShopperAuth();
  const { isLoaded, isSignedIn, userId, user } = useVerifiedShopperAuth();
  const queryClient = useQueryClient();
  const profileKey = shopperScopedKey(getGetVerifiedShopperProfileQueryKey(), userId);
  const profile = useGetVerifiedShopperProfile({
    query: { enabled: isLoaded && !!isSignedIn && !!userId, retry: false, queryKey: profileKey },
  });
  const link = useLinkVerifiedShopperProfile({
    mutation: {
      onSuccess: (linked) => queryClient.setQueryData(profileKey, linked),
    },
  });
  const linkMutate = useRef(link.mutate);
  linkMutate.current = link.mutate;
  const autoTried = useRef<string | null>(null);
  const [name, setName] = useState("");

  const profileError = apiErrorInfo(profile.error);
  const notLinked = (profile.isError && profileError.status === 404) || (profile.data && !profile.data.linked);
  const fullName = user?.name?.trim() ?? "";
  const linkError = apiErrorInfo(link.error);

  useEffect(() => {
    if (!notLinked || !user || !fullName || autoTried.current === user.id) return;
    autoTried.current = user.id;
    linkMutate.current({ data: {} });
  }, [notLinked, user, fullName]);

  if (!isLoaded) return <AccountSkeleton />;
  if (!auth.isSignedIn) return <Redirect to="/sign-in" />;
  if (!auth.emailVerified) return <VerifyPendingPanel />;
  if (!isSignedIn) return <AccountSkeleton />;
  if (!userId) return <AccountSkeleton />;
  if (profile.data?.linked) return <div key={userId}>{children(profile.data)}</div>;
  if (profile.isLoading || link.isPending) return <AccountSkeleton />;

  if (profile.isError && !notLinked) {
    return (
      <Panel title="We could not open your account">
        <p role="alert">{profileError.message ?? "Your account details did not load. Nothing has changed."}</p>
        <button type="button" onClick={() => void profile.refetch()} data-testid="button-retry-profile" className="mt-6 inline-flex items-center gap-2 bg-foreground px-5 py-3 text-xs font-bold uppercase tracking-[0.2em] text-background">
          <RotateCw size={14} /> Try again
        </button>
        <div className="mt-6"><SignOutButton /></div>
      </Panel>
    );
  }

  if (linkError.code === "EMAIL_NOT_VERIFIED") {
    return (
      <Panel title="Verify your email first">
        <p className="flex gap-3"><MailCheck className="mt-0.5 shrink-0 text-[#8a6a22]" size={18} />Your SOSO account opens once the email address on your sign-in is verified. Follow the link we emailed you, then try again.</p>
        <div className="mt-6 flex flex-wrap items-center gap-5">
          <button type="button" onClick={() => linkMutate.current({ data: fullName ? {} : { name: name.trim() } })} data-testid="button-retry-link" className="bg-foreground px-5 py-3 text-xs font-bold uppercase tracking-[0.2em] text-background">I have verified</button>
          <SignOutButton />
        </div>
      </Panel>
    );
  }

  const needsName = !fullName || linkError.code === "NAME_REQUIRED";
  if (needsName) {
    const submit = (event: FormEvent) => {
      event.preventDefault();
      if (name.trim()) linkMutate.current({ data: { name: name.trim() } });
    };
    return (
      <Panel title="One last detail">
        <p>Tell us the name to use on your orders, and your account is ready.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm text-foreground">Your name
            <input required maxLength={255} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="soso-account-input mt-2" data-testid="input-link-name" />
          </label>
          {link.isError && linkError.code !== "NAME_REQUIRED" && <p role="alert" className="text-destructive">{linkError.message ?? "We could not finish setting up your account. Please try again."}</p>}
          <button className="w-full bg-foreground py-4 text-xs font-bold uppercase tracking-[0.2em] text-background" data-testid="button-link-account">Open my account</button>
        </form>
      </Panel>
    );
  }

  if (link.isError) {
    return (
      <Panel title="Your account is almost ready">
        <p role="alert">{linkError.message ?? "We could not finish setting up your account."}</p>
        <button type="button" onClick={() => linkMutate.current({ data: {} })} data-testid="button-retry-link" className="mt-6 inline-flex items-center gap-2 bg-foreground px-5 py-3 text-xs font-bold uppercase tracking-[0.2em] text-background">
          <RotateCw size={14} /> Try again
        </button>
      </Panel>
    );
  }

  return <AccountSkeleton />;
}
