import React, { useState } from "react";
import { Link } from "wouter";
import { openPrivacyChoices } from "./ConsentManager";
import { usePlatformContent } from "@/data/platformContent";
import { ChevronDown } from "lucide-react";
import { BrandLockup } from "./BrandLockup";

const footerLinkClass = "py-1 text-[13px] text-secondary hover:text-foreground hover:underline underline-offset-4";

function FooterLink({ href, label, className = footerLinkClass }: { href: string; label: string; className?: string }) {
  return href.startsWith("https://")
    ? <a href={href} target="_blank" rel="noopener noreferrer" className={footerLinkClass}>{label}</a>
    : <Link href={href} className={footerLinkClass}>{label}</Link>;
}

function FooterAccordion({ title, children }: { title: string; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border-b border-border md:border-none">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between py-4 text-left md:hidden"
        aria-expanded={isOpen}
      >
        <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-foreground">{title}</span>
        <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
      </button>
      <div className="hidden md:block">
        <h3 className="mb-4 text-[11px] font-bold uppercase tracking-[0.25em] text-foreground">{title}</h3>
        <div className="flex flex-col gap-2">{children}</div>
      </div>
      <div className={`grid transition-all duration-300 md:hidden ${isOpen ? "grid-rows-[1fr] pb-4" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden flex flex-col gap-2">
          {children}
        </div>
      </div>
    </div>
  );
}

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
    <footer className="bg-background text-foreground border-t border-border">
      <div className="mx-auto max-w-[1600px] px-6 lg:px-12 py-16 md:py-24">

        {/* Top Section: Links & Address */}
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-6 lg:gap-8">

          {/* Brand & Connection (Span 2) */}
          <div className="lg:col-span-2">
            <Link href="/" aria-label="SOSO Africa" className="mb-8 inline-block transition-opacity hover:opacity-70">
              <BrandLockup variant="black" size="footer" />
            </Link>

            <p className="text-[13px] max-w-sm leading-relaxed mb-8 text-secondary">
              {site.footer.description || "SOSO approaches menswear with proportion, restraint, and intent."}
            </p>

            {site.hqAddress && (
              <address className="mb-8 max-w-sm whitespace-pre-wrap text-[13px] not-italic leading-relaxed text-secondary">
                {site.hqAddress}
              </address>
            )}

            {(site.contactEmail || site.contactPhone) && (
              <dl className="mb-8 grid gap-3 text-[13px] text-secondary">
                {site.contactEmail && (
                  <div className="flex flex-wrap gap-x-3">
                    <dt className="font-medium text-foreground">Email</dt>
                    <dd>
                      <a href={`mailto:${site.contactEmail}`} className="hover:text-foreground hover:underline underline-offset-4">
                        {site.contactEmail}
                      </a>
                    </dd>
                  </div>
                )}
                {site.contactPhone && (
                  <div className="flex flex-wrap gap-x-3">
                    <dt className="font-medium text-foreground">Phone</dt>
                    <dd>
                      <a href={`tel:${site.contactPhone.replace(/[^\d+]/g, "")}`} className="hover:text-foreground hover:underline underline-offset-4">
                        {site.contactPhone}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            )}

            <div className="flex flex-wrap gap-4">
              {site.instagramUrl && (
                <a href={site.instagramUrl} target="_blank" rel="noopener noreferrer" aria-label={site.footer.instagramAriaLabel} className="text-[11px] uppercase tracking-[0.2em] font-bold text-foreground hover:text-secondary transition-colors">
                  {site.footer.instagramLabel}
                </a>
              )}
              {socialLinks.map(([label, href]) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="text-[11px] uppercase tracking-[0.2em] font-bold text-foreground hover:text-secondary transition-colors">
                  {label}
                </a>
              ))}
            </div>
          </div>

          {site.footer.columns.map((column) => (
            <div className="lg:col-span-1" key={column.heading}>
              <FooterAccordion title={column.heading}>
                {column.links.map((link) => <FooterLink key={`${link.label}-${link.href}`} href={link.href} label={link.label} />)}
              </FooterAccordion>
            </div>
          ))}

        </div>

        {/* Bottom Section: Legal & Copyright */}
        <div className="mt-16 pt-8 border-t border-border flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex flex-col gap-2">
            <span className="text-[11px] tracking-[0.1em] text-secondary">{site.footer.copyright}</span>
            <span className="text-[11px] tracking-[0.1em] text-secondary">{site.footer.checkoutNote}</span>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-3 text-[11px] tracking-[0.1em] font-medium text-secondary">
            {site.footer.legalLinks.map((link) => (
              <FooterLink
                key={`${link.label}-${link.href}`}
                href={link.href}
                label={link.label}
                className="hover:text-foreground hover:underline underline-offset-4"
              />
            ))}
            <button type="button" onClick={openPrivacyChoices} className="hover:text-foreground hover:underline underline-offset-4">{site.footer.cookieChoicesLabel}</button>
          </div>
        </div>

      </div>
    </footer>
  );
}
