import React from 'react';
import { useListJournalPosts } from '@workspace/api-client-react';
import { Link } from 'wouter';
import { format } from 'date-fns';
import { mergeApprovedJournalPosts } from '@/lib/legacy-journal-indexing';

export function HomeJournalPreview() {
  const { data: posts, isFetching, isSuccess } = useListJournalPosts();

  const visiblePosts = mergeApprovedJournalPosts(posts ?? [], isSuccess && !isFetching)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  if (visiblePosts.length === 0) return null;

  const previewPosts = visiblePosts.slice(0, 3);

  return (
    <section className="my-16 md:my-32 max-w-[1600px] mx-auto px-4 md:px-6">
      <div className="mb-8 flex flex-col items-start gap-4 md:mb-10 md:flex-row md:items-end md:justify-between md:gap-6">
        <div className="min-w-0">
          <p className="mb-3 text-[10px] uppercase tracking-[0.24em] text-secondary md:text-[11px] md:tracking-[0.3em]">The Journal</p>
          <h2 className="soso-display text-[clamp(1.75rem,7.6vw,2rem)] leading-[1.15] tracking-[-0.025em] text-foreground md:text-5xl md:leading-none md:tracking-normal">Latest from SOSO</h2>
        </div>
        <Link href="/journal" className="inline-flex min-h-11 shrink-0 items-center gap-3 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.16em] underline underline-offset-8 transition-colors hover:text-secondary md:min-h-0 md:tracking-[0.2em]">
          Read the Journal
          <svg aria-hidden="true" className="md:hidden" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12h16M14 6l6 6-6 6" />
          </svg>
        </Link>
      </div>
      <div className="grid md:grid-cols-3 gap-6 md:gap-8">
        {previewPosts.map((post) => (
          <Link key={post.slug} href={`/journal/${post.slug}`} className="group flex flex-col gap-4">
             <div className="aspect-[4/3] overflow-hidden bg-muted/20 relative">
                {post.coverImageUrl && (
                  <img src={post.coverImageUrl} alt={post.title} loading="lazy" decoding="async" className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105" />
                )}
             </div>
             <div>
               <p className="text-[11px] text-secondary tracking-widest uppercase mb-2">
                 {post.publishedAt ? format(new Date(post.publishedAt), 'MMMM yyyy') : ''}
               </p>
                <h3 className="soso-display text-[22px] text-foreground mb-3 leading-[1.3] tracking-tight md:text-2xl md:leading-tight md:tracking-normal group-hover:text-secondary transition-colors">{post.title}</h3>
               <span className="text-[11px] font-bold uppercase tracking-[0.15em] border-b border-border pb-1 group-hover:border-secondary transition-colors">Read Article</span>
             </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
