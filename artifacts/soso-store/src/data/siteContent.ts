import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export type SiteContent = {
  heroEyebrow: string;
  heroTitle: string;
  heroAccent: string;
  heroDescription: string;
  heroImageUrl: string;
  heroImageAlt: string;
  primaryCta: string;
  primaryCtaHref: string;
  stylistCta: string;
  announcement: string;
  footerDescription: string;
  instagramUrl: string;
  whatsappUrl: string;
  navKaftansLabel: string;
  navAgbadasLabel: string;
  navShirtsLabel: string;
  contactEmail: string;
  contactPhone: string;
};

export const defaultSiteContent: SiteContent = {
  heroEyebrow: "Bespoke Menswear · Abuja, Nigeria",
  heroTitle: "Dress like the man",
  heroAccent: "make way",
  heroDescription: "Premium kaftans, agbadas and refined separates from SOSO Africa. Explore the collection, use the size guide, or speak with a stylist before you place your order.",
  heroImageUrl: "/images/soso/vault-black.jpg",
  heroImageAlt: "Black SOSO Africa kaftan",
  primaryCta: "Shop the Collection",
  primaryCtaHref: "/shop",
  stylistCta: "Ask a stylist",
  announcement: "Fit guidance if you need it · Atelier details confirmed after payment",
  footerDescription: "Bespoke menswear house, Abuja. Kaftans, agbadas, dashikis and shirting — made to order for the individual.",
  instagramUrl: "https://instagram.com/sosoafrica",
  whatsappUrl: "/#whatsapp",
  navKaftansLabel: "Kaftans",
  navAgbadasLabel: "Agbadas",
  navShirtsLabel: "Shirts",
  contactEmail: "",
  contactPhone: "",
};

export function useSiteContent() {
  return useQuery<{ content: Partial<SiteContent> }>({
    queryKey: ["site-content"],
    queryFn: () => customFetch("/api/content/site", { responseType: "json" }),
    staleTime: 60_000,
  });
}

export function resolvedSiteContent(content?: Partial<SiteContent>) {
  return { ...defaultSiteContent, ...(content ?? {}) };
}