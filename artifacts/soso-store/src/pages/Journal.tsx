import React from 'react';
import { useListJournalPosts } from '@workspace/api-client-react';
import { Link } from 'wouter';
import { format } from 'date-fns';
import { Loader2, ArrowRight } from 'lucide-react';
import { Seo } from '@/components/Seo';
import { journalApproved } from '@/lib/seo';
import { PlatformContentState, usePlatformContent } from '@/data/platformContent';
import { legacyJournalPosts } from '@/data/legacy-content';

export default function Journal() {
  const { data: posts, isLoading, isError } = useListJournalPosts();
  const platform = usePlatformContent();
  const platformStateCopy = platform.data?.content.site.platformState;
  if (!platform.data) return <PlatformContentState loading={platform.isLoading} error={platform.isError} copy={platformStateCopy} />;
  const copy = platform.data.content.pages.journal;
  // The API remains authoritative when a migrated slug has been edited in the
  // CMS. Bundled migration records ensure legacy articles cannot disappear
  // during deployment or before the database import has completed.
  const visiblePosts = Array.from(new Map(
    [...legacyJournalPosts, ...(posts ?? [])].map((post) => [post.slug, post]),
  ).values()).sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  return (
    <div className="min-h-screen bg-background fade-in">
      <Seo
        title={copy.seo.title}
        description={copy.seo.description}
        path="/journal"
        noIndex={!journalApproved}
      />
      <header className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16 text-center border-b border-border/50 mb-16">
          <h1 className="text-5xl md:text-6xl soso-display mb-6 text-foreground tracking-tight">{copy.heading}</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
           {copy.intro}
        </p>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        {isLoading ? (
            <div className="flex flex-col items-center justify-center py-32" role="status" aria-live="polite">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-6" />
            <p className="text-muted-foreground uppercase tracking-widest text-sm">{copy.loadingMessage}</p>
          </div>
        ) : isError && visiblePosts.length === 0 ? (
            <div className="text-center py-32 border border-border bg-card" role="alert">
            <p className="text-destructive uppercase tracking-widest font-medium">{copy.errorMessage}</p>
          </div>
        ) : visiblePosts.length === 0 ? (
          <div className="text-center py-32 border border-border bg-card">
            <p className="text-muted-foreground uppercase tracking-widest font-medium">{copy.emptyMessage}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-12">
            {visiblePosts.map((post) => (
              <Link key={post.slug} href={`/journal/${post.slug}`} className="group block h-full">
                <article className="h-full flex flex-col cursor-pointer">
                  <div className="aspect-[4/5] overflow-hidden bg-muted mb-6 relative">
                    {post.coverImageUrl ? (
                      <img 
                        src={post.coverImageUrl} 
                        alt={post.coverImageAlt ?? post.title}
                        className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-card border border-border">
                        <span className="text-muted-foreground font-serif italic opacity-30 text-2xl tracking-widest">{copy.fallbackMark}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 flex flex-col">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-primary mb-4 font-medium flex-wrap">
                      {post.category && <span>{post.category}</span>}
                      {post.category && <span>&bull;</span>}
                      <span>{format(new Date(post.publishedAt), 'MMM d, yyyy')}</span>
                      <span>&bull;</span>
                      <span>{post.authorName}</span>
                      {post.readTimeMinutes && <><span>&bull;</span><span>{post.readTimeMinutes} min read</span></>}
                    </div>
                    <h2 className="text-2xl md:text-3xl soso-display text-foreground mb-4 group-hover:text-primary transition-colors leading-snug">
                      {post.title}
                    </h2>
                    <p className="text-muted-foreground leading-relaxed text-sm mb-8 flex-1 line-clamp-3">
                      {post.excerpt}
                    </p>
                    <div className="mt-auto flex items-center gap-2 text-xs uppercase tracking-widest font-medium text-foreground group-hover:text-primary transition-colors">
                       {copy.readCtaLabel} <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
