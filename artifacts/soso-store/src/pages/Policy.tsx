import { type FormEvent, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { customFetch, useCreatePrivacyRequest } from "@workspace/api-client-react";
import { Seo } from "@/components/Seo";
import type { PolicyDocument } from "@/data/policies";
import { PlatformContentState, usePlatformContent, type PlatformContent } from "@/data/platformContent";

export default function Policy() {
  const [location] = useLocation();
  const [page, setPage] = useState<PolicyDocument | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const platform = usePlatformContent();
  const platformStateCopy = platform.data?.content.site.platformState;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    setPage(null);
    const slug = location.startsWith("/policies/") ? location.slice("/policies/".length) : location.replace(/^\//, "");
    void customFetch<PolicyDocument>(`/api/policies/${slug}`)
      .then((published) => {
        if (active) { setPage(published); setVersion(published.version ?? null); setLoading(false); }
      })
      .catch(() => { if (active) { setLoadError(true); setVersion(null); setLoading(false); } });
    return () => { active = false; };
  }, [location]);

  if (!platform.data) return <PlatformContentState loading={platform.isLoading} error={platform.isError} copy={platformStateCopy} />;
  const copy = platform.data.content.pages.policies;
  if (loading || !page) {
    return <main className="flex min-h-[70vh] items-center justify-center px-6 text-center">
      <p role={loadError ? "alert" : "status"} className="text-sm text-muted-foreground">
        {loading ? copy.loadingMessage : copy.unavailableMessage}
      </p>
    </main>;
  }

  return (
    <section className="min-h-[70vh] px-6 py-20 md:px-12 md:py-28">
      <Seo
        title={`${page.title} | SOSO Africa`}
        description={page.summary}
        path={location}
      />
      <div className="mx-auto max-w-3xl border-y border-border py-12">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          {copy.approvedLabel}
        </p>
        <h1 className="soso-display mt-5 text-4xl leading-tight md:text-6xl">{page.title}</h1>
        <p className="mt-7 max-w-2xl text-base leading-8 text-muted-foreground md:text-lg">
          {page.summary}
        </p>
        <div className="mt-8 border border-border bg-muted/50 px-6 py-5 text-sm leading-7 text-foreground">
          <strong className="font-semibold uppercase tracking-[0.16em]">{copy.approvedLabel}{version ? ` · version ${version}` : ""}</strong><p className="mt-2 text-muted-foreground">{copy.effectiveMessage}</p>
        </div>
        <div className="mt-12 space-y-10">
          {page.sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <h2 className="soso-display text-2xl text-foreground md:text-3xl">{section.heading}</h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="mt-4 text-sm leading-8 text-muted-foreground md:text-base">{paragraph}</p>
              ))}
              {section.bullets && (
                <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-8 text-muted-foreground md:text-base">
                  {section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                </ul>
              )}
            </section>
          ))}
        </div>
        {(location.startsWith("/policies/") ? location.slice("/policies/".length) : location.replace(/^\//, "")) === "privacy" && <PrivacyRequestForm copy={copy.privacyRequest} />}
      </div>
    </section>
  );
}

function PrivacyRequestForm({ copy }: { copy: PlatformContent["pages"]["policies"]["privacyRequest"] }) {
  const createPrivacyRequest = useCreatePrivacyRequest();
  const [requestType, setRequestType] = useState<"access" | "deletion">("access");
  const [requesterName, setRequesterName] = useState("");
  const [requesterEmail, setRequesterEmail] = useState("");
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = requesterEmail.trim();
    const name = requesterName.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(copy.invalidEmailMessage);
      return;
    }

    setError("");
    try {
      await createPrivacyRequest.mutateAsync({
        data: {
          requestType,
          requesterEmail: email,
          requesterName: name || null,
        },
      });
      setRequesterName("");
      setRequesterEmail("");
      setAccepted(true);
    } catch {
       setError(copy.submitError);
    }
  };

  return (
    <section className="mt-12 border-t border-border pt-10" aria-labelledby="privacy-request-heading">
      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">{copy.eyebrow}</p>
      <h2 id="privacy-request-heading" className="soso-display mt-4 text-2xl text-foreground md:text-3xl">
         {copy.title}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
         {copy.body}
      </p>

      {accepted ? (
        <div className="mt-6 border border-border bg-muted/50 px-6 py-5 text-sm leading-7 text-foreground" role="status" aria-live="polite">
           <p>{copy.acceptedMessage}</p>
          <button
            type="button"
            onClick={() => setAccepted(false)}
            className="mt-4 min-h-11 border border-foreground/30 px-4 text-xs font-semibold uppercase tracking-[0.14em] text-foreground hover:bg-muted"
          >
             {copy.anotherLabel}
          </button>
        </div>
      ) : (
        <form className="mt-6 max-w-2xl space-y-5" noValidate onSubmit={(event) => void submit(event)}>
          <div>
             <label htmlFor="privacy-request-type" className="block text-sm font-medium text-foreground">{copy.requestTypeLabel}</label>
            <select
              id="privacy-request-type"
              value={requestType}
              onChange={(event) => setRequestType(event.target.value as "access" | "deletion")}
              className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm text-foreground"
            >
               <option value="access" className="text-foreground">{copy.accessLabel}</option>
               <option value="deletion" className="text-foreground">{copy.deletionLabel}</option>
            </select>
          </div>
          <div>
             <label htmlFor="privacy-request-email" className="block text-sm font-medium text-foreground">{copy.emailLabel}</label>
            <input
              id="privacy-request-email"
              type="email"
              autoComplete="email"
              value={requesterEmail}
              onChange={(event) => setRequesterEmail(event.target.value)}
              aria-describedby={error ? "privacy-request-error" : undefined}
              aria-invalid={Boolean(error)}
              className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm text-foreground"
              required
            />
          </div>
          <div>
             <label htmlFor="privacy-request-name" className="block text-sm font-medium text-foreground">{copy.nameLabel} <span className="text-muted-foreground">({copy.optionalLabel})</span></label>
            <input
              id="privacy-request-name"
              type="text"
              autoComplete="name"
              maxLength={120}
              value={requesterName}
              onChange={(event) => setRequesterName(event.target.value)}
              className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm text-foreground"
            />
          </div>
          {error && <p id="privacy-request-error" role="alert" className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={createPrivacyRequest.isPending}
            className="min-h-11 bg-foreground px-5 text-xs font-semibold uppercase tracking-[0.14em] text-background transition hover:bg-foreground/85 disabled:cursor-not-allowed disabled:opacity-60"
          >
             {createPrivacyRequest.isPending ? copy.submittingLabel : copy.submitLabel}
          </button>
        </form>
      )}
    </section>
  );
}