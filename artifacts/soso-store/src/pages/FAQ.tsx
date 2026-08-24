<<<<<<< HEAD
import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Seo } from "@/components/Seo";
import { absoluteUrl, indexingEnabled, siteUrl } from "@/lib/seo";
import { faqItems } from "@/data/faq";
import type { FaqItem } from "@/data/faq";
import { customFetch } from "@workspace/api-client-react";
=======
import React, { useState, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Seo } from "@/components/Seo";
import { absoluteUrl, indexingEnabled, siteUrl } from "@/lib/seo";
import { faqItems, faqCategories } from "@/data/faq";
>>>>>>> github/main
import { trackStorefrontEvent } from "@/components/ConsentManager";

export default function FAQ() {
  const [open, setOpen] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("All");
<<<<<<< HEAD
  const [liveItems, setLiveItems] = useState<FaqItem[] | null>(null);

  useEffect(() => {
    let active = true;
    void customFetch<FaqItem[]>("/api/faq")
      .then((items) => { if (active && items.length) setLiveItems(items); })
      .catch(() => { /* the reviewed bundled copy remains visible if the API is unavailable */ });
    return () => { active = false; };
  }, []);

  const items = liveItems ?? faqItems;
  const categories = useMemo(() => [...new Set(items.map((f) => f.category))], [items]);

  const visible =
    activeCategory === "All"
      ? items
      : items.filter((f) => f.category === activeCategory);
=======

  const visible =
    activeCategory === "All"
      ? faqItems
      : faqItems.filter((f) => f.category === activeCategory);
>>>>>>> github/main

  const toggle = (id: string) => {
    const next = open === id ? null : id;
    setOpen(next);
    if (next) {
      trackStorefrontEvent("faq_expanded", { faqId: id });
    }
  };

  const faqSchema =
    siteUrl && indexingEnabled
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
<<<<<<< HEAD
          mainEntity: items.map((item) => ({
=======
          mainEntity: faqItems.map((item) => ({
>>>>>>> github/main
            "@type": "Question",
            name: item.question,
            acceptedAnswer: {
              "@type": "Answer",
              text: item.answer,
            },
          })),
        }
      : null;

  return (
    <div className="min-h-screen bg-background fade-in">
      <Seo
        title="Frequently Asked Questions | SOSO Africa"
        description="Answers to common questions about ordering, sizing, care, delivery, and the SOSO made-to-order process."
        path="/faq"
        structuredData={faqSchema}
      />

      <header className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-14 text-center border-b border-border/50 mb-12">
        <p className="text-xs uppercase tracking-[0.3em] text-primary mb-4">Support</p>
        <h1 className="text-4xl md:text-5xl soso-display text-foreground mb-6 tracking-tight">
          Frequently Asked Questions
        </h1>
        <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">
          Common questions about the SOSO ordering process, sizing, care, and delivery.
          Can't find an answer? Ask a stylist directly.
        </p>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        {/* Category filter */}
        <div className="flex flex-wrap gap-2 mb-10">
<<<<<<< HEAD
          {["All", ...categories].map((cat) => (
=======
          {["All", ...faqCategories].map((cat) => (
>>>>>>> github/main
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`text-[11px] uppercase tracking-[0.2em] px-4 py-2 border transition-colors ${
                activeCategory === cat
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* FAQ accordion */}
        <div className="divide-y divide-border/60" role="list" aria-label="Frequently asked questions">
          {visible.map((item) => {
            const isOpen = open === item.id;
            return (
              <div key={item.id} role="listitem">
                <button
                  type="button"
                  onClick={() => toggle(item.id)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${item.id}`}
                  className="w-full flex items-start justify-between gap-4 py-6 text-left group"
                >
                  <div>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-primary block mb-1">
                      {item.category}
                    </span>
                    <span className="text-base md:text-lg text-foreground group-hover:text-primary transition-colors leading-snug">
                      {item.question}
                    </span>
                  </div>
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4 shrink-0 text-primary mt-1" />
                  ) : (
                    <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors mt-1" />
                  )}
                </button>
                {isOpen && (
                  <div
                    id={`faq-answer-${item.id}`}
                    className="pb-6 text-muted-foreground leading-relaxed text-sm md:text-base"
                  >
                    {item.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Still need help */}
        <div className="mt-16 pt-10 border-t border-border/50 text-center">
          <p className="text-muted-foreground mb-6 text-sm leading-relaxed">
            Didn't find your answer? The SOSO team is happy to help — no account required.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <a
              href="/shop"
              className="text-xs font-semibold uppercase tracking-[0.2em] px-6 py-3 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Browse the collection
            </a>
            <a
              href="/policies"
              className="text-xs font-semibold uppercase tracking-[0.2em] px-6 py-3 border border-border text-foreground hover:border-primary/60 transition-colors"
            >
              View policies
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
