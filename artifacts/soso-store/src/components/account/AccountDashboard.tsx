import { FormEvent, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useVerifiedShopperAuth } from "./OwnedShopperAuthProvider";
import { SignOutButton } from "./ShopperAuthPages";
import {
  getGetShopperProfileQueryKey,
  useGetShopperProfile,
  useLinkShopperProfile,
} from "@workspace/api-client-react";
import { ProfileSection } from "./ProfileSection";
import { OrdersSection } from "./OrdersSection";
import { ProductionSection } from "./ProductionSection";
import { MeasurementsSection } from "./MeasurementsSection";
import { ErrorNote, Skeleton, errorStatus, fieldClass, ghostButton, labelClass, primaryButton } from "./shared";

function NameCapture({ onSubmit, pending, error }: { onSubmit: (name: string) => void; pending: boolean; error: unknown }) {
  const [name, setName] = useState("");
  const submit = (e: FormEvent) => { e.preventDefault(); if (name.trim()) onSubmit(name.trim()); };
  return (
    <form onSubmit={submit} className="mx-auto grid max-w-md gap-5 border border-border p-6 md:p-8" data-testid="form-link-name">
      <div>
        <h2 className="soso-display text-2xl uppercase tracking-[0.12em]">One more detail</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-secondary">Tell us the name to use for your orders and atelier fittings.</p>
      </div>
      <label className={labelClass}>Full name
        <input required maxLength={255} value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} autoComplete="name" data-testid="input-link-name" />
      </label>
      {Boolean(error) && <ErrorNote error={error} />}
      <button type="submit" disabled={pending || !name.trim()} className={primaryButton} data-testid="button-link-profile">{pending ? "Saving..." : "Continue"}</button>
    </form>
  );
}

export function AccountDashboard() {
  const { user, isSignedIn } = useVerifiedShopperAuth();
  const queryClient = useQueryClient();
  const profile = useGetShopperProfile({ query: { enabled: isSignedIn, retry: false, queryKey: getGetShopperProfileQueryKey() } });
  const link = useLinkShopperProfile();
  const linkMutateRef = useRef(link.mutate);
  linkMutateRef.current = link.mutate;
  const autoLinkedFor = useRef<string | null>(null);

  const needsLink = profile.isError && errorStatus(profile.error) === 404;
  const fullName = user?.name?.trim() ?? "";
  const userId = user?.id ?? null;

  const doLink = (name: string) => {
    linkMutateRef.current(
      { data: { name } },
      {
        onSuccess: (next) => {
          queryClient.setQueryData(getGetShopperProfileQueryKey(), next);
          void queryClient.invalidateQueries({ queryKey: getGetShopperProfileQueryKey() });
        },
      },
    );
  };
  const doLinkRef = useRef(doLink);
  doLinkRef.current = doLink;

  useEffect(() => {
    if (!needsLink || !userId || !fullName) return;
    if (autoLinkedFor.current === userId) return;
    autoLinkedFor.current = userId;
    doLinkRef.current(fullName);
  }, [needsLink, userId, fullName]);

  const signOutButton = (
    <SignOutButton className={ghostButton} />
  );

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-16 lg:px-12 md:py-24">
      <header className="mb-12 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-secondary">My account</p>
          <h1 className="soso-display text-4xl uppercase tracking-[0.1em] text-foreground md:text-5xl" data-testid="text-account-greeting">
            {profile.data ? `Welcome, ${profile.data.customer.name.split(" ")[0]}` : "Your SOSO account"}
          </h1>
        </div>
        {signOutButton}
      </header>

      {profile.isLoading && <Skeleton rows={4} />}

      {profile.isError && !needsLink && (
        errorStatus(profile.error) === 403
          ? <p className="border border-border px-5 py-4 text-[13px] text-secondary" data-testid="status-account-unavailable">Customer accounts are not available at the moment. Please try again later.</p>
          : <ErrorNote error={profile.error} onRetry={() => void profile.refetch()} />
      )}

      {needsLink && (
        fullName && link.isPending
          ? <Skeleton rows={2} />
          : fullName && link.isError
            ? <div className="grid gap-4"><ErrorNote error={link.error} onRetry={() => doLink(fullName)} /></div>
            : !fullName || !link.isSuccess
              ? (fullName ? <Skeleton rows={2} /> : <NameCapture onSubmit={doLink} pending={link.isPending} error={link.error} />)
              : <Skeleton rows={2} />
      )}

      {profile.data && (
        <div className="grid gap-16">
          <ProfileSection profile={profile.data} />
          <OrdersSection />
          <ProductionSection />
          {profile.data.capabilities?.measurements && <MeasurementsSection />}
        </div>
      )}
    </div>
  );
}
