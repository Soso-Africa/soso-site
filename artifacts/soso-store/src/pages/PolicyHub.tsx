import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Seo } from "@/components/Seo";
import { PlatformContentState, usePlatformContent } from "@/data/platformContent";
import type { PolicySummary } from "@/data/policies";

export default function PolicyHub() {
  const platform = usePlatformContent();
  const platformStateCopy = platform.data?.content.site.platformState;
  const policies = useQuery<PolicySummary[]>({
    queryKey: ["published-policies"],
    queryFn: () => customFetch("/api/policies", { responseType: "json" }),
    staleTime: 60_000,
  });
  if (!platform.data) return <PlatformContentState loading={platform.isLoading} error={platform.isError} copy={platformStateCopy} />;
  const copy = platform.data.content.pages.policies;

  return (
    <section className="min-h-[70vh] px-6 py-20 md:px-12 md:py-28">
      <Seo
        title={copy.seo.title}
        description={copy.seo.description}
        path="/policies"
      />
      <div className="mx-auto max-w-4xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#b8912f]">
          {copy.eyebrow}
        </p>
        <h1 className="soso-display mt-5 text-4xl leading-tight md:text-6xl">{copy.title}</h1>
        <p className="mt-7 max-w-2xl text-base leading-8 text-[#d8ceb9] md:text-lg">
          {copy.intro}
        </p>
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {policies.isLoading && <p role="status" className="text-sm text-muted-foreground">{copy.loadingMessage}</p>}
          {policies.isError && <p role="alert" className="text-sm text-muted-foreground">{copy.unavailableMessage}</p>}
          {!policies.isLoading && !policies.isError && policies.data?.length === 0 && (
            <p role="status" className="text-sm text-muted-foreground">{copy.emptyMessage}</p>
          )}
          {policies.data?.map((policy) => (
            <Link
              key={policy.slug}
              href={`/policies/${policy.slug}`}
              className="group border border-[#b8912f]/30 bg-[#17130e] p-6 transition hover:border-[#b8912f]/70 hover:bg-[#1d1811]"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#b8912f]">{copy.cardLabel}</p>
              <h2 className="soso-display mt-4 text-2xl text-foreground">{policy.title}</h2>
              <p className="mt-3 text-sm leading-7 text-[#d8ceb9]">{policy.summary}</p>
              <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-[#d4b45a]">{copy.openLabel}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}