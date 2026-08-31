import React from "react";
import { Link } from "wouter";
import { openPrivacyChoices } from "./ConsentManager";
import { usePlatformContent } from "@/data/platformContent";

export function Footer() {
  const { data } = usePlatformContent();
  const site = data?.content.site;
  if (!site) return null;
  const socialLinks = [
    ["Facebook", site.socialLinks.facebookUrl],
    ["Twitter", site.socialLinks.twitterUrl],
    ["YouTube", site.socialLinks.youtubeUrl],
    ["TikTok", site.socialLinks.tiktokUrl],
    ["LinkedIn", site.socialLinks.linkedinUrl],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  return (
    <footer className="px-6 lg:px-12 py-14 bg-background text-foreground border-t border-border">
      <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-10">
        <div className="md:col-span-2">
          <Link href="/">
            <img src={site.logoUrl} alt={site.logoAlt} className="h-9 mb-4 cursor-pointer" />
          </Link>
          <p className="text-[13px] max-w-sm leading-relaxed mb-6 text-secondary">
            {site.footer.description}
          </p>
          {site.hqAddress && (
            <address className="mb-6 max-w-sm whitespace-pre-wrap text-[13px] not-italic leading-relaxed text-secondary">
              {site.hqAddress}
            </address>
          )}
          {(site.contactEmail || site.contactPhone) && (
            <dl className="mb-6 grid gap-2 text-[13px] text-secondary">
              {site.contactEmail && (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="font-medium text-foreground">Email</dt>
                  <dd>
                    <a
                      href={`mailto:${site.contactEmail}`}
                      className="hover:text-foreground hover:underline underline-offset-4"
                      data-testid="link-footer-contact-email"
                    >
                      {site.contactEmail}
                    </a>
                  </dd>
                </div>
              )}
              {site.contactPhone && (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="font-medium text-foreground">Phone</dt>
                  <dd>
                    <a
                      href={`tel:${site.contactPhone.replace(/[^\d+]/g, "")}`}
                      className="hover:text-foreground hover:underline underline-offset-4"
                      data-testid="link-footer-contact-phone"
                    >
                      {site.contactPhone}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          )}
          <div className="flex flex-wrap gap-4">
            {site.instagramUrl && (
              <a
                href={site.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={site.footer.instagramAriaLabel}
                className="text-[11px] uppercase tracking-[0.2em] font-medium text-foreground hover:text-secondary hover:underline underline-offset-4"
              >
                {site.footer.instagramLabel}
              </a>
            )}
            {socialLinks.map(([label, href]) => (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="text-[11px] uppercase tracking-[0.2em] font-medium text-foreground hover:text-secondary hover:underline underline-offset-4">
                {label}
              </a>
            ))}
          </div>
        </div>
        {site.footer.columns.map((column) => <div key={column.heading}>
          <p className="text-[11px] tracking-[0.25em] uppercase mb-4 font-medium text-foreground">{column.heading}</p>
          {column.links.map((link) => <Link key={`${link.href}-${link.label}`} href={link.href} className="block text-[13px] py-1.5 text-secondary hover:text-foreground hover:underline underline-offset-4">{link.label}</Link>)}
        </div>)}
      </div>
      <div className="max-w-7xl mx-auto mt-12 pt-6 flex flex-wrap justify-between gap-3 text-[11px] tracking-[0.1em] border-t border-border text-secondary">
        <span>{site.footer.copyright}</span>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {site.footer.legalLinks.map((link) => <Link key={`${link.href}-${link.label}`} href={link.href} className="hover:text-foreground hover:underline underline-offset-4">{link.label}</Link>)}
          <button type="button" onClick={openPrivacyChoices} className="hover:text-foreground hover:underline underline-offset-4">{site.footer.cookieChoicesLabel}</button>
          <Link href="/sign-in" className="font-medium text-foreground hover:underline underline-offset-4" data-testid="link-footer-staff-login">Staff login</Link>
          <span>{site.footer.checkoutNote}</span>
        </div>
      </div>
    </footer>
  );
}
