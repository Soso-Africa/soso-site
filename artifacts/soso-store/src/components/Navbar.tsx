import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useCart } from "@/context/CartContext";
import { WhatsAppIcon } from "@/components/Icons";
import { resolvedSiteContent, useSiteContent } from "@/data/siteContent";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [location] = useLocation();
  const { openDrawer, itemCount } = useCart();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: siteData } = useSiteContent();
  const site = resolvedSiteContent(siteData?.content);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  
  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    window.scrollTo(0, 0);
  }, [location]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const menu = mobileMenuRef.current;
    const focusableSelector = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusable = () => Array.from(menu?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
    const firstFocusable = focusable()[0];
    firstFocusable?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileMenuOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [mobileMenuOpen]);

  const openMobileMenu = () => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : menuButtonRef.current;
    setMobileMenuOpen(true);
  };

  return (
    <>
      <div className="text-center text-[11px] tracking-[0.22em] uppercase py-2 px-4" style={{ backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", fontWeight: 600 }}>
        {site.announcement}
      </div>

      <header
        className="sticky top-0 z-50 px-4 md:px-6 lg:px-12 flex items-center justify-between"
        style={{
          backgroundColor: scrolled ? "rgba(16,14,11,0.95)" : "rgba(16,14,11,0.7)",
          backdropFilter: "blur(14px)",
          borderBottom: `1px solid ${scrolled ? "rgba(184,145,47,0.25)" : "transparent"}`,
          height: 72,
          transition: "all .4s ease",
        }}
      >
        {/* Mobile Hamburger */}
        <button 
          className="md:hidden p-2 -ml-2 text-white" 
          onClick={() => mobileMenuOpen ? setMobileMenuOpen(false) : openMobileMenu()}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileMenuOpen}
          aria-controls="soso-mobile-menu"
          ref={menuButtonRef}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <nav className="hidden md:flex items-center gap-8 text-[12px] tracking-[0.18em] uppercase" style={{ color: "hsl(var(--secondary))" }}>
          <Link href="/shop" className="soso-link">{site.navKaftansLabel}</Link>
          <Link href="/shop" className="soso-link">{site.navAgbadasLabel}</Link>
          <Link href="/shop" className="soso-link">{site.navShirtsLabel}</Link>
        </nav>
        
        <Link href="/" className="md:absolute md:left-1/2 md:-translate-x-1/2 flex items-center justify-center">
          <img src="/images/soso/logo.png" alt="SOSO Africa" className="h-8 md:h-9" />
        </Link>
        
        <div className="flex items-center gap-3 md:gap-5">
          <a
            href={site.whatsappUrl}
            className="hidden lg:flex items-center gap-2 text-[12px] tracking-[0.12em] uppercase soso-link" 
            style={{ color: "hsl(var(--primary))" }}
          >
            <WhatsAppIcon size={16} /> Order via WhatsApp
          </a>
          <button 
            onClick={openDrawer} 
            className="flex items-center gap-2 text-[12px] tracking-[0.12em] uppercase soso-link relative"
            style={{ color: "hsl(var(--secondary))" }}
            aria-label="Open cart"
          >
            <span className="hidden sm:inline">Bag</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <path d="M16 10a4 4 0 0 1-8 0"></path>
            </svg>
            {itemCount > 0 && (
              <span className="absolute -top-1.5 -right-2 flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold" style={{ backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}>
                {itemCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div ref={mobileMenuRef} id="soso-mobile-menu" role="dialog" aria-modal="true" aria-label="Main navigation" className="fixed inset-0 z-[100] md:hidden bg-black/90 backdrop-blur-md flex flex-col p-6 animate-in fade-in duration-300">
          <div className="flex justify-between items-center mb-10">
            <img src="/images/soso/logo.png" alt="SOSO Africa" className="h-8" />
            <button type="button" aria-label="Close menu" className="text-white text-3xl opacity-70" onClick={() => setMobileMenuOpen(false)}>&times;</button>
          </div>
          <nav className="flex flex-col gap-6 text-xl soso-display tracking-widest text-center">
            <Link href="/" className="hover:text-[hsl(var(--primary))] transition-colors">Home</Link>
            <Link href="/shop" className="hover:text-[hsl(var(--primary))] transition-colors">All Collection</Link>
            <Link href="/shop" className="hover:text-[hsl(var(--primary))] transition-colors">{site.navKaftansLabel}</Link>
            <Link href="/shop" className="hover:text-[hsl(var(--primary))] transition-colors">{site.navAgbadasLabel}</Link>
            <Link href="/shop" className="hover:text-[hsl(var(--primary))] transition-colors">Two-Piece Sets</Link>
            <Link href="/shop" className="hover:text-[hsl(var(--primary))] transition-colors">{site.navShirtsLabel}</Link>
          </nav>
          <div className="mt-auto flex flex-col gap-4">
            <a href="/#whatsapp" className="w-full flex items-center justify-center gap-2 py-4 soso-btn-gold text-[12px] tracking-[0.2em] uppercase font-bold" style={{ backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }} onClick={() => setMobileMenuOpen(false)}>
              <WhatsAppIcon size={18} /> Chat with Specialist
            </a>
          </div>
        </div>
      )}
    </>
  );
}
