import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useCart } from "@/context/CartContext";
import { WhatsAppIcon } from "@/components/Icons";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [location] = useLocation();
  const { openDrawer, itemCount } = useCart();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  return (
    <>
      <div className="text-center text-[11px] tracking-[0.22em] uppercase py-2 px-4" style={{ backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", fontWeight: 600 }}>
        Fit guidance before you buy &nbsp;&middot;&nbsp; Availability confirmed before payment
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
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <nav className="hidden md:flex items-center gap-8 text-[12px] tracking-[0.18em] uppercase" style={{ color: "hsl(var(--secondary))" }}>
          <Link href="/shop" className="soso-link">Kaftans</Link>
          <Link href="/shop" className="soso-link">Agbadas</Link>
          <Link href="/shop" className="soso-link">Shirts</Link>
        </nav>
        
        <Link href="/" className="md:absolute md:left-1/2 md:-translate-x-1/2 flex items-center justify-center">
          <img src="/images/soso/logo.png" alt="SOSO Africa" className="h-8 md:h-9" />
        </Link>
        
        <div className="flex items-center gap-3 md:gap-5">
          <a
            href="/#whatsapp"
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
        <div className="fixed inset-0 z-[100] md:hidden bg-black/90 backdrop-blur-md flex flex-col p-6 animate-in fade-in duration-300">
          <div className="flex justify-between items-center mb-10">
            <img src="/images/soso/logo.png" alt="SOSO Africa" className="h-8" />
            <button className="text-white text-3xl opacity-70" onClick={() => setMobileMenuOpen(false)}>&times;</button>
          </div>
          <nav className="flex flex-col gap-6 text-xl soso-display tracking-widest text-center">
            <Link href="/" className="hover:text-[hsl(var(--primary))] transition-colors">Home</Link>
            <Link href="/shop" className="hover:text-[hsl(var(--primary))] transition-colors">All Collection</Link>
            <Link href="/shop" className="hover:text-[hsl(var(--primary))] transition-colors">Kaftans</Link>
            <Link href="/shop" className="hover:text-[hsl(var(--primary))] transition-colors">Agbadas</Link>
            <Link href="/shop" className="hover:text-[hsl(var(--primary))] transition-colors">Two-Piece Sets</Link>
            <Link href="/shop" className="hover:text-[hsl(var(--primary))] transition-colors">Shirts</Link>
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
