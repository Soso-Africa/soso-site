import React, { useState } from "react";
import { Link } from "wouter";
import { Seo } from "@/components/Seo";
import { StylistEnquiryDialog } from "@/components/StylistEnquiryDialog";
import { catalogApproved } from "@/lib/seo";

export default function About() {
  const [stylistOpen, setStylistOpen] = useState(false);
  return (
    <div className="min-h-screen bg-background fade-in">
      <Seo
        title="About SOSO Africa | Bespoke Menswear, Abuja"
        description="SOSO Africa is a bespoke menswear house based in Abuja, Nigeria, specialising in kaftans, agbadas, dashikis, and shirting made to order for the individual."
        path="/about"
      />

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-primary mb-6">The House</p>
        <h1 className="text-5xl md:text-6xl lg:text-7xl soso-display text-foreground leading-[1.05] mb-8 tracking-tight">
          SOSO Africa
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed font-serif italic">
          A bespoke menswear house, based in Abuja. Every garment is made for the person who orders it.
        </p>
      </section>

      <div className="w-full border-t border-border/40" />

      {/* What we do */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid md:grid-cols-2 gap-16">
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-primary mb-6">What We Make</h2>
            <p className="text-foreground/90 leading-relaxed mb-4">
              SOSO specialises in considered menswear for significant occasions and everyday presence — kaftans, agbadas, dashikis, two-piece sets, and refined shirts.
            </p>
            <p className="text-foreground/90 leading-relaxed">
              Every piece is made to order. Nothing in the collection is taken from a production rack. When you order from SOSO, your garment is made for you.
            </p>
          </div>
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-primary mb-6">How It Works</h2>
            <ol className="space-y-4 text-foreground/90 leading-relaxed">
              {[
                "Browse the collection and select a piece.",
                "Choose a standard size or opt for Custom.",
                "Ask a SOSO stylist a question at any point — optional.",
                "Pay securely.",
                "The atelier contacts you to confirm making details.",
                "Your garment is made and fulfilled.",
              ].map((step, i) => (
                <li key={step} className="flex items-start gap-3">
                  <span className="text-primary font-serif text-lg leading-none mt-0.5">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <div className="w-full border-t border-border/40" />

      {/* Abuja + craft */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <h2 className="text-xs uppercase tracking-[0.3em] text-primary mb-8">Abuja, Nigeria</h2>
        <div className="grid md:grid-cols-2 gap-12">
          <div>
            <p className="text-foreground/90 leading-relaxed mb-4">
              SOSO is rooted in Abuja and in the broader tradition of West African menswear. The silhouettes, occasions, and cultural contexts that shape each piece are drawn from the world the wearer actually inhabits.
            </p>
            <p className="text-foreground/90 leading-relaxed">
              The house makes garments for owambes, board meetings, weddings, and the days between them — without reducing any occasion to a category.
            </p>
          </div>
          <div>
            <p className="text-foreground/90 leading-relaxed mb-4">
              Sizing guidance and stylist support are part of the service — not an afterthought. You can ask a question at any point in the process, without creating an account or committing to a purchase.
            </p>
            <p className="text-foreground/90 leading-relaxed">
              The Journal explores the ideas and contexts behind the collection — craft, occasion dressing, and the continuing narrative of African luxury menswear.
            </p>
          </div>
        </div>
      </section>

      <div className="w-full border-t border-border/40" />

      {/* CTAs */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20 flex flex-col sm:flex-row gap-6 items-start sm:items-center">
        <Link
          href="/shop"
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] px-8 py-4 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Explore the collection
        </Link>
        <Link
          href="/journal"
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] px-8 py-4 border border-primary/40 text-foreground hover:border-primary transition-colors"
        >
          Read the Journal
        </Link>
        {!catalogApproved && (
          <>
            <button
              type="button"
              onClick={() => setStylistOpen(true)}
              className="text-xs font-semibold uppercase tracking-[0.2em] text-primary hover:text-primary/70 transition-colors"
            >
              Ask a stylist
            </button>
            <StylistEnquiryDialog isOpen={stylistOpen} onClose={() => setStylistOpen(false)} />
          </>
        )}
      </section>
    </div>
  );
}
