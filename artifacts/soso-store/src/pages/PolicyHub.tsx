import { Link } from "wouter";
import { Seo } from "@/components/Seo";
import { policiesApproved } from "@/lib/seo";

const policyLinks = [
  {
    href: "/privacy",
    title: "Privacy & cookie notice",
    description: "How SOSO handles personal information, necessary browser storage and optional measurement.",
  },
  {
    href: "/terms",
    title: "Terms of purchase",
    description: "The made-to-order journey, sizing, payment and atelier confirmation.",
  },
  {
    href: "/delivery-returns",
    title: "Delivery, returns & refunds",
    description: "Delivery support, cancellations, alterations, returns and refund guidance.",
  },
  {
    href: "/care",
    title: "Garment care",
    description: "Practical guidance for looking after a SOSO piece.",
  },
] as const;

export default function PolicyHub() {
  return (
    <section className="min-h-[70vh] px-6 py-20 md:px-12 md:py-28">
      <Seo
        title="Policies & support | SOSO Africa"
        description="SOSO Africa’s customer policy and garment care drafts."
        path="/policies"
        noIndex={!policiesApproved}
      />
      <div className="mx-auto max-w-4xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#b8912f]">
          Customer information
        </p>
        <h1 className="soso-display mt-5 text-4xl leading-tight md:text-6xl">Policies & support</h1>
        <p className="mt-7 max-w-2xl text-base leading-8 text-[#d8ceb9] md:text-lg">
          Clear, consolidated information for a made-to-order SOSO purchase.
        </p>
        <div className="mt-8 border border-[#b8912f]/50 bg-[#b8912f]/10 px-6 py-5 text-sm leading-7 text-[#f6f1e7]">
          <strong className="font-semibold uppercase tracking-[0.16em] text-[#d4b45a]">Working drafts — not effective</strong>
          <p className="mt-2">These documents are being prepared for SOSO’s legal and business review. They must be approved and completed before SOSO relies on them as final notices or binding policies.</p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {policyLinks.map((policy) => (
            <Link
              key={policy.href}
              href={policy.href}
              className="group border border-[#b8912f]/30 bg-[#17130e] p-6 transition hover:border-[#b8912f]/70 hover:bg-[#1d1811]"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#b8912f]">Read draft</p>
              <h2 className="soso-display mt-4 text-2xl text-foreground">{policy.title}</h2>
              <p className="mt-3 text-sm leading-7 text-[#d8ceb9]">{policy.description}</p>
              <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-[#d4b45a]">Open document →</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}