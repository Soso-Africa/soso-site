import React from "react";
import { Link } from "wouter";
import { openPrivacyChoices } from "./ConsentManager";
import { usePlatformContent } from "@/data/platformContent";

export function Footer() {
  const { data } = usePlatformContent();
  const site = data?.content.site;
  if (!site) return null;
  return (
    <footer className="px-6 lg:px-12 py-14" style={{ borderTop: `1px solid rgba(184,145,47,0.2)` }}>
      <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-10">
        <div className="md:col-span-2">
          <Link href="/">
            <img src={site.logoUrl} alt={site.logoAlt} className="h-9 mb-4 cursor-pointer" />
          </Link>
          <p className="text-[13px] max-w-sm leading-relaxed mb-6" style={{ color: "hsl(var(--secondary))" }}>
            {site.footer.description}
          </p>
          {/* Social links — update with real handles when available */}
          <div className="flex gap-4">
            <a
              href={site.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={site.footer.instagramAriaLabel}
              className="text-[11px] uppercase tracking-[0.2em] soso-link"
              style={{ color: "hsl(var(--primary))" }}
            >
              {site.footer.instagramLabel}
            </a>
            {site.contactEmail && <a href={`mailto:${site.contactEmail}`} className="text-[11px] uppercase tracking-[0.2em] soso-link" style={{ color: "hsl(var(--primary))" }}>{site.contactEmail}</a>}
          </div>
        </div>
        {site.footer.columns.map((column) => <div key={column.heading}>
          <p className="text-[11px] tracking-[0.25em] uppercase mb-4" style={{ color: "hsl(var(--primary))" }}>{column.heading}</p>
          {column.links.map((link) => <Link key={`${link.href}-${link.label}`} href={link.href} className="soso-link block text-[13px] py-1.5" style={{ color: "hsl(var(--secondary))" }}>{link.label}</Link>)}
        </div>)}
      </div>
      <div className="max-w-7xl mx-auto mt-12 pt-6 flex flex-wrap justify-between gap-3 text-[11px] tracking-[0.1em]" style={{ borderTop: "1px solid rgba(184,145,47,0.15)", color: "#7a715c" }}>
        <span>{site.footer.copyright}</span>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {site.footer.legalLinks.map((link) => <Link key={`${link.href}-${link.label}`} href={link.href} className="soso-link">{link.label}</Link>)}
          <button type="button" onClick={openPrivacyChoices} className="soso-link">{site.footer.cookieChoicesLabel}</button>
          <span>{site.footer.checkoutNote}</span>
        </div>
      </div>
    </footer>
  );
}
