import React from "react";
import { useLocation } from "wouter";
import { WhatsAppIcon } from "./Icons";

export function WhatsAppButton() {
  const [location] = useLocation();

  if (location.startsWith("/product/") || location === "/checkout") {
    return null;
  }

  return (
    <a
      href="/#whatsapp"
      className="fixed bottom-6 right-6 z-[90] flex items-center gap-2.5 px-5 py-3.5 text-[12px] tracking-[0.1em] uppercase font-bold soso-btn-gold"
      style={{ backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", boxShadow: "0 8px 30px rgba(0,0,0,0.5)" }}
    >
      <WhatsAppIcon size={18} /> Order Now
    </a>
  );
}
