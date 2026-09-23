import React from "react";
import { Link } from "wouter";
import { Seo } from "@/components/Seo";
import { catalogApproved, siteUrl, absoluteUrl } from "@/lib/seo";
import { PlatformContentState, usePlatformContent } from "@/data/platformContent";
import { ProductCard } from "@/components/ProductCard";
import { selectCollectionProducts } from "@/lib/collectionSelection";

export default function CollectionPage({ slug }: { slug: string }) {
  const platform = usePlatformContent();
  const platformStateCopy = platform.data?.content.site.platformState;
  if (!platform.data) return <PlatformContentState loading={platform.isLoading} error={platform.isError} copy={platformStateCopy} />;
  const { collections, products } = platform.data.content;
  const meta = collections.find((collection) => collection.slug === slug);
  if (!meta) {
    return <main className="min-h-[70vh] flex items-center justify-center text-center px-4"><div>
      <h1 className="text-3xl soso-display mb-4">{platform.data.content.pages.shop.collectionNotFoundTitle}</h1>
      <Link href={platform.data.content.pages.shop.collectionNotFoundCta.href} className="text-primary hover:underline text-sm uppercase tracking-widest">{platform.data.content.pages.shop.collectionNotFoundCta.label}</Link>
    </div></main>;
  }
  const pieces = selectCollectionProducts(meta, products);
  const schema = siteUrl && catalogApproved ? {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: meta.h1,
    description: meta.seo.description,
    url: absoluteUrl(`/collections/${meta.slug}`),
    mainEntity: {
      "@type": "ItemList",
      itemListElement: pieces.map((product, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: absoluteUrl(`/product/${product.slug}`),
        name: product.name,
      })),
    },
  } : null;
  return <div className="min-h-screen bg-background fade-in">
    <Seo title={meta.seo.title} description={meta.seo.description} path={`/collections/${meta.slug}`} structuredData={schema} noIndex={!catalogApproved} breadcrumbs={[{ name: meta.label, path: `/collections/${meta.slug}` }]} />
    <header className={`${meta.showCover && meta.cover ? "max-w-7xl" : "max-w-4xl"} mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-14 border-b border-border/50 mb-14`}>
      {meta.showCover && meta.cover && (
        <div className="mb-10 aspect-[16/7] min-h-[240px] overflow-hidden bg-muted sm:min-h-0">
          {meta.mobileCover && (
            <img
              src={meta.mobileCover.src}
              alt={meta.mobileCover.alt}
              width={1600}
              height={700}
              className="h-full w-full object-cover object-[var(--mobile-position)] sm:hidden"
              style={{ "--mobile-position": meta.mobileCropPosition ?? "center center" } as React.CSSProperties}
            />
          )}
          <img
            src={meta.cover.src}
            alt={meta.cover.alt}
            width={1600}
            height={700}
            className={`${meta.mobileCover ? "hidden sm:block" : "block"} h-full w-full object-cover object-[var(--mobile-position)] sm:object-center`}
            style={{ "--mobile-position": meta.mobileCropPosition ?? "center center" } as React.CSSProperties}
          />
        </div>
      )}
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-primary mb-4">{meta.label}</p>
        <h1 className="text-5xl md:text-6xl soso-display text-foreground mb-6 tracking-tight">{meta.h1}</h1>
        <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">{meta.intro}</p>
      </div>
    </header>
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
      {!pieces.length ? <p className="text-center py-24 text-muted-foreground uppercase tracking-widest text-sm">{platform.data.content.pages.shop.collectionEmptyMessage}</p> :
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-12">{pieces.map((product) =>
          <ProductCard key={product.slug} product={product} testIdPrefix="collection" />
        )}</div>}
      <div className="mt-16 text-center pt-10 border-t border-border/50 flex flex-wrap gap-4 justify-center">
        {collections.filter((item) => item.slug !== slug && item.department === meta.department).map((item) =>
          <Link key={item.slug} href={`/collections/${item.slug}`} className="text-[11px] uppercase tracking-[0.2em] px-5 py-3 border border-border">{item.label}</Link>)}
        <Link href={platform.data.content.pages.shop.collectionNotFoundCta.href} className="text-[11px] uppercase tracking-[0.2em] px-5 py-3 bg-primary text-primary-foreground">{platform.data.content.pages.shop.allCollectionsLabel}</Link>
      </div>
    </main>
  </div>;
}