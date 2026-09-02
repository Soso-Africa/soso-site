import React, { useState } from "react";
import { Link } from "wouter";
import { Reveal } from "@/components/Reveal";
import { Seo } from "@/components/Seo";
import { StylistEnquiryDialog } from "@/components/StylistEnquiryDialog";
import { indexingEnabled } from "@/lib/seo";
import { PlatformContentState, usePlatformContent } from "@/data/platformContent";
import { ProductCard } from "@/components/ProductCard";
import { HomeHeroMedia } from "@/components/HomeHeroMedia";
import { CategoryFeature } from "@/components/CategoryFeature";
import { HomeJournalPreview } from "@/components/HomeJournalPreview";
import { trackStorefrontEvent } from "@/components/ConsentManager";

const canonicalCategoryTargets = ["/collections/kaftans", "/collections/agbadas", "/collections/shirts", "/collections/dashikis", "/collections/two-piece"];

export default function Home() {
  const [stylistOpen, setStylistOpen] = useState(false);
  const platform = usePlatformContent();
  const platformStateCopy = platform.data?.content.site.platformState;
  if (!platform.data) return <PlatformContentState loading={platform.isLoading} error={platform.isError} copy={platformStateCopy} />;
  const { homepage, products, site } = platform.data.content;
  const configuredFeatured = homepage.featured.productSlugs
    .map((slug) => products.find((product) => product.slug === slug))
    .filter((product): product is (typeof products)[number] => product !== undefined && product.fulfilmentState !== "unavailable");
  const featured = [...configuredFeatured, ...products
    .filter((product) => product.fulfilmentState !== "unavailable")
    .sort((left, right) => Number(right.merchandising.isNew) - Number(left.merchandising.isNew) || left.merchandising.sortPriority - right.merchandising.sortPriority)]
    .filter((product, index, all) => all.findIndex((candidate) => candidate.slug === product.slug) === index)
    .slice(0, 4);
  const campaign = homepage.hero.campaignCta;
  const now = Date.now();
  const heroCta = campaign?.enabled && Date.parse(campaign.startsAt) <= now && now < Date.parse(campaign.endsAt)
    ? campaign
    : homepage.hero.primaryCta;

  return <div className="flex flex-col bg-background">
    <Seo title={homepage.seo.title} description={homepage.seo.description} noIndex={!indexingEnabled} />

    {/* 1. Full-bleed Hero */}
    <section className={`relative flex h-[100svh] min-h-[600px] w-full flex-col justify-end overflow-hidden pb-20 md:pb-28 ${site.announcementItems.length ? "-mt-[106px]" : "-mt-[72px]"}`}>
      <HomeHeroMedia hero={homepage.hero} />
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute inset-0 bg-black/15" />
        <div className="absolute top-0 inset-x-0 h-40 bg-gradient-to-b from-white/40 to-transparent opacity-80" />
        <div className="absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-black/40 to-transparent" />
      </div>
      <div className="relative z-10 mx-auto flex w-full max-w-7xl justify-center px-6 text-center lg:px-12">
        <Link
          href={heroCta.href}
          onClick={() => trackStorefrontEvent("cta_clicked", { placement: "homepage_hero", action: "primary_click", campaign: campaign === heroCta })}
          className="soso-btn-gold inline-flex bg-background px-12 py-5 text-[13px] font-bold uppercase tracking-[0.2em] text-foreground shadow-lg transition-colors hover:bg-foreground hover:text-background"
          data-testid="link-home-hero-primary"
        >
          {heroCta.label}
        </Link>
      </div>
    </section>

    {/* 2. Five alternating category destinations */}
    <div aria-label="Shop SOSO Categories">
      {canonicalCategoryTargets.map((target) => homepage.categories.items.find((item) => item.href === target)).filter((item): item is NonNullable<typeof item> => Boolean(item) && item?.active !== false).map((item, index) => {
        return (
          <CategoryFeature
            key={item.href}
            categoryName={item.title}
            eyebrow={item.eyebrow}
            images={item.imageUrls?.length ? item.imageUrls : [item.imageUrl]}
            mobileImages={item.mobileImageUrls}
            description={item.description}
            imageAlt={item.imageAlt}
            href={item.href}
            isEven={index % 2 === 0}
            testId={`home-category-${index}`}
            desktopCropPosition={item.desktopCropPosition}
            mobileCropPosition={item.mobileCropPosition}
            imageMode={item.imageMode}
            rotationMs={item.rotationMs}
            eager={index === 0}
          />
        );
      })}
    </div>

    {/* 3. New Arrivals product grid */}
    <section
      className="my-16 md:my-32 max-w-[1600px] mx-auto px-4 md:px-6"
      data-testid="home-new-arrival"
      data-merchandising-value={homepage.newArrival.productSlug}
    >
      <div className="mb-10 flex items-end justify-between gap-6">
        <div>
          <p className="mb-3 text-[11px] uppercase tracking-[0.3em] text-secondary">The Collection</p>
          <h2 className="soso-display text-4xl text-foreground md:text-5xl">New Arrivals</h2>
        </div>
        <Link href={homepage.newArrival.link.href} className="text-[11px] font-semibold uppercase tracking-[0.2em] underline underline-offset-8">{homepage.newArrival.link.label}</Link>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {featured.map((product, index) => (
          <div key={product.slug} data-testid={`home-featured-${index}`} data-merchandising-value={product.slug}>
            <Reveal delay={index * 100}>
              <ProductCard product={product} testIdPrefix="home-featured" />
            </Reveal>
          </div>
        ))}
      </div>
    </section>

    {/* 4. Two-column occasion categories */}
    <section className="my-16 px-2 md:my-32" aria-labelledby="home-occasion-heading">
      <div className="mb-10 text-center md:mb-14">
        <p className="mb-3 text-[11px] uppercase tracking-[0.3em] text-secondary">{homepage.occasions.eyebrow}</p>
        <h2 id="home-occasion-heading" className="soso-display text-4xl text-foreground md:text-5xl">{homepage.occasions.title}</h2>
      </div>
      <div className="mx-auto grid max-w-[2000px] gap-2 lg:grid-cols-2">
        {homepage.occasions.items.map((item, index) => (
          <Link key={item.title} href={item.href} className="group relative aspect-[4/5] overflow-hidden sm:aspect-[4/3] lg:aspect-[5/4]" data-testid={`home-occasion-${index}`} data-merchandising-value={item.title}>
            <img src={item.imageUrl} alt={item.imageAlt} className="h-full w-full object-cover transition-transform duration-1000 ease-out group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 z-10 p-8 text-center text-white md:p-12">
              <p className="mb-3 text-[12px] uppercase tracking-[0.2em] text-white/80">{item.body}</p>
              <h3 className="soso-display mb-6 text-3xl md:text-4xl">{item.title}</h3>
              <span className="inline-flex bg-white px-7 py-4 text-[11px] font-bold uppercase tracking-[0.16em] text-foreground transition-colors group-hover:bg-foreground group-hover:text-white">
                {item.linkLabel}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>

    {/* 6. Trust/Guidance Strip */}
    <section className="border-y border-border bg-background">
      <div className="max-w-[1600px] mx-auto grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-border">
        {homepage.trustItems.map((item) => (
          <div key={item.title} className="px-6 py-12 text-center flex flex-col items-center justify-center">
            <p className="text-[13px] tracking-[0.15em] uppercase font-semibold text-foreground mb-3">{item.title}</p>
            <p className="text-[13px] text-secondary max-w-[240px] leading-relaxed">{item.body}</p>
          </div>
        ))}
      </div>
    </section>

    {/* 7. Fit & Details */}
    <section className="max-w-[1600px] mx-auto px-4 md:px-6 py-16 md:py-32 grid lg:grid-cols-2 gap-12 lg:gap-24 items-center">
      <div className="relative aspect-[3/4] overflow-hidden bg-muted/20">
        <img src={homepage.fit.imageUrl} alt={homepage.fit.imageAlt} className="absolute inset-0 w-full h-full object-cover" />
      </div>
      <div className="lg:pr-12 text-center lg:text-left">
        <p className="text-[11px] uppercase tracking-[.3em] text-secondary mb-5">{homepage.fit.eyebrow}</p>
        <h2 className="soso-display text-4xl md:text-5xl lg:text-6xl my-6 text-foreground leading-[1.1]">{homepage.fit.title}</h2>
        <div className="mt-12 flex flex-col text-left">
          {homepage.fit.steps.map((step, index) => (
            <div key={step.title} className="flex gap-6 py-8 border-b border-border last:border-0">
              <span className="text-secondary/30 font-bold soso-display text-3xl mt-1">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3 className="font-semibold text-foreground tracking-[0.1em] uppercase text-[13px] mb-3">{step.title}</h3>
                <p className="text-[14px] text-secondary leading-relaxed">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setStylistOpen(true)} className="mt-8 border border-foreground px-7 py-4 text-[11px] font-bold uppercase tracking-[0.16em] text-foreground hover:bg-foreground hover:text-background">{homepage.fit.ctaLabel}</button>
      </div>
    </section>

    {/* 8. Confidence */}
    <section className="py-24 md:py-32 bg-muted/40 text-foreground">
      <div className="max-w-[1600px] mx-auto px-6 lg:px-12 text-center">
        <p className="text-[11px] uppercase tracking-[.3em] text-secondary mb-4">{homepage.confidence.eyebrow}</p>
        <h2 className="soso-display text-4xl md:text-5xl lg:text-6xl my-6 whitespace-pre-line text-foreground leading-[1.1]">{homepage.confidence.title}</h2>
        <div className="grid md:grid-cols-3 gap-8 text-left mt-16 lg:mt-24">
          {homepage.confidence.items.map((item) => (
            <article key={item.title} className="p-10 border border-border bg-background transition-colors hover:bg-muted/50">
              <h3 className="soso-display text-2xl lg:text-3xl text-foreground mb-5">{item.title}</h3>
              <p className="text-[14px] text-secondary leading-relaxed">{item.body}</p>
            </article>
          ))}
        </div>
        <div className="mt-14 flex flex-wrap justify-center gap-x-6 gap-y-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-secondary">
          {homepage.confidence.marquee.map((item) => <span key={item}>{item}</span>)}
        </div>
      </div>
    </section>

    <HomeJournalPreview />

    {/* 9. Final CTA */}
    <section className="py-24 md:py-40 bg-background text-center">
      <div className="max-w-3xl mx-auto px-6">
        <p className="text-[11px] uppercase tracking-[.3em] text-secondary mb-4">{homepage.finalCta.eyebrow}</p>
        <h2 className="soso-display text-5xl md:text-6xl lg:text-[5rem] my-6 whitespace-pre-line text-foreground leading-[1.1]">{homepage.finalCta.title}</h2>
        <p className="text-secondary text-[14px] md:text-[15px] leading-relaxed mt-8 mb-12 max-w-xl mx-auto">{homepage.finalCta.body}</p>
        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <Link href={homepage.finalCta.primaryCta.href} className="soso-btn-gold px-12 py-5 text-[12px] font-bold uppercase tracking-widest bg-foreground text-background text-center shadow-lg transition-transform hover:-translate-y-0.5">
            {homepage.finalCta.primaryCta.label}
          </Link>
          <button onClick={() => setStylistOpen(true)} className="px-12 py-5 text-[12px] font-bold uppercase tracking-widest text-foreground border border-border hover:border-foreground hover:bg-muted transition-all text-center">
            {homepage.finalCta.stylistCtaLabel}
          </button>
        </div>
        <p className="mt-10 text-[11px] text-secondary/60 uppercase tracking-widest">{homepage.finalCta.note}</p>
      </div>
    </section>

    <StylistEnquiryDialog isOpen={stylistOpen} onClose={() => setStylistOpen(false)} />
  </div>;
}
