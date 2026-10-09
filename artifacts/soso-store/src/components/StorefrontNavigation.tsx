import { useLayoutEffect } from "react";
import { installStorefrontNavigation } from "@/lib/storefront-navigation";
import { preloadStorefrontPage } from "@/lib/storefront-page-modules";

export function StorefrontNavigation() {
  useLayoutEffect(() => {
    const stop = installStorefrontNavigation();
    const intent = (event: Event) => {
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.target === "_blank") return;
      const url = new URL(link.href, window.location.href);
      if (url.origin === window.location.origin) preloadStorefrontPage(url.pathname);
    };
    document.addEventListener("pointerover", intent, { passive: true });
    document.addEventListener("focusin", intent);
    return () => { stop(); document.removeEventListener("pointerover", intent); document.removeEventListener("focusin", intent); };
  }, []);
  return null;
}
