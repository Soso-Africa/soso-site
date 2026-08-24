import React from "react";
import { Link } from "wouter";
import { openPrivacyChoices } from "./ConsentManager";
<<<<<<< HEAD
import { resolvedSiteContent, useSiteContent } from "@/data/siteContent";

export function Footer() {
  const { data: siteData } = useSiteContent();
  const site = resolvedSiteContent(siteData?.content);
=======

export function Footer() {
>>>>>>> github/main
  return (
    <footer className="px-6 lg:px-12 py-14" style={{ borderTop: `1px solid rgba(184,145,47,0.2)` }}>
      <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-10">
        <div className="md:col-span-2">
          <Link href="/">
            <img src="/images/soso/logo.png" alt="SOSO Africa" className="h-9 mb-4 cursor-pointer" />
          </Link>
          <p className="text-[13px] max-w-sm leading-relaxed mb-6" style={{ color: "hsl(var(--secondary))" }}>
<<<<<<< HEAD
            {site.footerDescription}
=======
            Bespoke menswear house, Abuja. Kaftans, agbadas, dashikis and shirting —
            made to order for the individual.
>>>>>>> github/main
          </p>
          {/* Social links — update with real handles when available */}
          <div className="flex gap-4">
            <a
<<<<<<< HEAD
              href={site.instagramUrl}
=======
              href="https://instagram.com/sosoafrica"
>>>>>>> github/main
              target="_blank"
              rel="noopener noreferrer"
              aria-label="SOSO Africa on Instagram"
              className="text-[11px] uppercase tracking-[0.2em] soso-link"
              style={{ color: "hsl(var(--primary))" }}
            >
              Instagram
            </a>
<<<<<<< HEAD
            {site.contactEmail && <a href={`mailto:${site.contactEmail}`} className="text-[11px] uppercase tracking-[0.2em] soso-link" style={{ color: "hsl(var(--primary))" }}>{site.contactEmail}</a>}
=======
>>>>>>> github/main
          </div>
        </div>
        <div>
          <p className="text-[11px] tracking-[0.25em] uppercase mb-4" style={{ color: "hsl(var(--primary))" }}>Collection</p>
          {[
            { label: "Kaftans", href: "/collections/kaftans" },
            { label: "Agbadas", href: "/collections/agbadas" },
            { label: "Dashikis", href: "/collections/dashikis" },
            { label: "Two-Piece Sets", href: "/collections/two-piece" },
            { label: "Shirts", href: "/collections/shirts" },
            { label: "All pieces", href: "/shop" },
          ].map((link) => (
            <Link key={link.href} href={link.href} className="soso-link block text-[13px] py-1.5" style={{ color: "hsl(var(--secondary))" }}>
              {link.label}
            </Link>
          ))}
        </div>
        <div>
          <p className="text-[11px] tracking-[0.25em] uppercase mb-4" style={{ color: "hsl(var(--primary))" }}>House</p>
          <Link href="/about" className="soso-link block text-[13px] py-1.5" style={{ color: "hsl(var(--secondary))" }}>About SOSO</Link>
          <Link href="/journal" className="soso-link block text-[13px] py-1.5" style={{ color: "hsl(var(--secondary))" }}>The Journal</Link>
          <Link href="/faq" className="soso-link block text-[13px] py-1.5" style={{ color: "hsl(var(--secondary))" }}>FAQs</Link>
          <Link href="/policies" className="soso-link block text-[13px] py-1.5" style={{ color: "hsl(var(--secondary))" }}>Policies & support</Link>
          <Link href="/delivery-returns" className="soso-link block text-[13px] py-1.5" style={{ color: "hsl(var(--secondary))" }}>Delivery, returns & refunds</Link>
          <Link href="/care" className="soso-link block text-[13px] py-1.5" style={{ color: "hsl(var(--secondary))" }}>Garment care</Link>
        </div>
      </div>
      <div className="max-w-7xl mx-auto mt-12 pt-6 flex flex-wrap justify-between gap-3 text-[11px] tracking-[0.1em]" style={{ borderTop: "1px solid rgba(184,145,47,0.15)", color: "#7a715c" }}>
        <span>© SOSO Africa. Abuja, Nigeria.</span>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <Link href="/privacy" className="soso-link">Privacy & cookies</Link>
          <button type="button" onClick={openPrivacyChoices} className="soso-link">Cookie choices</button>
          <Link href="/terms" className="soso-link">Terms</Link>
          <Link href="/faq" className="soso-link">FAQs</Link>
<<<<<<< HEAD
           <Link href="/staff" className="soso-link">Staff portal</Link>
=======
>>>>>>> github/main
          <span>Prices are shown in Nigerian Naira (₦). Atelier making details are confirmed after payment.</span>
        </div>
      </div>
    </footer>
  );
}
