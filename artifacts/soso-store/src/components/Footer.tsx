import React from "react";
import { Link } from "wouter";
import { openPrivacyChoices } from "./ConsentManager";

export function Footer() {
  return (
    <footer className="px-6 lg:px-12 py-14" style={{ borderTop: `1px solid rgba(184,145,47,0.2)` }}>
      <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-10">
        <div className="md:col-span-2">
          <Link href="/">
            <img src="/images/soso/logo.png" alt="SOSO Africa" className="h-9 mb-4 cursor-pointer" />
          </Link>
          <p className="text-[13px] max-w-sm leading-relaxed" style={{ color: "hsl(var(--secondary))" }}>
            Bespoke menswear house, Abuja. Kaftans, agbadas, dashikis and shirting —
            with considered sizing guidance and stylist support.
          </p>
        </div>
        <div>
          <p className="text-[11px] tracking-[0.25em] uppercase mb-4" style={{ color: "hsl(var(--primary))" }}>Shop</p>
          {["Kaftans", "Agbadas", "Dashikis", "Two-Piece Sets", "Shirts"].map((t) => (
            <Link key={t} href="/shop" className="soso-link block text-[13px] py-1.5" style={{ color: "hsl(var(--secondary))" }}>{t}</Link>
          ))}
        </div>
        <div>
          <p className="text-[11px] tracking-[0.25em] uppercase mb-4" style={{ color: "hsl(var(--primary))" }}>House</p>
          <Link href="/journal" className="soso-link block text-[13px] py-1.5" style={{ color: "hsl(var(--secondary))" }}>The Journal</Link>
          <Link href="/policies" className="soso-link block text-[13px] py-1.5" style={{ color: "hsl(var(--secondary))" }}>Policies & support</Link>
          <Link href="/delivery-returns" className="soso-link block text-[13px] py-1.5" style={{ color: "hsl(var(--secondary))" }}>Delivery, returns & refunds</Link>
          <Link href="/care" className="soso-link block text-[13px] py-1.5" style={{ color: "hsl(var(--secondary))" }}>Garment care</Link>
          <Link href="/shop" className="soso-link block text-[13px] py-1.5" style={{ color: "hsl(var(--secondary))" }}>Sizing & stylist support</Link>
          <Link href="/shop" className="soso-link block text-[13px] py-1.5" style={{ color: "hsl(var(--secondary))" }}>Explore the collection</Link>
        </div>
      </div>
      <div className="max-w-7xl mx-auto mt-12 pt-6 flex flex-wrap justify-between gap-3 text-[11px] tracking-[0.1em]" style={{ borderTop: "1px solid rgba(184,145,47,0.15)", color: "#7a715c" }}>
        <span>© SOSO Africa. Abuja, Nigeria.</span>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <Link href="/privacy" className="soso-link">Privacy & cookies</Link>
          <button type="button" onClick={openPrivacyChoices} className="soso-link">Cookie choices</button>
          <Link href="/terms" className="soso-link">Terms</Link>
          <span>Prices are shown in Nigerian Naira (₦). Atelier making details are confirmed after payment.</span>
        </div>
      </div>
    </footer>
  );
}
