import React, { useState } from "react";
import { Link } from "wouter";
import { Seo } from "@/components/Seo";
import { StylistEnquiryDialog } from "@/components/StylistEnquiryDialog";
import { catalogApproved } from "@/lib/seo";
import { PlatformContentState, usePlatformContent } from "@/data/platformContent";

export default function About() {
  const [stylistOpen, setStylistOpen] = useState(false);
  const platform = usePlatformContent();
  const platformStateCopy = platform.data?.content.site.platformState;
  if (!platform.data) return <PlatformContentState loading={platform.isLoading} error={platform.isError} copy={platformStateCopy} />;
  const copy = platform.data.content.pages.about;
  return (
    <div className="min-h-screen bg-background fade-in">
      <Seo
        title={copy.seo.title}
        description={copy.seo.description}
        path="/about"
      />

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-primary mb-6">{copy.hero.eyebrow}</p>
        <h1 className="text-5xl md:text-6xl lg:text-7xl soso-display text-foreground leading-[1.05] mb-8 tracking-tight">
          {copy.hero.title}
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed font-serif italic">
          {copy.hero.body}
        </p>
      </section>

      <div className="w-full border-t border-border/40" />

      {/* What we do */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid md:grid-cols-2 gap-16">
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-primary mb-6">{copy.whatWeMake.heading}</h2>
            {copy.whatWeMake.paragraphs.map((paragraph, index) => (
              <p key={paragraph} className={`text-foreground/90 leading-relaxed ${index < copy.whatWeMake.paragraphs.length - 1 ? "mb-4" : ""}`}>{paragraph}</p>
            ))}
          </div>
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-primary mb-6">{copy.howItWorks.heading}</h2>
            <ol className="space-y-4 text-foreground/90 leading-relaxed">
              {copy.howItWorks.steps.map((step, i) => (
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
        <h2 className="text-xs uppercase tracking-[0.3em] text-primary mb-8">{copy.location.heading}</h2>
        <div className="grid md:grid-cols-2 gap-12">
          {copy.location.columns.map((column, columnIndex) => (
            <div key={columnIndex}>
              {column.map((paragraph, index) => (
                <p key={paragraph} className={`text-foreground/90 leading-relaxed ${index < column.length - 1 ? "mb-4" : ""}`}>{paragraph}</p>
              ))}
            </div>
          ))}
        </div>
      </section>

      <div className="w-full border-t border-border/40" />

      {/* CTAs */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20 flex flex-col sm:flex-row gap-6 items-start sm:items-center">
        <Link
          href={copy.primaryCta.href}
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] px-8 py-4 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {copy.primaryCta.label}
        </Link>
        <Link
          href={copy.secondaryCta.href}
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] px-8 py-4 border border-primary/40 text-foreground hover:border-primary transition-colors"
        >
          {copy.secondaryCta.label}
        </Link>
        {!catalogApproved && (
          <>
            <button
              type="button"
              onClick={() => setStylistOpen(true)}
              className="text-xs font-semibold uppercase tracking-[0.2em] text-primary hover:text-primary/70 transition-colors"
            >
              {copy.stylistCtaLabel}
            </button>
            <StylistEnquiryDialog isOpen={stylistOpen} onClose={() => setStylistOpen(false)} />
          </>
        )}
      </section>
    </div>
  );
}
