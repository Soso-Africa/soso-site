import { useLocation } from "wouter";
import { Seo } from "@/components/Seo";
import { policies } from "@/data/policies";
import { policiesApproved } from "@/lib/seo";

export default function Policy() {
  const [location] = useLocation();
  const page = policies[location] ?? policies["/privacy"];

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
          {page.eyebrow}
        </p>
        <h1 className="soso-display mt-5 text-4xl leading-tight md:text-6xl">{page.title}</h1>
        <p className="mt-7 max-w-2xl text-base leading-8 text-[#d8ceb9] md:text-lg">
          {page.summary}
        </p>
        <div className="mt-8 border border-[#b8912f]/50 bg-[#b8912f]/10 px-6 py-5 text-sm leading-7 text-[#f6f1e7]">
          <strong className="font-semibold uppercase tracking-[0.16em] text-[#d4b45a]">Working draft — not effective</strong>
          <p className="mt-2">This draft is provided for SOSO’s legal and business review. It must be approved and completed before SOSO relies on it as a final notice or binding policy.</p>
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
      </div>
    </section>
  );
}