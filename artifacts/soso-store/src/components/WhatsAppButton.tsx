import React from "react";
import { Link, useLocation } from "wouter";
import { ArrowUpRight } from "lucide-react";
import { usePlatformContent } from "@/data/platformContent";

export function WhatsAppButton() {
  const [location] = useLocation();
  const { data } = usePlatformContent();

  if (location.startsWith("/product/") || location === "/checkout" || !data) {
    return null;
  }

  return (
    <Link
      href={data.content.site.floatingCta.href}
      className="fixed bottom-6 right-6 z-[90] flex items-center gap-2.5 px-5 py-3.5 text-[12px] tracking-[0.1em] uppercase font-bold soso-btn-gold"
      style={{ backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", boxShadow: "0 8px 30px rgba(0,0,0,0.5)" }}
    >
      <ArrowUpRight size={18} /> {data.content.site.floatingCta.label}
    </Link>
  );
}
