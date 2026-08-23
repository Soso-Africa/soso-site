import React from "react";
import { Link } from "wouter";
import { Seo } from "@/components/Seo";
import { products } from "@/data/products";
import { useCart } from "@/context/CartContext";
import { trackStorefrontEvent } from "@/components/ConsentManager";
import { catalogApproved, indexingEnabled, siteUrl, absoluteUrl } from "@/lib/seo";

type CollectionMeta = {
  slug: string;
  label: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  category: string; // matches CatalogProduct.category
};

const COLLECTIONS: CollectionMeta[] = [
  {
    slug: "kaftans",
    label: "Kaftans",
    title: "Bespoke Kaftans | SOSO Africa, Abuja",
    description:
      "Premium made-to-order kaftans from SOSO Africa. Contemporary silhouettes in signature and ivory colourways, made for the individual in Abuja, Nigeria.",
    h1: "Kaftans",
    intro:
      "Considered kaftans for significant occasions and daily distinction. Each piece is made to order for the person who wears it.",
    category: "Kaftans",
  },
  {
    slug: "agbadas",
    label: "Agbadas",
    title: "Bespoke Agbadas | SOSO Africa, Abuja",
    description:
      "Made-to-order agbadas from SOSO Africa, Abuja. Generous three-piece sets for grand occasions, crafted for the individual.",
    h1: "Agbadas",
    intro:
      "Statement three-piece agbadas for ceremonies, celebrations, and moments that require presence. Each set made specifically for you.",
    category: "Agbadas",
  },
  {
    slug: "dashikis",
    label: "Dashikis",
    title: "Modern Dashikis | SOSO Africa, Abuja",
    description:
      "Contemporary made-to-order dashikis from SOSO Africa. Heritage lines refined for modern occasion and everyday presence.",
    h1: "Dashikis",
    intro:
      "Heritage craft in a contemporary silhouette — dashikis for celebration, occasion, and the days in between.",
    category: "Dashikis",
  },
  {
    slug: "two-piece",
    label: "Two-Piece Sets",
    title: "Two-Piece Sets | SOSO Africa, Abuja",
    description:
      "Coordinated two-piece sets from SOSO Africa. Relaxed, polished, and made to order in Abuja, Nigeria.",
    h1: "Two-Piece Sets",
    intro:
      "Coordinated and effortless — two-piece sets that move between occasions without effort.",
    category: "Two-Piece",
  },
  {
    slug: "shirts",
    label: "Shirts",
    title: "Premium Men's Shirts | SOSO Africa, Abuja",
    description:
      "Refined made-to-order shirts from SOSO Africa. Business, formal, and occasion shirting, made specifically for you in Abuja.",
    h1: "Shirts",
    intro:
      "Sharp, considered shirting for business settings, formal occasions, and everything between.",
    category: "Shirts",
  },
];

export function collectionMetaBySlug(slug: string) {
  return COLLECTIONS.find((c) => c.slug === slug);
}

export { COLLECTIONS };

export default function CollectionPage({ slug }: { slug: string }) {
  const meta = collectionMetaBySlug(slug);
  const { addItem } = useCart();

  if (!meta) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center text-center px-4">
        <div>
          <h1 className="text-3xl soso-display mb-4">Collection not found</h1>
          <Link href="/shop" className="text-primary hover:underline text-sm uppercase tracking-widest">
            View all pieces
          </Link>
        </div>
      </div>
    );
  }

  const pieces = products.filter((p) => p.category === meta.category);

  const collectionSchema =
    siteUrl && catalogApproved
      ? {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: meta.h1,
          description: meta.description,
          url: absoluteUrl(`/collections/${meta.slug}`),
          provider: { "@type": "Organization", name: "SOSO Africa" },
        }
      : null;

  return (
    <div className="min-h-screen bg-background fade-in">
      <Seo
        title={meta.title}
        description={meta.description}
        path={`/collections/${meta.slug}`}
        structuredData={collectionSchema}
        noIndex={!indexingEnabled}
      />

      <header className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-14 text-center border-b border-border/50 mb-14">
        <p className="text-xs uppercase tracking-[0.3em] text-primary mb-4">Collection</p>
        <h1 className="text-5xl md:text-6xl soso-display text-foreground mb-6 tracking-tight">{meta.h1}</h1>
        <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">{meta.intro}</p>
      </header>

      {/* Product grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        {pieces.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground uppercase tracking-widest text-sm">
            No pieces in this collection yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-12">
            {pieces.map((product) => (
              <Link key={product.slug} href={`/product/${product.slug}`} className="group block">
                <article className="cursor-pointer">
                  <div className="aspect-[3/4] overflow-hidden bg-muted mb-5 relative">
                    <img
                      src={product.img}
                      alt={product.name}
                      className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
                      loading="lazy"
                    />
                    <span className="absolute top-4 left-4 text-[10px] uppercase tracking-[0.2em] px-2 py-1 bg-background/90 text-foreground font-medium">
                      {product.tag}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-primary mb-1">{product.category}</p>
                    <h2 className="soso-display text-xl text-foreground mb-1 group-hover:text-primary transition-colors">
                      {product.name}
                    </h2>
                    <p className="text-muted-foreground text-sm mb-3">{product.note}</p>
                    <p className="text-foreground font-medium">
                      ₦{product.price.toLocaleString("en-NG")}
                    </p>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}

        {/* Cross-link to full shop */}
        <div className="mt-16 text-center pt-10 border-t border-border/50">
          <p className="text-muted-foreground text-sm mb-6">Explore the full SOSO collection</p>
          <div className="flex flex-wrap gap-4 justify-center">
            {COLLECTIONS.filter((c) => c.slug !== slug).map((c) => (
              <Link
                key={c.slug}
                href={`/collections/${c.slug}`}
                className="text-[11px] uppercase tracking-[0.2em] px-5 py-3 border border-border text-muted-foreground hover:border-primary/60 hover:text-foreground transition-colors"
              >
                {c.label}
              </Link>
            ))}
            <Link
              href="/shop"
              className="text-[11px] uppercase tracking-[0.2em] px-5 py-3 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              All pieces
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
