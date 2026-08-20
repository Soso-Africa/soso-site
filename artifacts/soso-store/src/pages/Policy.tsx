import { useLocation } from "wouter";
import { Seo } from "@/components/Seo";

const pages = {
  "/privacy": {
    title: "Privacy notice",
    eyebrow: "Privacy",
    summary: "SOSO is preparing its full privacy notice for legal approval.",
  },
  "/cookies": {
    title: "Cookie preferences",
    eyebrow: "Cookie choices",
    summary: "Necessary storage supports the bag and privacy preference. Optional measurement remains off unless you choose it.",
  },
  "/terms": {
    title: "Terms of purchase",
    eyebrow: "Terms",
    summary: "The complete terms for SOSO made-to-order purchases are being finalised for publication.",
  },
  "/delivery": {
    title: "Delivery information",
    eyebrow: "Delivery",
    summary: "Atelier making and delivery timing are confirmed with each order after payment; a fixed delivery promise is not published here.",
  },
  "/returns": {
    title: "Returns and cancellations",
    eyebrow: "Returns",
    summary: "The complete returns, alterations, cancellation and refund position is being finalised for publication.",
  },
} as const;

export default function Policy() {
  const [location] = useLocation();
  const page = pages[location as keyof typeof pages] ?? pages["/privacy"];

  return (
    <section className="min-h-[70vh] px-6 py-20 md:px-12 md:py-28">
      <Seo
        title={`${page.title} | SOSO Africa`}
        description={page.summary}
        path={location}
      />
      <div className="mx-auto max-w-3xl border-y border-[#b8912f]/30 py-12">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#b8912f]">
          {page.eyebrow}
        </p>
        <h1 className="soso-display mt-5 text-4xl leading-tight md:text-6xl">{page.title}</h1>
        <p className="mt-7 max-w-2xl text-base leading-8 text-[#d8ceb9] md:text-lg">
          {page.summary}
        </p>
        <div className="mt-12 border-l border-[#b8912f] bg-[#17130e] px-6 py-5 text-sm leading-7 text-[#d8ceb9]">
          SOSO will publish the approved policy text here before relying on it for an order. This status page does not replace the final legal notice or create terms that have not been approved.
        </div>
      </div>
    </section>
  );
}