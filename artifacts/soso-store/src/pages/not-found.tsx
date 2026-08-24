import { Link } from 'wouter';
import { Seo } from '@/components/Seo';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 text-center">
      <Seo title="Page not found | SOSO Africa" description="The SOSO Africa page you are looking for is not available." noIndex />
      <div>
        <p className="text-[11px] uppercase tracking-[.3em] text-[hsl(var(--primary))]">404</p>
        <h1 className="soso-display text-4xl text-white mt-3">This piece is not in the collection.</h1>
        <p className="mt-4 text-sm text-[hsl(var(--secondary))]">Return to the collection to discover the SOSO pieces ready for your direction.</p>
        <Link href="/shop" className="inline-block mt-7 text-sm uppercase tracking-[.16em] text-[hsl(var(--primary))] underline underline-offset-4">Shop the collection</Link>
      </div>
    </div>
  );
}
