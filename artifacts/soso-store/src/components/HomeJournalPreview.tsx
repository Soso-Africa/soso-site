import React from 'react';
import { useListJournalPosts } from '@workspace/api-client-react';
import { Link } from 'wouter';
import { format } from 'date-fns';
import { legacyJournalPosts } from '@/data/legacy-content';

export function HomeJournalPreview() {
  const { data: posts, isLoading } = useListJournalPosts();

  const visiblePosts = Array.from(new Map(
    [...legacyJournalPosts, ...(posts ?? [])].map((post) => [post.slug, post]),
  ).values()).sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  if (visiblePosts.length === 0) return null;

  const previewPosts = visiblePosts.slice(0, 3);

  return (
    <section className="my-16 md:my-32 max-w-[1600px] mx-auto px-4 md:px-6">
      <div className="mb-10 flex items-end justify-between gap-6">
        <div>
          <p className="mb-3 text-[11px] uppercase tracking-[0.3em] text-secondary">The Journal</p>
          <h2 className="soso-display text-4xl text-foreground md:text-5xl">Latest from SOSO</h2>
        </div>
        <Link href="/journal" className="text-[11px] font-semibold uppercase tracking-[0.2em] underline underline-offset-8">Read the Journal</Link>
      </div>
      <div className="grid md:grid-cols-3 gap-6 md:gap-8">
        {previewPosts.map((post) => (
          <Link key={post.slug} href={`/journal/${post.slug}`} className="group flex flex-col gap-4">
             <div className="aspect-[4/3] overflow-hidden bg-muted/20 relative">
                {post.coverImageUrl && (
                  <img src={post.coverImageUrl} alt={post.title} className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105" />
                )}
             </div>
             <div>
               <p className="text-[11px] text-secondary tracking-widest uppercase mb-2">
                 {post.publishedAt ? format(new Date(post.publishedAt), 'MMMM yyyy') : ''}
               </p>
               <h3 className="soso-display text-2xl text-foreground mb-3 leading-tight group-hover:text-secondary transition-colors">{post.title}</h3>
               <span className="text-[11px] font-bold uppercase tracking-[0.15em] border-b border-border pb-1 group-hover:border-secondary transition-colors">Read Article</span>
             </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
