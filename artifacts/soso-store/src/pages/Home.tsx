import React, { useState } from "react";
import { Link } from "wouter";
import { Reveal } from "@/components/Reveal";
import { WhatsAppIcon } from "@/components/Icons";
import { naira } from "@/lib/utils";
import { Seo } from "@/components/Seo";
import { StylistEnquiryDialog } from "@/components/StylistEnquiryDialog";
import { indexingEnabled } from "@/lib/seo";
import { PlatformContentState, usePlatformContent } from "@/data/platformContent";

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
    <section className="relative overflow-hidden" style={{ minHeight: "calc(100dvh - 104px)" }}>
      <div className="absolute inset-0">
        <img src={homepage.hero.imageUrl} alt={homepage.hero.imageAlt} className="w-full h-full object-cover object-top opacity-55" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-background/20" />
      </div>
      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12 flex flex-col justify-center" style={{ minHeight: "calc(100dvh - 104px)" }}>
        <Reveal><p className="text-[12px] tracking-[0.35em] uppercase mb-6 text-primary">{homepage.hero.eyebrow}</p></Reveal>
        <Reveal delay={120}><h1 className="soso-display font-light leading-[1.02] max-w-3xl text-white" style={{ fontSize: "clamp(2.6rem, 6vw, 5.2rem)" }}>
          {homepage.hero.title}<br />{homepage.hero.suffix} <em className="text-primary">{homepage.hero.accent}</em>
        </h1></Reveal>
        <Reveal delay={240}><p className="mt-6 max-w-xl text-[15px] leading-relaxed text-secondary">{homepage.hero.description}</p></Reveal>
        <Reveal delay={360}><div className="mt-9 flex flex-wrap gap-4">
          <Link href={homepage.hero.primaryCta.href} className="soso-btn-gold px-8 py-4 text-[13px] font-bold uppercase tracking-[0.15em]">{homepage.hero.primaryCta.label}</Link>
          <button type="button" onClick={() => setStylistOpen(true)} className="soso-btn-ghost flex items-center gap-2.5 px-8 py-4 text-[13px] font-semibold uppercase tracking-[0.15em]"><WhatsAppIcon size={17} />{homepage.hero.stylistCtaLabel}</button>
        </div></Reveal>
        <div className="mt-10 flex flex-wrap gap-6 text-xs text-secondary">{homepage.hero.assurances.map((item) => <span key={item}>{item}</span>)}</div>
      </div>
    </section>

    <section className="border-y border-primary/25"><div className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 divide-x divide-primary/15">
      {homepage.trustItems.map((item) => <div key={item.title} className="px-6 py-6 text-center"><p className="text-[13px] font-semibold text-primary">{item.title}</p><p className="text-[12px] mt-1 text-secondary">{item.body}</p></div>)}
    </div></section>

    <section className="max-w-7xl mx-auto px-6 lg:px-12 py-24">
      <Reveal><div className="flex flex-wrap items-end justify-between gap-4 mb-12"><div>
        <p className="text-[11px] tracking-[0.3em] uppercase mb-3 text-primary">{homepage.featured.eyebrow}</p>
        <h2 className="soso-display font-light text-white whitespace-pre-line" style={{ fontSize: "clamp(2rem,4vw,3.2rem)" }}>{homepage.featured.title}</h2>
      </div><Link href={homepage.featured.link.href} className="soso-link text-xs uppercase tracking-[0.2em] text-primary">{homepage.featured.link.label}</Link></div></Reveal>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-14">{featured.map((product, index) =>
        <Reveal key={product.slug} delay={(index % 3) * 120}><Link href={`/product/${product.slug}`} className="soso-card group block">
          <div className="relative overflow-hidden aspect-[3/4] bg-[#1a1712]"><img src={product.img} alt={product.name} className="w-full h-full object-cover object-top" /><span className="absolute top-4 left-4 bg-background/85 px-3 py-1.5 text-[10px] uppercase tracking-[.2em] text-primary">{product.tag}</span></div>
          <div className="mt-5 flex justify-between gap-4"><div><h3 className="soso-display text-[19px] text-white">{product.name}</h3><p className="text-xs mt-1 text-secondary">{product.note}</p></div><p className="text-[15px] font-semibold text-primary">{naira(product.price)}</p></div>
        </Link></Reveal>)}</div>
    </section>

    <section className="py-20 bg-[#161310]"><div className="max-w-7xl mx-auto px-6 lg:px-12">
      <p className="text-[11px] tracking-[.3em] uppercase text-primary">{homepage.occasions.eyebrow}</p>
      <h2 className="soso-display text-4xl my-4 text-white">{homepage.occasions.title}</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{homepage.occasions.items.map((item) =>
        <Link key={item.title} href={item.href ?? "/shop"} className="group relative block overflow-hidden aspect-[3/4]">
          {item.imageUrl && <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" /><div className="absolute bottom-0 p-5"><h3 className="soso-display text-xl">{item.title}</h3><p className="text-xs text-secondary">{item.body}</p><p className="mt-3 text-xs uppercase text-primary">{item.linkLabel}</p></div>
        </Link>)}</div>
    </div></section>

    <section className="max-w-7xl mx-auto px-6 lg:px-12 py-24 grid lg:grid-cols-2 gap-14 items-center">
      <img src={homepage.fit.imageUrl} alt={homepage.fit.imageAlt} className="w-full aspect-[4/5] object-cover" />
      <div><p className="text-xs uppercase tracking-[.3em] text-primary">{homepage.fit.eyebrow}</p><h2 className="soso-display text-4xl my-6">{homepage.fit.title}</h2>
        {homepage.fit.steps.map((step, index) => <div key={step.title} className="flex gap-5 py-5 border-b border-primary/20"><span className="text-primary">{String(index + 1).padStart(2, "0")}</span><div><h3 className="font-semibold">{step.title}</h3><p className="text-sm text-secondary">{step.body}</p></div></div>)}
        <button type="button" onClick={() => setStylistOpen(true)} className="soso-btn-gold mt-8 px-8 py-4 text-xs uppercase"><WhatsAppIcon size={17} className="inline mr-2" />{homepage.fit.ctaLabel}</button>
      </div>
    </section>

    <section className="py-24 bg-foreground text-primary-foreground"><div className="max-w-7xl mx-auto px-6 lg:px-12 text-center">
      <p className="text-xs uppercase tracking-[.3em] text-primary">{homepage.confidence.eyebrow}</p><h2 className="soso-display text-4xl my-5 whitespace-pre-line">{homepage.confidence.title}</h2>
      <div className="grid md:grid-cols-3 gap-6 text-left">{homepage.confidence.items.map((item) => <article key={item.title} className="bg-[#fffdf8] p-8 text-[#3a352c]"><h3 className="soso-display text-2xl">{item.title}</h3><p className="mt-4 text-sm">{item.body}</p></article>)}</div>
    </div></section>

    <section className="relative py-28 overflow-hidden text-center"><img src={homepage.story.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-25" /><div className="relative max-w-3xl mx-auto px-6">
      <img src={homepage.story.logoUrl} alt="" className="h-12 mx-auto mb-8" /><h2 className="soso-display text-4xl">{homepage.story.title}</h2><p className="mt-6 text-secondary">{homepage.story.body}</p><Link href={homepage.story.link.href} className="inline-block mt-8 text-xs uppercase tracking-[.25em] text-primary">{homepage.story.link.label}</Link>
    </div></section>

    <section className="py-24 bg-[#161310] border-t border-primary/25 text-center"><div className="max-w-4xl mx-auto px-6">
      <p className="text-xs uppercase tracking-[.3em] text-primary">{homepage.finalCta.eyebrow}</p><h2 className="soso-display text-5xl my-5 whitespace-pre-line">{homepage.finalCta.title}</h2><p className="text-secondary">{homepage.finalCta.body}</p>
      <div className="mt-10 flex justify-center gap-4"><Link href={homepage.finalCta.primaryCta.href} className="soso-btn-gold px-9 py-4 text-xs uppercase">{homepage.finalCta.primaryCta.label}</Link><button onClick={() => setStylistOpen(true)} className="soso-btn-ghost px-9 py-4 text-xs uppercase">{homepage.finalCta.stylistCtaLabel}</button></div><p className="mt-8 text-xs text-secondary">{homepage.finalCta.note}</p>
    </div></section>
    <StylistEnquiryDialog isOpen={stylistOpen} onClose={() => setStylistOpen(false)} />
  </div>;
}