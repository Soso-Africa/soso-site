import React from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Seo } from "@/components/Seo";
import { legacyAboutBySlug } from "@/data/legacy-content";
import { journalBodyBlocks } from "@/lib/journal-body";
import { absoluteUrl } from "@/lib/seo";

/**
 * Complete legacy brand destinations. Register this component at
 * /about/:slug; the existing /about overview remains unchanged.
 */
export default function LegacyAboutPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const page = legacyAboutBySlug.get(slug);

  if (!page) {
    return (
      <div className="min-h-[70vh] bg-background px-4 py-24 text-center">
        <Seo
          title="About page not found | SOSO Africa"
          description="Return to the SOSO Africa story."
          noIndex
        />
        <h1 className="soso-display mb-6 text-4xl text-foreground">About page not found</h1>
        <Link className="text-sm uppercase tracking-widest text-primary" href="/about">
          <ArrowLeft className="mr-2 inline h-4 w-4" aria-hidden="true" />
          About SOSO Africa
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background fade-in">
      <Seo
        title={page.seoTitle}
        description={page.seoDescription}
        path={page.canonicalPath}
        breadcrumbs={[
          { name: "About SOSO Africa", path: "/about" },
          { name: page.title, path: page.canonicalPath },
        ]}
        structuredData={{
          "@context": "https://schema.org",
          "@type": "AboutPage",
          name: page.title,
          description: page.seoDescription,
          url: absoluteUrl(page.canonicalPath),
          datePublished: page.publishedAt,
          dateModified: page.modifiedAt,
          isPartOf: { "@type": "WebSite", name: "SOSO Africa" },
        }}
      />

      <header className="mx-auto max-w-4xl px-4 pb-14 pt-24 text-center sm:px-6 lg:px-8">
        <p className="mb-6 text-xs uppercase tracking-[0.3em] text-primary">{page.eyebrow}</p>
        <h1 className="soso-display mb-8 text-5xl leading-tight text-foreground md:text-7xl">
          {page.title}
        </h1>
        <p className="mx-auto max-w-2xl text-lg leading-relaxed text-muted-foreground">
          {page.summary}
        </p>
      </header>

      {page.mediaUrls[0] && (
        <figure className="mx-auto mb-16 max-w-5xl px-4 sm:px-6 lg:px-8">
          <img
            src={page.mediaUrls[0]}
            alt={`${page.title} — SOSO Africa`}
            className="max-h-[70vh] w-full object-cover"
          />
        </figure>
      )}

      <article className="prose prose-lg mx-auto max-w-2xl px-4 pb-24 prose-headings:font-normal prose-headings:text-foreground prose-p:leading-relaxed prose-p:text-foreground/90 sm:px-6">
        <div className="space-y-6">
          {journalBodyBlocks(page.body).map((block, index) => {
            if (block.type === "heading") return <h2 key={`${block.text}-${index}`}>{block.text}</h2>;
            if (block.type === "list") {
              return <ul key={`list-${index}`}>{block.items.map((item) => <li key={item}>{item}</li>)}</ul>;
            }
            return <p key={`${block.text}-${index}`}>{block.text}</p>;
          })}
        </div>
      </article>
    </div>
  );
}