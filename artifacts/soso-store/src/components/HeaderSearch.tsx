import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Search, X, ArrowRight } from "lucide-react";
import { Link, useLocation } from "wouter";
import { usePlatformContent } from "@/data/platformContent";
import { naira } from "@/lib/utils";
import { trackStorefrontEvent } from "@/components/ConsentManager";

export function HeaderSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { data } = usePlatformContent();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [location, setLocation] = useLocation();

  const products = data?.content.products ?? [];
  const collections = data?.content.collections ?? [];

  const siteHeader = data?.content.site.header;
  const searchCopy = data?.content.interfaceCopy.search;
  if (!siteHeader || !searchCopy) return null;

  const searchSuggestions = siteHeader.searchSuggestions;
  const closeSearchLabel = siteHeader.closeSearchLabel;
  const compactCloseSearchLabel = closeSearchLabel.split(/\s+/)[0] || closeSearchLabel;

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 100);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          setIsOpen(false);
          return;
        }

        const focusableElements = containerRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusableElements || focusableElements.length === 0) return;
        
        const elements = Array.from(focusableElements);
        const currentIndex = elements.indexOf(document.activeElement as HTMLElement);

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % elements.length;
          elements[nextIndex]?.focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const prevIndex = currentIndex <= 0 ? elements.length - 1 : currentIndex - 1;
          elements[prevIndex]?.focus();
        } else if (e.key === 'Tab') {
          if (e.shiftKey) {
            if (currentIndex === 0 || currentIndex === -1) {
              e.preventDefault();
              elements[elements.length - 1]?.focus();
            }
          } else {
            if (currentIndex === elements.length - 1) {
              e.preventDefault();
              elements[0]?.focus();
            }
          }
        }
      };
      
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";

      return () => {
        window.clearTimeout(focusTimer);
        document.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = "";
        previousFocusRef.current?.focus();
      };
    }
    return undefined;
  }, [isOpen]);

  useEffect(() => {
    setIsOpen(false);
    setQuery("");
  }, [location]);

  const q = query.trim().toLowerCase();
  
  const searchResults = q
    ? products.filter((p) => 
        p.name.toLowerCase().includes(q) || 
        p.category.toLowerCase().includes(q) ||
        p.searchableTerms.some((t) => t.toLowerCase().includes(q))
      ).slice(0, 4)
    : [];

  const collectionResults = q
    ? collections.filter((c) => 
        c.label.toLowerCase().includes(q) || 
        c.category.toLowerCase().includes(q)
      ).slice(0, 2)
    : [];

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex min-h-10 min-w-10 items-center justify-center text-secondary transition-colors hover:text-primary"
        aria-label={siteHeader.searchLabel}
        data-testid="button-header-search"
      >
        <Search size={18} aria-hidden="true" />
      </button>

      {isOpen && createPortal(
        <div 
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-label={siteHeader.searchLabel}
          className="fixed inset-0 z-[100] flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-background/95 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div className="flex w-full shrink-0 items-center gap-2 border-b border-border bg-background px-4 py-4 md:gap-4 md:px-6 lg:px-12">
            <Search className="h-5 w-5 shrink-0 text-secondary" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              aria-label={siteHeader.searchLabel}
              placeholder={siteHeader.searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-secondary md:text-lg"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && query.trim()) {
                  setLocation(`/shop?q=${encodeURIComponent(query.trim())}`);
                  trackStorefrontEvent("cta_clicked", { ctaLabel: "global_search" });
                  setIsOpen(false);
                }
              }}
              data-testid="input-global-search"
            />
            {query && (
              <button 
                onClick={() => setQuery("")}
                className="shrink-0 p-2 text-secondary hover:text-foreground"
                aria-label={siteHeader.clearSearchLabel}
                data-testid="button-clear-search-input"
              >
                <X size={18} />
              </button>
            )}
            <button 
              onClick={() => setIsOpen(false)}
              className="ml-1 shrink-0 whitespace-nowrap text-xs font-semibold uppercase tracking-widest text-foreground hover:opacity-80 md:ml-4 md:text-sm"
              aria-label={closeSearchLabel}
              data-testid="button-close-search"
            >
              <span className="sm:hidden">{compactCloseSearchLabel}</span>
              <span className="hidden sm:inline">{closeSearchLabel}</span>
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 md:px-6 md:py-8 lg:px-12">
            <div className="max-w-screen-xl mx-auto">
              {!q && searchSuggestions.length > 0 && (
                <div>
                  <h3 className="text-[11px] uppercase tracking-[0.2em] text-secondary/70 mb-6">
                    {siteHeader.searchSuggestionsLabel}
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {searchSuggestions.map((suggestion, index) => (
                      <Link 
                        key={`${suggestion.href}-${suggestion.label}`}
                        href={suggestion.href}
                        onClick={() => {
                          if (suggestion.href.startsWith("/product/")) {
                            window.sessionStorage.setItem("soso-return-to", "/shop");
                          }
                          setIsOpen(false);
                        }}
                        className="inline-block px-4 py-2 border border-border text-sm uppercase tracking-widest text-secondary hover:border-foreground hover:text-foreground transition-colors"
                        data-testid={`link-search-suggestion-${index}`}
                      >
                        {suggestion.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {q && searchResults.length === 0 && collectionResults.length === 0 && (
                <div className="text-center py-20">
                  <p className="text-lg text-secondary">{searchCopy.emptyResultsMessage}</p>
                  <p className="text-sm text-secondary/70 mt-2">{searchCopy.emptyResultsHelp}</p>
                  <button 
                    onClick={() => {
                        setLocation(`/shop?q=${encodeURIComponent(query.trim())}`);
                        setIsOpen(false);
                    }}
                    className="mt-6 inline-flex items-center gap-2 text-[11px] uppercase tracking-widest text-background border border-foreground bg-foreground px-6 py-3 hover:opacity-90 transition-colors"
                    data-testid="button-search-entire-catalogue"
                  >
                    {searchCopy.searchCatalogueLabel} <ArrowRight size={14} />
                  </button>
                </div>
              )}

              {q && (searchResults.length > 0 || collectionResults.length > 0) && (
                <div className="grid md:grid-cols-12 gap-10">
                  <div className="md:col-span-8">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-[11px] uppercase tracking-[0.2em] text-secondary/70">{searchCopy.productsHeading}</h3>
                      <Link 
                        href={`/shop?q=${encodeURIComponent(q)}`} 
                        onClick={() => setIsOpen(false)} 
                        className="text-[11px] uppercase tracking-widest text-foreground font-medium flex items-center gap-1 hover:underline underline-offset-4"
                        data-testid="link-view-all-products"
                      >
                        {searchCopy.viewAllLabel} <ArrowRight size={12} />
                      </Link>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
                      {searchResults.map((p) => (
                        <Link
                          key={p.slug}
                          href={`/product/${p.slug}`}
                          onClick={() => {
                            window.sessionStorage.setItem("soso-return-to", `/shop?q=${encodeURIComponent(query.trim())}`);
                            setIsOpen(false);
                          }}
                          className="group block"
                          data-testid={`link-search-result-${p.slug}`}
                        >
                          <div className="aspect-[3/4] bg-muted/20 border border-border overflow-hidden mb-3">
                            <img src={p.img} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                          </div>
                          <p className="soso-display text-base text-foreground group-hover:text-secondary transition-colors">{p.name}</p>
                          <p className="text-sm text-secondary mt-1">{naira(p.price)}</p>
                        </Link>
                      ))}
                    </div>
                  </div>
                  
                  {collectionResults.length > 0 && (
                    <div className="md:col-span-4 border-t md:border-t-0 md:border-l border-border pt-8 md:pt-0 md:pl-10">
                      <h3 className="text-[11px] uppercase tracking-[0.2em] text-secondary/70 mb-6">{searchCopy.collectionsHeading}</h3>
                      <div className="space-y-4">
                        {collectionResults.map((c) => (
                          <Link key={c.slug} href={`/collections/${c.slug}`} onClick={() => setIsOpen(false)} className="block p-4 border border-border hover:border-foreground transition-colors group" data-testid={`link-search-collection-${c.slug}`}>
                            <p className="text-[10px] uppercase tracking-widest text-secondary mb-1">{c.category}</p>
                            <p className="soso-display text-lg text-foreground group-hover:text-secondary transition-colors">{c.label}</p>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
