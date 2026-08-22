import React, { useState } from 'react';
import { useGetJournalPost } from '@workspace/api-client-react';
import { useParams, Link } from 'wouter';
import { format } from 'date-fns';
import { Loader2, ArrowLeft, Share2 } from 'lucide-react';
import { Seo } from '@/components/Seo';
import { absoluteUrl, journalApproved, siteUrl } from '@/lib/seo';
import { approvedJournalEntryForSlug } from '@/data/journalSeo';

export default function JournalPost() {
  const params = useParams();
  const slug = params.slug || '';
  const { data: post, isLoading, isError } = useGetJournalPost(slug);
  const approvedArticle = approvedJournalEntryForSlug(slug);

  if (isLoading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center bg-background">
        <Seo title="The Journal | SOSO Africa" description="SOSO Africa Journal." path="/journal" noIndex />
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
        <p className="uppercase tracking-widest text-xs text-muted-foreground">Loading Article...</p>
      </div>
    );
  }

  if (isError || !post) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center bg-background text-center px-4">
        <Seo title="Article not found | SOSO Africa" description="The requested SOSO Africa Journal article is not available." noIndex />
        <h1 className="text-4xl soso-display mb-4 text-foreground">Article Not Found</h1>
        <p className="text-muted-foreground mb-8 uppercase tracking-widest text-sm">The requested journal entry could not be located.</p>
        <Link href="/journal" className="inline-flex items-center gap-2 text-primary hover:text-primary/80 uppercase tracking-widest text-sm font-medium transition-colors">
          <ArrowLeft className="w-4 h-4" /> Return to Journal
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24 fade-in">
      <Seo
        title={`${approvedArticle?.title ?? post.title} | SOSO Africa Journal`}
        description={approvedArticle?.excerpt ?? post.excerpt}
        path={`/journal/${post.slug}`}
        type="article"
        noIndex={!journalApproved || !approvedArticle}
        structuredData={siteUrl && approvedArticle ? {
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: approvedArticle.title,
          description: approvedArticle.excerpt,
          datePublished: approvedArticle.publishedAt,
          author: { "@type": "Person", name: approvedArticle.authorName },
          mainEntityOfPage: absoluteUrl(`/journal/${post.slug}`),
          ...(approvedArticle.coverImageUrl ? { image: approvedArticle.coverImageUrl } : {}),
        } : null}
      />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-8">
        <Link href="/journal" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest text-xs font-medium mb-16 group">
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" /> Back to Journal
        </Link>
        
        <header className="text-center mb-16">
          <div className="flex items-center justify-center gap-3 text-sm uppercase tracking-widest text-primary mb-8 font-medium">
            <span>{format(new Date(post.publishedAt), 'MMMM d, yyyy')}</span>
            <span className="opacity-50">&bull;</span>
            <span>By {post.authorName}</span>
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-7xl soso-display text-foreground leading-[1.1] mb-8 tracking-tight">
            {post.title}
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto italic font-serif leading-relaxed">
            {post.excerpt}
          </p>
        </header>
      </div>

      {post.coverImageUrl && (
        <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mb-20">
          <div className="aspect-[16/9] md:aspect-[21/9] relative overflow-hidden bg-card border border-border">
            <img 
              src={post.coverImageUrl} 
              alt={post.title}
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      )}

      <article className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 prose prose-invert prose-lg prose-headings:font-serif prose-headings:font-normal prose-headings:text-foreground prose-a:text-primary hover:prose-a:text-primary/80 prose-img:rounded-none prose-p:leading-relaxed prose-p:text-foreground/90">
        <div className="space-y-6 whitespace-pre-line">
          {post.body.split(/\n{2,}/).map((paragraph, index) => (
            <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
          ))}
        </div>
      </article>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 mt-24 pt-12 border-t border-border">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Written By</p>
            <p className="text-lg soso-display text-foreground">{post.authorName}</p>
          </div>
          <ShareArticleButton title={post.title} />
        </div>
      </div>
    </div>
  );
}

function ShareArticleButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const payload = { title, url: window.location.href };
    if (navigator.share) {
      await navigator.share(payload);
      return;
    }

    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <button
        type="button"
      onClick={() => void share().catch(() => undefined)}
      className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors text-xs uppercase tracking-widest font-medium"
    >
      <Share2 className="w-4 h-4" /> {copied ? "Link copied" : "Share article"}
    </button>
  );
}
