import React, { useState } from "react";
import { Link } from "wouter";
import { Reveal } from "@/components/Reveal";
import { Seo } from "@/components/Seo";
import { StylistEnquiryDialog } from "@/components/StylistEnquiryDialog";
import { indexingEnabled } from "@/lib/seo";
import { PlatformContentState, usePlatformContent } from "@/data/platformContent";
import { ProductCard } from "@/components/ProductCard";
import { HomeHeroMedia } from "@/components/HomeHeroMedia";

export default function Home() {
  const [stylistOpen, setStylistOpen] = useState(false);
  const platform = usePlatformContent();
  const platformStateCopy = platform.data?.content.site.platformState;
  if (!platform.data) return <PlatformContentState loading={platform.isLoading} error={platform.isError} copy={platformStateCopy} />;
  const { homepage, products } = platform.data.content;
  const featured = homepage.featured.productSlugs
    .map((slug) => products.find((product) => product.slug === slug))
    .filter((product): product is NonNullable<typeof product> => Boolean(product));

  return <div className="flex flex-col">
    <Seo title={homepage.seo.title} description={homepage.seo.description} noIndex={!indexingEnabled} />
    <section className="relative flex h-[85svh] min-h-[600px] w-full flex-col justify-start overflow-hidden pt-20 sm:pt-24 lg:justify-end lg:pb-24 lg:pt-0">
      <HomeHeroMedia hero={homepage.hero} />
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent opacity-90" />
        <div className="absolute inset-0 w-full bg-gradient-to-r from-background/70 to-transparent md:w-2/3" />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-7xl px-6 lg:px-12">
        <Reveal><div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <Link
            href={homepage.hero.primaryCta.href}
            className="soso-btn-gold px-8 py-4 text-[12px] font-bold uppercase tracking-[0.15em] bg-foreground text-background"
            data-testid="link-home-hero-primary"
          >
            {homepage.hero.primaryCta.label}
          </Link>
        </div></Reveal>
      </div>
    </section>

    <section className="border-y border-border bg-muted/30"><div className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 divide-x divide-border">
      {homepage.trustItems.map((item) => <div key={item.title} className="px-6 py-6 text-center"><p className="text-[13px] font-semibold text-foreground">{item.title}</p><p className="text-[12px] mt-1 text-secondary">{item.body}</p></div>)}
    </div></section>

    <section className="max-w-7xl mx-auto px-6 lg:px-12 py-24">
      <Reveal><div className="flex flex-wrap items-end justify-between gap-4 mb-12"><div>
        <p className="text-[11px] tracking-[0.3em] uppercase mb-3 text-secondary">{homepage.featured.eyebrow}</p>
        <h2 className="soso-display font-light text-foreground whitespace-pre-line" style={{ fontSize: "clamp(2rem,4vw,3.2rem)" }}>{homepage.featured.title}</h2>
      </div><Link href={homepage.featured.link.href} className="soso-link text-xs uppercase tracking-[0.2em] text-foreground">{homepage.featured.link.label}</Link></div></Reveal>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-14">{featured.map((product, index) =>
        <Reveal key={product.slug} delay={(index % 3) * 120}>
          <ProductCard product={product} testIdPrefix="home-featured" />
        </Reveal>)}</div>
    </section>

    <section className="py-20 bg-muted/20"><div className="max-w-7xl mx-auto px-6 lg:px-12">
      <p className="text-[11px] tracking-[.3em] uppercase text-secondary">{homepage.occasions.eyebrow}</p>
      <h2 className="soso-display text-4xl my-4 text-foreground">{homepage.occasions.title}</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{homepage.occasions.items.map((item) =>
        <Link key={item.title} href={item.href ?? "/shop"} className="group relative block overflow-hidden aspect-[3/4]">
          {item.imageUrl && <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" /><div className="absolute bottom-0 p-5 text-white"><h3 className="soso-display text-xl">{item.title}</h3><p className="text-xs text-white/80">{item.body}</p><p className="mt-3 text-xs uppercase text-white font-medium">{item.linkLabel}</p></div>
        </Link>)}</div>
    </div></section>

    <section className="max-w-7xl mx-auto px-6 lg:px-12 py-24 grid lg:grid-cols-2 gap-14 items-center">
      <img src={homepage.fit.imageUrl} alt={homepage.fit.imageAlt} className="w-full aspect-[4/5] object-cover" />
      <div><p className="text-xs uppercase tracking-[.3em] text-secondary">{homepage.fit.eyebrow}</p><h2 className="soso-display text-4xl my-6 text-foreground">{homepage.fit.title}</h2>
        {homepage.fit.steps.map((step, index) => <div key={step.title} className="flex gap-5 py-5 border-b border-border"><span className="text-foreground/40 font-bold">{String(index + 1).padStart(2, "0")}</span><div><h3 className="font-semibold text-foreground">{step.title}</h3><p className="text-sm text-secondary">{step.body}</p></div></div>)}
      </div>
    </section>

    <section className="py-24 bg-muted/40 text-foreground"><div className="max-w-7xl mx-auto px-6 lg:px-12 text-center">
      <p className="text-xs uppercase tracking-[.3em] text-secondary">{homepage.confidence.eyebrow}</p><h2 className="soso-display text-4xl my-5 whitespace-pre-line text-foreground">{homepage.confidence.title}</h2>
      <div className="grid md:grid-cols-3 gap-6 text-left">{homepage.confidence.items.map((item) => <article key={item.title} className="bg-background border border-border p-8 text-foreground"><h3 className="soso-display text-2xl">{item.title}</h3><p className="mt-4 text-sm text-secondary">{item.body}</p></article>)}</div>
    </div></section>

    <section className="relative py-28 overflow-hidden text-center"><img src={homepage.story.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-10" /><div className="relative max-w-3xl mx-auto px-6">
      <img src={homepage.story.logoUrl} alt="" className="h-12 mx-auto mb-8 filter invert dark:invert-0" /><h2 className="soso-display text-4xl text-foreground">{homepage.story.title}</h2><p className="mt-6 text-secondary">{homepage.story.body}</p><Link href={homepage.story.link.href} className="inline-block mt-8 text-xs uppercase tracking-[.25em] text-foreground font-medium underline underline-offset-4">{homepage.story.link.label}</Link>
    </div></section>

    <section className="py-24 bg-background border-t border-border text-center"><div className="max-w-4xl mx-auto px-6">
      <p className="text-xs uppercase tracking-[.3em] text-secondary">{homepage.finalCta.eyebrow}</p><h2 className="soso-display text-5xl my-5 whitespace-pre-line text-foreground">{homepage.finalCta.title}</h2><p className="text-secondary">{homepage.finalCta.body}</p>
      <div className="mt-10 flex justify-center gap-4"><Link href={homepage.finalCta.primaryCta.href} className="soso-btn-gold px-9 py-4 text-xs uppercase bg-foreground text-background">{homepage.finalCta.primaryCta.label}</Link><button onClick={() => setStylistOpen(true)} className="soso-btn-ghost px-9 py-4 text-xs uppercase text-foreground border border-border hover:bg-muted">{homepage.finalCta.stylistCtaLabel}</button></div><p className="mt-8 text-xs text-secondary/60">{homepage.finalCta.note}</p>
    </div></section>
    <StylistEnquiryDialog isOpen={stylistOpen} onClose={() => setStylistOpen(false)} />
  </div>;
}