import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useCart } from "@/context/CartContext";
import { usePlatformContent, type CatalogProduct, type MegaMenuGroup } from "@/data/platformContent";
import { ChevronDown } from "lucide-react";
import { HeaderSearch } from "./HeaderSearch";

const isGlobalWhatsAppControl = (href: string) => /(?:wa\.me|whatsapp)/i.test(href);

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [location] = useLocation();
  const { openDrawer, itemCount } = useCart();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data } = usePlatformContent();

  const site = data?.content.site;
  const announcementItems = site?.announcementItems ?? [];
  const navigationCopy = data?.content.interfaceCopy.navigation;
  const products = data?.content.products || [];

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const desktopNavRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [announcementIndex, setAnnouncementIndex] = useState(0);
  const [isAnnouncementHovered, setIsAnnouncementHovered] = useState(false);

  const isHome = location === "/";
  const isTransparent = isHome && !scrolled && !mobileMenuOpen && !activeGroupId;
  const headerControlClass = isTransparent
    ? "text-white/90 hover:text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.45)]"
    : "text-foreground/80 hover:text-foreground";

  useEffect(() => {
    const itemCount = announcementItems.length;
    if (itemCount <= 1) {
      setAnnouncementIndex(0);
      return;
    }
    setAnnouncementIndex((previous) => previous % itemCount);
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion || isAnnouncementHovered) return;

    const interval = setInterval(() => {
      setAnnouncementIndex((prev) => (prev + 1) % itemCount);
    }, 4000);
    return () => clearInterval(interval);
  }, [announcementItems, isAnnouncementHovered]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    setScrolled(window.scrollY > 40);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close menus on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setActiveGroupId(null);
    window.scrollTo(0, 0);
  }, [location]);

  // Mobile Menu Focus Trap
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

  // Desktop Menu Event Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveGroupId(null);
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (desktopNavRef.current && !desktopNavRef.current.contains(e.target as Node)) {
        setActiveGroupId(null);
      }
    };
    if (activeGroupId) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeGroupId]);

  const openMobileMenu = () => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : menuButtonRef.current;
    setMobileMenuOpen(true);
  };

  const handleMouseEnter = (id: string) => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    setActiveGroupId(id);
  };

  const handleMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setActiveGroupId(null);
    }, 150);
  };

  const handlePanelMouseEnter = () => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
  };

  if (!site || !navigationCopy) return null;

  const hasMegaMenu = !!(site.megaMenu && site.megaMenu.length > 0);
  const visibleGroups = site.megaMenu?.filter(g => g.visible) || [];

  const isLegacyShopLink = (href: string) => (
    href === "/shop"
    || href.startsWith("/shop?")
    || href.startsWith("/collections/")
  );
  const filteredNavigation = hasMegaMenu
    ? site.navigation.filter(link => !isLegacyShopLink(link.href))
    : site.navigation;

  const filteredMobileNavigation = hasMegaMenu
    ? site.mobileNavigation.filter(link => !isLegacyShopLink(link.href))
    : site.mobileNavigation;

  return (
    <>
      {announcementItems.length > 0 && <div
        className="relative flex h-[34px] items-center justify-center overflow-hidden px-4 py-2 text-center text-[10px] uppercase tracking-[0.25em]"
        style={{ backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", fontWeight: 600 }}
        onMouseEnter={() => setIsAnnouncementHovered(true)}
        onMouseLeave={() => setIsAnnouncementHovered(false)}
      >
        {announcementItems.map((item, i) => (
            <div
              key={i}
              className={`absolute w-full px-4 transition-opacity duration-700 ease-in-out motion-reduce:transition-none ${
                i === announcementIndex ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
              }`}
              aria-hidden={i !== announcementIndex}
            >
              {item}
            </div>
          ))}
      </div>}

      <header
        className={`sticky top-0 z-50 px-4 md:px-6 lg:px-12 flex items-center justify-between transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isTransparent
            ? "bg-transparent border-transparent text-white"
            : "bg-background border-border text-foreground shadow-sm"
        }`}
        style={{
          borderBottomWidth: '1px',
          height: 72,
        }}
      >
        {/* Mobile Hamburger */}
        <button
          className={`md:hidden p-2 -ml-2 ${headerControlClass}`}
          onClick={() => mobileMenuOpen ? setMobileMenuOpen(false) : openMobileMenu()}
          aria-label={mobileMenuOpen ? site.header.closeMenuLabel : site.header.openMenuLabel}
          aria-expanded={mobileMenuOpen}
          aria-controls="soso-mobile-menu"
          ref={menuButtonRef}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Desktop Navigation */}
        <div
          ref={desktopNavRef}
          className="hidden md:flex flex-col justify-center h-full"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setActiveGroupId(null);
            }
          }}
        >
          <nav className="flex items-center gap-8 text-[12px] tracking-[0.18em] uppercase font-medium">
            {hasMegaMenu && visibleGroups.map(group => {
              const isActive = activeGroupId === group.id;
              return (
                <div
                  key={group.id}
                  className="flex items-center h-full group"
                  onMouseEnter={() => handleMouseEnter(group.id)}
                  onMouseLeave={handleMouseLeave}
                >
                  <Link
                    href={group.href}
                    className={`py-6 transition-colors duration-300 ${
                      isTransparent ? "text-white/90 hover:text-white" : isActive ? "text-foreground" : "text-foreground/80 hover:text-foreground"
                    }`}
                    onFocus={() => handleMouseEnter(group.id)}
                    aria-expanded={isActive}
                  >
                    {group.label}
                  </Link>

                  {/* Mega Menu Panel */}
                  <div
                    className={`absolute left-0 top-[72px] w-full border-t border-border shadow-2xl transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none origin-top bg-background
                      ${isActive ? 'opacity-100 translate-y-0 visible' : 'opacity-0 -translate-y-2 invisible pointer-events-none'}`}
                    onMouseEnter={handlePanelMouseEnter}
                  >
                    <DesktopMegaMenuPanel group={group} products={products} featuredLabel={navigationCopy.featuredLabel} onClick={() => setActiveGroupId(null)} />
                  </div>
                </div>
              );
            })}
            {filteredNavigation.map(link => (
              <div
                key={`${link.href}-${link.label}`}
                className="flex items-center h-full"
                onMouseEnter={() => handleMouseEnter('')}
              >
                <Link
                  href={link.href}
                  className={`py-6 transition-colors duration-300 ${
                    isTransparent ? "text-white/90 hover:text-white" : "text-foreground/80 hover:text-foreground"
                  }`}
                  onFocus={() => setActiveGroupId(null)}
                >
                  {link.label}
                </Link>
              </div>
            ))}
          </nav>
        </div>
        
        <Link href="/" className="md:absolute md:left-1/2 md:-translate-x-1/2 flex items-center justify-center transition-opacity duration-300 hover:opacity-70">
          <img src={site.logoUrl} alt={site.logoAlt} className="h-8 md:h-9" />
        </Link>
        
        <div className="flex items-center gap-4 md:gap-6">
          <HeaderSearch buttonClassName={headerControlClass} />
          <button
            onClick={openDrawer} 
            className={`flex items-center gap-2 text-[12px] tracking-[0.12em] uppercase transition-colors duration-300 relative ${headerControlClass}`}
            aria-label={site.header.openCartLabel}
          >
            <span className="hidden sm:inline font-medium">{site.header.cartLabel}</span>
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
        <div ref={mobileMenuRef} id="soso-mobile-menu" role="dialog" aria-modal="true" aria-label={site.header.mainNavigationLabel} className="fixed inset-0 z-[100] md:hidden bg-background flex flex-col overflow-hidden animate-in fade-in duration-300">
          {/* Header of mobile menu */}
          <div className="flex justify-between items-center p-4 px-6 border-b border-border shrink-0">
            <img src={site.logoUrl} alt={site.logoAlt} className="h-8" />
            <button type="button" aria-label={site.header.closeMenuLabel} className="text-foreground p-2 -mr-2 opacity-70 hover:opacity-100 transition-opacity" onClick={() => setMobileMenuOpen(false)}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-6 py-8 flex flex-col gap-8">
            {/* Mega Menu Groups (Accordions) */}
            {hasMegaMenu && (
              <div className="flex flex-col">
                {visibleGroups.map(group => (
                  <MobileMenuGroup key={group.id} group={group} products={products} navigationCopy={navigationCopy} onClick={() => setMobileMenuOpen(false)} />
                ))}
              </div>
            )}

            {/* Regular Navigation */}
            <nav className="flex flex-col gap-5 pt-4 pb-8 border-t border-border">
              {filteredMobileNavigation.map((link) => (
                <Link
                  key={`${link.href}-${link.label}`}
                  href={link.href}
                  className="text-lg soso-display tracking-[0.15em] text-foreground/90 hover:text-foreground transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

function DesktopMegaMenuPanel({ group, products, featuredLabel, onClick }: { group: MegaMenuGroup, products: CatalogProduct[], featuredLabel: string, onClick: () => void }) {
  const featuredProducts = group.featuredProductSlugs
    .map(slug => products.find(p => p.slug === slug))
    .filter((product): product is CatalogProduct => Boolean(product))
    .slice(0, 2);

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-6 lg:px-12 py-10 lg:py-16 flex justify-between gap-12 text-left">
      {/* Links Columns */}
      <div className="flex gap-16 lg:gap-24">
        {group.columns.map((col, i) => (
          <div key={i} className="flex flex-col gap-6">
            <h3 className="text-[11px] tracking-[0.2em] uppercase font-bold text-foreground">{col.heading}</h3>
            <ul className="flex flex-col gap-4">
              {col.links.filter((link) => !isGlobalWhatsAppControl(link.href)).map(link => (
                <li key={`${link.href}-${link.label}`}>
                  <Link
                    href={link.href}
                    className="text-[13px] tracking-wide text-secondary hover:text-foreground transition-colors block py-1"
                    onClick={onClick}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Featured Products */}
      {featuredProducts.length > 0 && (
        <div className="w-[500px] shrink-0 flex gap-6">
          {featuredProducts.map(product => (
            <Link
              key={product.slug}
              href={`/product/${product.slug}`}
              className="group flex-1 flex flex-col gap-4 lift"
              onClick={onClick}
            >
              <div className="aspect-[3/4] overflow-hidden bg-muted/20 relative">
                <img
                  src={product.img}
                  alt={product.name}
                  className="w-full h-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105 motion-reduce:transition-none"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-[12px] font-semibold tracking-[0.1em] text-foreground group-hover:text-secondary transition-colors uppercase">{product.name}</p>
                <p className="text-[10px] tracking-[0.15em] text-secondary uppercase">{product.merchandising.label ?? product.category ?? featuredLabel}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function MobileMenuGroup({ group, products, navigationCopy, onClick }: { group: MegaMenuGroup, products: CatalogProduct[], navigationCopy: { shopAllLabel: string; featuredLabel: string }, onClick: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const featuredProducts = group.featuredProductSlugs
    .map(slug => products.find(p => p.slug === slug))
    .filter((product): product is CatalogProduct => Boolean(product))
    .slice(0, 2);

  return (
    <div className="flex flex-col border-b border-border overflow-hidden">
      <button
        className="flex items-center justify-between py-5 w-full text-left"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className="text-xl soso-display tracking-[0.15em] uppercase text-foreground/90">{group.label}</span>
        <ChevronDown className={`w-5 h-5 text-foreground transition-transform duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] ${expanded ? 'rotate-180' : ''}`} />
      </button>

      <div className={`grid transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] ${expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden flex flex-col gap-8">
          <div className="pt-2 pb-6 flex flex-col gap-8">
            <div className="flex flex-col gap-6">
              {group.columns.map((col, i) => (
                <div key={i} className="flex flex-col gap-3">
                  {col.heading && <h4 className="text-[10px] tracking-[0.2em] uppercase text-foreground font-bold">{col.heading}</h4>}
                  <div className="flex flex-col gap-3">
                    {col.links.filter((link) => !isGlobalWhatsAppControl(link.href)).map(link => (
                      <Link key={`${link.href}-${link.label}`} href={link.href} className="text-[13px] tracking-widest text-secondary py-1" onClick={onClick}>
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
              <Link href={group.href} className="text-[11px] font-bold tracking-[0.2em] uppercase text-foreground py-2 mt-2 flex items-center gap-2 w-fit" onClick={onClick}>
                {navigationCopy.shopAllLabel} {group.label} <span aria-hidden="true">&rarr;</span>
              </Link>
            </div>

            {featuredProducts.length > 0 && (
              <div className="grid grid-cols-2 gap-4">
                {featuredProducts.map(product => (
                  <Link key={product.slug} href={`/product/${product.slug}`} className="flex flex-col gap-3 group" onClick={onClick}>
                    <div className="aspect-[3/4] overflow-hidden bg-muted/20 relative">
                      <img src={product.img} alt={product.name} className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105" loading="lazy" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-[0.1em] font-semibold text-foreground truncate">{product.name}</span>
                      <span className="text-[9px] uppercase tracking-[0.15em] text-secondary mt-0.5">{product.merchandising.label ?? navigationCopy.featuredLabel}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
