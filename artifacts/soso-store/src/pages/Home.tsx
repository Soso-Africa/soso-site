import React, { useState } from "react";
import { Link } from "wouter";
import { products } from "@/data/products";
import { Reveal } from "@/components/Reveal";
import { WhatsAppIcon } from "@/components/Icons";
import { naira } from "@/lib/utils";
import { Seo } from "@/components/Seo";
import { StylistEnquiryDialog } from "@/components/StylistEnquiryDialog";
import { indexingEnabled } from "@/lib/seo";

export default function Home() {
  const [stylistOpen, setStylistOpen] = useState(false);

  return (
    <div className="flex flex-col">
      <Seo
        title="SOSO Africa | Premium Nigerian Menswear"
        description="Discover SOSO Africa's premium kaftans, agbadas, dashikis and shirts. Explore the collection, sizing help and a considered purchase journey."
        noIndex={!indexingEnabled}
      />
      {/* 1. HERO */}
      <section className="relative overflow-hidden" style={{ minHeight: "calc(100dvh - 104px)" }}>
        <div className="absolute inset-0">
          <img src="/images/soso/vault-black.jpg" alt="" className="w-full h-full object-cover object-top" style={{ opacity: 0.55 }} />
          <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, hsl(var(--background)) 8%, rgba(16,14,11,0.55) 55%, rgba(16,14,11,0.2) 100%)` }} />
          <div className="absolute inset-x-0 bottom-0 h-40" style={{ background: `linear-gradient(180deg, transparent, hsl(var(--background)))` }} />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12 flex flex-col justify-center" style={{ minHeight: "calc(100dvh - 104px)" }}>
          <Reveal>
            <p className="text-[12px] tracking-[0.35em] uppercase mb-6" style={{ color: "hsl(var(--primary))" }}>
              Bespoke Menswear &middot; Abuja, Nigeria
            </p>
          </Reveal>
          <Reveal delay={120}>
            <h1 className="soso-display font-light leading-[1.02] max-w-3xl text-white" style={{ fontSize: "clamp(2.6rem, 6vw, 5.2rem)" }}>
              Dress like the man
              <br />
              they <em style={{ color: "hsl(var(--primary))", fontStyle: "italic" }}>make way</em> for.
            </h1>
          </Reveal>
          <Reveal delay={240}>
            <p className="mt-6 max-w-xl text-[15px] leading-relaxed" style={{ color: "hsl(var(--secondary))" }}>
              Premium kaftans, agbadas and refined separates from SOSO Africa. Explore the collection,
              use the size guide, or speak with a stylist before you place your order.
            </p>
          </Reveal>
          <Reveal delay={360}>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link href="/shop" className="soso-btn-gold text-[13px] tracking-[0.15em] uppercase px-8 py-4 font-bold" style={{ backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}>
                Shop the Collection
              </Link>
              <button
                type="button"
                onClick={() => setStylistOpen(true)}
                className="soso-btn-ghost flex items-center gap-2.5 text-[13px] tracking-[0.15em] uppercase px-8 py-4 font-semibold"
                style={{ border: `1px solid rgba(246,241,231,0.35)` }}
              >
                <WhatsAppIcon size={17} /> Ask a stylist
              </button>
            </div>
          </Reveal>
          <Reveal delay={480}>
            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 text-[12px] tracking-[0.08em]" style={{ color: "hsl(var(--secondary))" }}>
              <span>Size guidance before you buy</span>
              <span>Atelier details confirmed after payment</span>
              <span>Stylist support for considered purchases</span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 2. Trust strip */}
      <section style={{ borderTop: `1px solid rgba(184,145,47,0.25)`, borderBottom: `1px solid rgba(184,145,47,0.25)` }}>
        <div className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 divide-x" style={{ borderColor: "rgba(184,145,47,0.15)" }}>
          {[
            ["Delivery guidance", "Options are confirmed for your location"],
            ["Sizing support", "Use the guide or speak with a stylist"],
            ["Made-to-measure", "Choose Custom for a fitting conversation"],
            ["Thoughtful checkout", "Pay first, then the atelier confirms making details"],
          ].map(([t, s], i) => (
            <div key={i} className="px-6 py-6 text-center" style={{ borderColor: "rgba(184,145,47,0.15)" }}>
              <p className="text-[13px] font-semibold tracking-wide" style={{ color: "hsl(var(--primary))" }}>{t}</p>
              <p className="text-[12px] mt-1" style={{ color: "hsl(var(--secondary))" }}>{s}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Featured collection */}
      <section className="max-w-7xl mx-auto px-6 lg:px-12 py-24">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-4 mb-12">
            <div>
              <p className="text-[11px] tracking-[0.3em] uppercase mb-3" style={{ color: "hsl(var(--primary))" }}>The Collection</p>
              <h2 className="soso-display font-light text-white" style={{ fontSize: "clamp(2rem,4vw,3.2rem)" }}>Built for the occasion.<br />Cut for you.</h2>
            </div>
            <Link href="/shop" className="soso-link text-[12px] tracking-[0.2em] uppercase pb-1" style={{ color: "hsl(var(--primary))", borderBottom: `1px solid hsl(var(--primary))` }}>
              View all pieces
            </Link>
          </div>
        </Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-14">
          {products.map((p, i) => (
            <Reveal key={p.name} delay={(i % 3) * 120}>
              <Link href={`/product/${p.slug}`} className="soso-card group block cursor-pointer">
                <div className="relative overflow-hidden" style={{ aspectRatio: "3/4", backgroundColor: "#1a1712" }}>
                  <img src={p.img} alt={p.name} className="w-full h-full object-cover object-top" />
                  <span className="absolute top-4 left-4 text-[10px] tracking-[0.2em] uppercase px-3 py-1.5 font-semibold" style={{ backgroundColor: "rgba(16,14,11,0.85)", color: "hsl(var(--primary))", border: `1px solid rgba(184,145,47,0.4)` }}>
                    {p.tag}
                  </span>
                  <div className="soso-cta-row absolute inset-x-4 bottom-4 flex gap-2">
                    <div className="soso-btn-gold flex-1 flex items-center justify-center text-[11px] tracking-[0.15em] uppercase py-3 font-bold" style={{ backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}>
                      View Details
                    </div>
                  </div>
                </div>
                <div className="mt-5 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="soso-display text-[19px] text-white">{p.name}</h3>
                    <p className="text-[12px] mt-1" style={{ color: "hsl(var(--secondary))" }}>{p.note}</p>
                  </div>
                  <p className="text-[15px] font-semibold whitespace-nowrap" style={{ color: "hsl(var(--primary))" }}>{naira(p.price)}</p>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* 4. Occasion selector */}
      <section className="py-20" style={{ backgroundColor: "#161310" }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <Reveal>
            <p className="text-[11px] tracking-[0.3em] uppercase mb-3" style={{ color: "hsl(var(--primary))" }}>Shop by occasion</p>
            <h2 className="soso-display font-light mb-12 text-white" style={{ fontSize: "clamp(1.8rem,3.5vw,2.8rem)" }}>Where will they see you next?</h2>
          </Reveal>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              ["The Wedding", "Agbadas & grand kaftans", "/images/soso/agbada.jpg"],
              ["The Boardroom", "Shirts & sharp two-pieces", "/images/soso/shirts.jpg"],
              ["Sunday Service", "Ivory & ceremonial kaftans", "/images/soso/kaftan-white.jpg"],
              ["The Owambe", "Statement dashikis & sets", "/images/soso/twopiece.jpg"],
            ].map(([t, s, img], i) => (
              <Reveal key={t} delay={i * 100}>
                <Link href="/shop" className="soso-card group block relative overflow-hidden" style={{ aspectRatio: "3/4" }}>
                  <img src={img} alt={t} className="w-full h-full object-cover object-top" />
                  <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, transparent 40%, rgba(16,14,11,0.92))" }} />
                  <div className="absolute inset-x-0 bottom-0 p-5">
                    <p className="soso-display text-[20px] text-white">{t}</p>
                    <p className="text-[12px] mt-1" style={{ color: "hsl(var(--secondary))" }}>{s}</p>
                    <p className="text-[11px] tracking-[0.2em] uppercase mt-3" style={{ color: "hsl(var(--primary))" }}>Shop the look →</p>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Fit confidence */}
      <section className="max-w-7xl mx-auto px-6 lg:px-12 py-24 grid lg:grid-cols-2 gap-14 items-center">
        <Reveal>
          <div className="relative">
            <img src="/images/soso/kaftan-white.jpg" alt="Ivory kaftan fitting" className="w-full object-cover object-top" style={{ aspectRatio: "4/5" }} />
            <div className="absolute -bottom-6 -right-4 lg:-right-8 px-6 py-5" style={{ backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}>
              <p className="soso-display text-[28px] leading-none">Fit</p>
              <p className="text-[11px] tracking-[0.15em] uppercase mt-1 font-semibold">Guidance before you order</p>
            </div>
          </div>
        </Reveal>
        <div>
          <Reveal>
            <p className="text-[11px] tracking-[0.3em] uppercase mb-3" style={{ color: "hsl(var(--primary))" }}>Fit support</p>
            <h2 className="soso-display font-light mb-8 text-white" style={{ fontSize: "clamp(1.8rem,3.5vw,2.8rem)" }}>
              Buying bespoke online should not be a gamble.
            </h2>
          </Reveal>
          {[
            ["01", "Choose your piece", "Pick from the collection and review the size guidance for the piece you like."],
            ["02", "Use fit support if needed", "A stylist can help you think through sizing, a custom request, or your occasion."],
             ["03", "Pay securely", "Complete payment for the piece you have chosen. Ask a stylist first only if you have a question."],
             ["04", "Atelier follows up", "After payment, the atelier confirms the making details and production next steps."],
          ].map(([n, t, s], i) => (
            <Reveal key={n} delay={i * 110}>
              <div className="flex gap-6 py-5" style={{ borderBottom: "1px solid rgba(184,145,47,0.2)" }}>
                <span className="soso-display text-[15px]" style={{ color: "hsl(var(--primary))" }}>{n}</span>
                <div>
                  <p className="font-semibold text-[15px] text-white">{t}</p>
                  <p className="text-[13px] mt-1 leading-relaxed" style={{ color: "hsl(var(--secondary))" }}>{s}</p>
                </div>
              </div>
            </Reveal>
          ))}
          <Reveal delay={480}>
            <button type="button" onClick={() => setStylistOpen(true)} className="soso-btn-gold inline-flex items-center gap-2.5 mt-8 text-[13px] tracking-[0.15em] uppercase px-8 py-4 font-bold" style={{ backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}>
              <WhatsAppIcon size={17} /> Start Your Fitting
            </button>
          </Reveal>
        </div>
      </section>

      {/* 6. Purchase confidence */}
      <section className="py-24" style={{ backgroundColor: "hsl(var(--foreground))", color: "hsl(var(--primary-foreground))" }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <Reveal>
            <div className="text-center mb-14">
              <p className="text-[11px] tracking-[0.3em] uppercase mb-3" style={{ color: "hsl(var(--primary))" }}>The SOSO way</p>
              <h2 className="soso-display font-light" style={{ fontSize: "clamp(1.8rem,3.5vw,2.8rem)" }}>A premium purchase<br />should feel clear.</h2>
            </div>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              ["Choose with confidence", "Explore a considered collection, then use product-specific sizing support before you add to bag."],
               ["Pay first, atelier follows", "After payment, the atelier confirms your selected size, finish direction and production timing."],
              ["Speak to a person", "A stylist is available for product, fitting and bespoke direction when a product page alone is not enough."],
            ].map(([title, body], i) => (
              <Reveal key={title} delay={i * 130}>
                <div className="h-full flex flex-col p-8" style={{ backgroundColor: "#FFFDF8", border: "1px solid rgba(184,145,47,0.3)" }}>
                  <p className="soso-display text-2xl leading-snug" style={{ color: "#3a352c" }}>{title}</p>
                  <p className="text-[14px] leading-relaxed flex-1 mt-4" style={{ color: "#3a352c" }}>{body}</p>
                  <div className="mt-6 pt-5" style={{ borderTop: "1px solid rgba(184,145,47,0.25)" }}>
                    <p className="text-[12px] mt-0.5 uppercase tracking-wider" style={{ color: "hsl(var(--primary))" }}>Designed for a considered order</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={200}>
            <div className="mt-12 overflow-hidden" style={{ borderTop: "1px solid rgba(184,145,47,0.3)", borderBottom: "1px solid rgba(184,145,47,0.3)" }}>
              <div className="soso-marquee flex whitespace-nowrap py-4 text-[12px] tracking-[0.25em] uppercase" style={{ color: "#8a8272" }}>
                {[0, 1].map((k) => (
                  <span key={k} className="flex">
                    {["Kaftans", "Agbadas", "Dashikis", "Refined tailoring", "Fit guidance", "Stylist support"].map((t) => (
                      <span key={t} className="mx-8 flex items-center gap-8">{t} <span style={{ color: "hsl(var(--primary))" }}>&#9670;</span></span>
                    ))}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 7. Brand story */}
      <section className="relative py-28 overflow-hidden">
        <img src="/images/soso/dashiki.jpg" alt="" className="absolute inset-0 w-full h-full object-cover object-top" style={{ opacity: 0.25 }} />
        <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, hsl(var(--background)), rgba(16,14,11,0.6), hsl(var(--background)))` }} />
        <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
          <Reveal>
            <img src="/images/soso/logo.png" alt="SOSO" className="h-12 mx-auto mb-8" />
            <h2 className="soso-display font-light leading-snug text-white" style={{ fontSize: "clamp(1.6rem,3.2vw,2.6rem)" }}>
              The Architect of the Modern Man.
            </h2>
            <p className="mt-6 text-[15px] leading-relaxed" style={{ color: "hsl(var(--secondary))" }}>
              SOSO approaches menswear with proportion, restraint, and intent. Each piece is considered for
              presence, with sizing support available when you need it. Explore the collection and choose a
              path that feels right for your occasion.
            </p>
            <Link href="/shop" className="soso-link inline-block mt-8 text-[12px] tracking-[0.25em] uppercase pb-1" style={{ color: "hsl(var(--primary))", borderBottom: `1px solid hsl(var(--primary))` }}>
              Discover the house
            </Link>
          </Reveal>
        </div>
      </section>

      {/* 8. Final CTA */}
      <section id="stylist-support" className="py-24" style={{ backgroundColor: "#161310", borderTop: `1px solid rgba(184,145,47,0.25)` }}>
        <div className="max-w-4xl mx-auto px-6 text-center">
          <Reveal>
            <p className="text-[11px] tracking-[0.3em] uppercase mb-4" style={{ color: "hsl(var(--primary))" }}>Ready when you are</p>
            <h2 className="soso-display font-light text-white" style={{ fontSize: "clamp(2rem,4.5vw,3.6rem)" }}>
              Your next event is coming.<br />Your outfit should already be sewing.
            </h2>
            <p className="mt-5 text-[14px]" style={{ color: "hsl(var(--secondary))" }}>
               Tell us what you are dressing for and a SOSO stylist will guide the right next step.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Link href="/shop" className="soso-btn-gold text-[13px] tracking-[0.15em] uppercase px-9 py-4 font-bold" style={{ backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}>
                Shop the Collection
              </Link>
              <button type="button" onClick={() => setStylistOpen(true)} className="soso-btn-ghost flex items-center gap-2.5 text-[13px] tracking-[0.15em] uppercase px-9 py-4 font-semibold text-white" style={{ border: `1px solid rgba(246,241,231,0.35)` }}>
                <WhatsAppIcon size={17} /> Ask a stylist
              </button>
            </div>
            <p className="mt-8 text-[12px]" style={{ color: "hsl(var(--secondary))" }}>
                Payment comes first; the atelier follows up next to confirm making details and available delivery guidance.
            </p>
          </Reveal>
        </div>
      </section>
      <StylistEnquiryDialog isOpen={stylistOpen} onClose={() => setStylistOpen(false)} />
    </div>
  );
}
