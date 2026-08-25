import { Link } from 'wouter';
import { Seo } from '@/components/Seo';
import { PlatformContentState, usePlatformContent } from "@/data/platformContent";

export default function NotFound() {
  const platform = usePlatformContent();
  const platformStateCopy = platform.data?.content.site.platformState;
  if (!platform.data) return <PlatformContentState loading={platform.isLoading} error={platform.isError} copy={platformStateCopy} />;
  const copy = platform.data.content.pages.notFound;
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 text-center">
      <Seo title={copy.seo.title} description={copy.seo.description} noIndex />
      <div>
        <p className="text-[11px] uppercase tracking-[.3em] text-[hsl(var(--primary))]">404</p>
        <h1 className="soso-display text-4xl text-white mt-3">{copy.title}</h1>
        <p className="mt-4 text-sm text-[hsl(var(--secondary))]">{copy.body}</p>
        <Link href={copy.cta.href} className="inline-block mt-7 text-sm uppercase tracking-[.16em] text-[hsl(var(--primary))] underline underline-offset-4">{copy.cta.label}</Link>
      </div>
    </div>
  );
}
