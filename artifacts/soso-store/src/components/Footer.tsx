import React from "react";
import { Link } from "wouter";

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
          {["Our Story", "Size help", "Delivery guidance", "Order support", "Contact / WhatsApp"].map((t) => (
            <a key={t} href="/#whatsapp" className="soso-link block text-[13px] py-1.5" style={{ color: "hsl(var(--secondary))" }}>{t}</a>
          ))}
        </div>
      </div>
      <div className="max-w-7xl mx-auto mt-12 pt-6 flex flex-wrap justify-between gap-3 text-[11px] tracking-[0.1em]" style={{ borderTop: "1px solid rgba(184,145,47,0.15)", color: "#7a715c" }}>
        <span>© SOSO Africa. Abuja, Nigeria.</span>
        <span>Prices are shown in Nigerian Naira (₦). Availability is confirmed before payment.</span>
      </div>
    </footer>
  );
}
