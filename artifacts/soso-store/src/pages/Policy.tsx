import { type FormEvent, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { customFetch, useCreatePrivacyRequest } from "@workspace/api-client-react";
import { Seo } from "@/components/Seo";
import { policies, type PolicyDocument } from "@/data/policies";
import { policiesApproved } from "@/lib/seo";

export default function Policy() {
  const [location] = useLocation();
  const fallback = policies[location] ?? policies["/privacy"];
  const [page, setPage] = useState(fallback);
  const [version, setVersion] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const slug = location.replace(/^\//, "");
    void customFetch<PolicyDocument>(`/api/policies/${slug}`)
      .then((published) => {
        if (active) { setPage(published); setVersion(published.version ?? null); }
      })
      .catch(() => { if (active) { setPage(fallback); setVersion(null); } });
    return () => { active = false; };
  }, [location]);

  return (
    <section className="min-h-[70vh] px-6 py-20 md:px-12 md:py-28">
      <Seo
        title={`${page.title} | SOSO Africa`}
        description={page.summary}
        path={location}
        noIndex={!policiesApproved}
      />
      <div className="mx-auto max-w-3xl border-y border-[#b8912f]/30 py-12">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#b8912f]">
          {page.eyebrow ?? "Customer policy · approved version"}
        </p>
        <h1 className="soso-display mt-5 text-4xl leading-tight md:text-6xl">{page.title}</h1>
        <p className="mt-7 max-w-2xl text-base leading-8 text-[#d8ceb9] md:text-lg">
          {page.summary}
        </p>
        <div className="mt-8 border border-[#b8912f]/50 bg-[#b8912f]/10 px-6 py-5 text-sm leading-7 text-[#f6f1e7]">
          {version ? <><strong className="font-semibold uppercase tracking-[0.16em] text-[#d4b45a]">Approved policy · version {version}</strong><p className="mt-2">This is the current effective version approved for publication.</p></> : <><strong className="font-semibold uppercase tracking-[0.16em] text-[#d4b45a]">Working draft — not effective</strong><p className="mt-2">This draft is provided for SOSO’s legal and business review. It must be approved and completed before SOSO relies on it as a final notice or binding policy.</p></>}
        </div>
        <div className="mt-12 space-y-10">
          {page.sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <h2 className="soso-display text-2xl text-foreground md:text-3xl">{section.heading}</h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="mt-4 text-sm leading-8 text-[#d8ceb9] md:text-base">{paragraph}</p>
              ))}
              {section.bullets && (
                <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-8 text-[#d8ceb9] md:text-base">
                  {section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                </ul>
              )}
            </section>
          ))}
        </div>
        {location === "/privacy" && <PrivacyRequestForm />}
      </div>
    </section>
  );
}

function PrivacyRequestForm() {
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
      setError("Enter a valid email address so we can contact you about this request.");
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
      setError("We could not submit your request right now. Please wait a moment and try again.");
    }
  };

  return (
    <section className="mt-12 border-t border-[#b8912f]/30 pt-10" aria-labelledby="privacy-request-heading">
      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#b8912f]">Privacy request</p>
      <h2 id="privacy-request-heading" className="soso-display mt-4 text-2xl text-foreground md:text-3xl">
        Request access or deletion
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-[#d8ceb9] md:text-base">
        Submit an access or deletion request below. We will verify your identity before taking action, to help protect personal information.
      </p>

      {accepted ? (
        <div className="mt-6 border border-[#b8912f]/50 bg-[#b8912f]/10 px-6 py-5 text-sm leading-7 text-[#f6f1e7]" role="status" aria-live="polite">
          <p>Your request has been received for review. We will contact you to verify your identity before processing it.</p>
          <button
            type="button"
            onClick={() => setAccepted(false)}
            className="mt-4 min-h-11 border border-[#b8912f]/60 px-4 text-xs font-semibold uppercase tracking-[0.14em] text-[#f6f1e7] hover:bg-[#b8912f]/10"
          >
            Submit another request
          </button>
        </div>
      ) : (
        <form className="mt-6 max-w-2xl space-y-5" noValidate onSubmit={(event) => void submit(event)}>
          <div>
            <label htmlFor="privacy-request-type" className="block text-sm font-medium text-[#f6f1e7]">Request type</label>
            <select
              id="privacy-request-type"
              value={requestType}
              onChange={(event) => setRequestType(event.target.value as "access" | "deletion")}
              className="mt-2 min-h-11 w-full border border-[#b8912f]/50 bg-transparent px-3 text-sm text-[#f6f1e7]"
            >
              <option value="access" className="text-foreground">Access my personal data</option>
              <option value="deletion" className="text-foreground">Delete my personal data</option>
            </select>
          </div>
          <div>
            <label htmlFor="privacy-request-email" className="block text-sm font-medium text-[#f6f1e7]">Email address</label>
            <input
              id="privacy-request-email"
              type="email"
              autoComplete="email"
              value={requesterEmail}
              onChange={(event) => setRequesterEmail(event.target.value)}
              aria-describedby={error ? "privacy-request-error" : undefined}
              aria-invalid={Boolean(error)}
              className="mt-2 min-h-11 w-full border border-[#b8912f]/50 bg-transparent px-3 text-sm text-[#f6f1e7]"
              required
            />
          </div>
          <div>
            <label htmlFor="privacy-request-name" className="block text-sm font-medium text-[#f6f1e7]">Name <span className="text-[#d8ceb9]">(optional)</span></label>
            <input
              id="privacy-request-name"
              type="text"
              autoComplete="name"
              maxLength={120}
              value={requesterName}
              onChange={(event) => setRequesterName(event.target.value)}
              className="mt-2 min-h-11 w-full border border-[#b8912f]/50 bg-transparent px-3 text-sm text-[#f6f1e7]"
            />
          </div>
          {error && <p id="privacy-request-error" role="alert" className="text-sm text-[#f0a7a0]">{error}</p>}
          <button
            type="submit"
            disabled={createPrivacyRequest.isPending}
            className="min-h-11 bg-[#b8912f] px-5 text-xs font-semibold uppercase tracking-[0.14em] text-[#17130d] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {createPrivacyRequest.isPending ? "Submitting request…" : "Submit privacy request"}
          </button>
        </form>
      )}
    </section>
  );
}