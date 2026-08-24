/**
 * Staff-only draft article preview.
 * Route: /journal/preview/:slug
 * Only accessible to authenticated staff (editor or owner role).
 * Renders the article exactly as JournalPost.tsx would, with a visible
 * "DRAFT — not published" banner so it cannot be mistaken for a live page.
 */

import React from "react";
import { useRoute, Link } from "wouter";
import { useAuth } from "@clerk/react";
import { useListStaffJournalPosts } from "@workspace/api-client-react";
import { format } from "date-fns";
import { ArrowLeft, Clock, Eye, Tag } from "lucide-react";
import { Seo } from "@/components/Seo";

export default function JournalPreview() {
  const [, params] = useRoute("/journal/preview/:slug");
  const { isLoaded, isSignedIn } = useAuth();

  const { data: allPosts, isLoading, error } = useListStaffJournalPosts({
    query: { queryKey: ["staff-journal-preview"], enabled: !!params?.slug && isSignedIn === true },
  });
  const post = allPosts?.find((p) => p.slug === params?.slug);

  if (!isLoaded || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <span className="text-muted-foreground text-sm animate-pulse">Loading preview…</span>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-24 text-center">
        <p className="soso-display text-3xl">Staff sign-in required</p>
        <Link href="/sign-in" className="mt-6 inline-block text-sm text-primary underline underline-offset-4">Sign in to preview articles</Link>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-24 text-center">
        <p className="soso-display text-3xl">Article not found</p>
        <p className="mt-4 text-sm text-muted-foreground">No article with this slug exists, or you may not have editor or owner access.</p>
        <Link href="/staff" className="mt-6 inline-block text-sm text-primary underline underline-offset-4">Back to staff portal</Link>
      </div>
    );
  }

  const seoTitle = post.seoTitle || post.title;

  return (
    <div className="min-h-screen bg-background pb-24 fade-in">
      <Seo title={`[PREVIEW] ${seoTitle} | SOSO Africa`} description={post.excerpt} path={`/journal/preview/${post.slug}`} noIndex />

      {/* Draft banner */}
      <div className="bg-amber-500 text-black text-center py-3 px-4 flex items-center justify-center gap-3 text-sm font-semibold">
        <Eye size={16} />
        STAFF PREVIEW — This article is <strong>{post.status.toUpperCase()}</strong> and not visible to the public
        <Link href="/staff" className="underline underline-offset-2 ml-4 font-normal text-xs">Back to portal</Link>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-8">
        <Link href="/staff" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest text-xs font-medium mb-16 group">
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" /> Back to staff portal
        </Link>

        <header className="text-center mb-16">
          <div className="flex items-center justify-center flex-wrap gap-3 text-xs uppercase tracking-widest text-primary mb-8 font-medium">
            {post.category && <span>{post.category}</span>}
            {post.category && <span className="opacity-40">&bull;</span>}
            <span>{post.publishedAt ? format(new Date(post.publishedAt), "MMMM d, yyyy") : "Not yet published"}</span>
            <span className="opacity-40">&bull;</span>
            <span>By {post.authorName}</span>
            {post.readTimeMinutes && (
              <>
                <span className="opacity-40">&bull;</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {post.readTimeMinutes} min read</span>
              </>
            )}
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-7xl soso-display text-foreground leading-[1.1] mb-8 tracking-tight">
            {post.title}
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto italic font-serif leading-relaxed">
            {post.excerpt}
          </p>
          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-center mt-6">
              {post.tags.map((tag) => (
                <span key={tag} className="flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] px-3 py-1 border border-primary/30 text-primary/70">
                  <Tag className="w-2.5 h-2.5" />{tag}
                </span>
              ))}
            </div>
          )}
        </header>

        {post.coverImageUrl && (
          <figure className="mb-16">
            <img src={post.coverImageUrl} alt={post.coverImageAlt ?? post.title} className="w-full aspect-[16/9] object-cover" />
          </figure>
        )}

        <article className="max-w-2xl mx-auto">
          <div className="prose prose-lg prose-invert max-w-none leading-relaxed text-foreground/90 space-y-6">
            {post.body.split("\n\n").map((para, i) => (
              <p key={i} className="text-base leading-8">{para}</p>
            ))}
          </div>
        </article>

        {/* SEO metadata preview */}
        <aside className="mt-16 border border-amber-500/30 bg-amber-500/5 p-6 max-w-2xl mx-auto">
          <p className="text-xs uppercase tracking-widest text-amber-500 font-semibold mb-4">SEO preview (staff only)</p>
          <p className="text-sm"><span className="text-muted-foreground">Meta title:</span> {post.seoTitle ?? post.title}</p>
          <p className="text-sm mt-2"><span className="text-muted-foreground">Meta description:</span> {post.seoDescription ?? post.excerpt}</p>
          {post.relatedProductSlugs && post.relatedProductSlugs.length > 0 && (
            <p className="text-sm mt-2"><span className="text-muted-foreground">Related products:</span> {post.relatedProductSlugs.join(", ")}</p>
          )}
          {post.relatedArticleSlugs && post.relatedArticleSlugs.length > 0 && (
            <p className="text-sm mt-2"><span className="text-muted-foreground">Related articles:</span> {post.relatedArticleSlugs.join(", ")}</p>
          )}
        </aside>
      </div>
    </div>
  );
}
