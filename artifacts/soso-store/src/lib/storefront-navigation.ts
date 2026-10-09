type AnchorPosition = { slug: string; ordinal: number; offset: number };
type Position = { x: number; y: number; anchor?: AnchorPosition };
type Origin = { key: string; index: number; href: string };
type Entry = { key: string; index: number; origin?: Origin };
const STATE = "sosoNavigation";
const STORAGE = "soso-navigation-positions-v1";
const positions = new Map<string, Position>();
let active: Entry | undefined;
let activeUrl = "";
let nextOrigin: Origin | undefined;
let returning = false;
let cancelRestoration = () => {};
const newKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function isImmediateStorefrontRoute(path: string) {
  return /^\/$|^\/(?:shop|women|about|faq|policies|privacy|cookies|terms|delivery-returns|delivery|returns|care|checkout|staff)\/?$|^\/(?:product|collections|journal|about|policies)\/[^/]+\/?$|^\/checkout\/return\/?$|^\/(?:sign-in|sign-up)(?:\/.*)?$|^\/newsletter\/(?:confirm|unsubscribe)\/?$/.test(path);
}
export function isHistoryReturn() { return returning; }
function entry(): Entry | undefined {
  const value = window.history.state?.[STATE];
  return value && typeof value.key === "string" && Number.isInteger(value.index) ? value : undefined;
}
function writeEntry(value: Entry) {
  const state = window.history.state;
  window.history.replaceState({ ...(state && typeof state === "object" ? state : {}), [STATE]: value }, "", window.location.href);
}
function catalogueHref() {
  if (!/^\/$|^\/shop\/?$|^\/collections\/[^/]+\/?$/.test(window.location.pathname)) return null;
  const params = new URLSearchParams();
  const source = new URLSearchParams(window.location.search);
  for (const key of ["department", "q", "category", "fulfilment", "size", "colour", "minPrice", "maxPrice", "sort"]) {
    const value = source.get(key);
    if (value !== null) params.set(key, value);
  }
  return `${window.location.pathname}${params.size ? `?${params}` : ""}`;
}
export function productReturnHref(fallback = "/shop") {
  const origin = entry()?.origin;
  return origin && /^\/$|^\/shop(?:[?]|$)|^\/collections\/[^/?]+(?:[?]|$)/.test(origin.href) ? origin.href : fallback;
}
export function returnToProductOrigin(): boolean {
  const current = entry();
  const origin = current?.origin;
  if (!current || !origin || !positions.has(origin.key)) return false;
  const distance = current.index - origin.index;
  if (distance < 1 || distance > 30) return false;
  window.history.go(-distance);
  return true;
}
function cards(slug: string) {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-soso-product-anchor]"))
    .filter((element) => element.dataset.sosoProductAnchor === slug);
}
function savePosition(anchor?: HTMLElement) {
  if (!active) return;
  const prior = positions.get(active.key)?.anchor;
  const element = anchor ?? (prior ? cards(prior.slug)[prior.ordinal] : undefined);
  const slug = element?.dataset.sosoProductAnchor;
  const position: Position = { x: window.scrollX, y: window.scrollY };
  if (element && slug) position.anchor = { slug, ordinal: cards(slug).indexOf(element), offset: element.getBoundingClientRect().top };
  positions.set(active.key, position);
  while (positions.size > 64) positions.delete(positions.keys().next().value!);
}
function persistPositions() {
  try { sessionStorage.setItem(STORAGE, JSON.stringify(Array.from(positions))); } catch { /* Memory preserves navigation when storage is unavailable. */ }
}
function restore(position: Position) {
  cancelRestoration();
  let frame = 0;
  let cancelled = false;
  const target = document.getElementById("main-content") ?? document.body;
  const attempt = () => {
    if (cancelled) return;
    const element = position.anchor ? cards(position.anchor.slug)[position.anchor.ordinal] : undefined;
    const y = element && position.anchor
      ? window.scrollY + element.getBoundingClientRect().top - position.anchor.offset
      : position.y;
    window.scrollTo({ left: position.x, top: Math.max(0, y), behavior: "instant" });
    const maximum = document.documentElement.scrollHeight - window.innerHeight;
    // Lazy pages/data may not have committed yet. Stop polling once content fits;
    // ResizeObserver still accounts for late layout/font changes.
    if ((!element && position.anchor) || maximum + 2 < position.y) frame = requestAnimationFrame(attempt);
  };
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(attempt);
  });
  const stop = () => {
    cancelled = true; cancelAnimationFrame(frame); observer.disconnect();
    clearTimeout(deadline);
    for (const event of ["wheel", "touchstart", "pointerdown", "keydown"]) window.removeEventListener(event, stop);
  };
  const deadline = window.setTimeout(stop, 4000);
  cancelRestoration = stop;
  for (const event of ["wheel", "touchstart", "pointerdown", "keydown"]) window.addEventListener(event, stop, { passive: true });
  observer.observe(target);
  frame = requestAnimationFrame(attempt);
}

/** Wouter emits pushState/replaceState events; retain state without changing its routing. */
export function installStorefrontNavigation() {
  let writing = false;
  let saveFrame = 0;
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(STORAGE) ?? "[]");
    if (Array.isArray(stored)) for (const item of stored.slice(-64)) {
      if (Array.isArray(item) && typeof item[0] === "string"
        && item[1] && Number.isFinite(item[1].x) && Number.isFinite(item[1].y)) positions.set(item[0], item[1]);
    }
  } catch { /* No storage access is required for in-document Back/Forward. */ }
  const write = (value: Entry) => { writing = true; try { writeEntry(value); } finally { writing = false; } };
  const previousRestoration = window.history.scrollRestoration;
  window.history.scrollRestoration = "manual";
  active = entry() ?? { key: newKey(), index: 0 };
  activeUrl = window.location.pathname + window.location.search;
  write(active);
  const initial = positions.get(active.key);
  returning = Boolean(initial);
  if (initial) restore(initial);

  const navigation = (event: Event) => {
    if (writing) return;
    savePosition(); persistPositions(); cancelRestoration();
    const url = window.location.pathname + window.location.search;
    if (event.type === "popstate") {
      active = entry() ?? { key: newKey(), index: 0 };
      write(active); activeUrl = url; returning = true; nextOrigin = undefined;
      restore(positions.get(active.key) ?? { x: 0, y: 0 });
    } else if (event.type === "pushState") {
      const inherited = nextOrigin ?? (url.startsWith("/product/") ? active?.origin : undefined);
      active = { key: newKey(), index: (active?.index ?? 0) + 1, ...(inherited ? { origin: inherited } : {}) };
      write(active); returning = false; nextOrigin = undefined;
      if (url !== activeUrl) window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      activeUrl = url;
    } else {
      write(active!);
      if (url !== activeUrl && window.location.pathname !== activeUrl.split("?")[0]) {
        returning = false; window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      }
      activeUrl = url;
    }
  };
  const click = (event: MouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const element = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
    if (!element || element.target === "_blank" || element.hasAttribute("download")) return;
    const url = new URL(element.href, window.location.href);
    if (url.origin !== window.location.origin || !/^\/product\/[^/]+\/?$/.test(url.pathname)) return;
    savePosition(element.closest<HTMLElement>("[data-soso-product-anchor]") ?? undefined);
    const href = catalogueHref();
    nextOrigin = href && active ? { key: active.key, index: active.index, href } : active?.origin;
    persistPositions();
  };
  const scroll = () => {
    cancelAnimationFrame(saveFrame);
    saveFrame = requestAnimationFrame(() => savePosition());
  };
  const pageHide = () => { savePosition(); persistPositions(); };
  const pageShow = (event: PageTransitionEvent) => {
    if (event.persisted && active) restore(positions.get(active.key) ?? { x: 0, y: 0 });
  };
  for (const type of ["popstate", "pushState", "replaceState"]) window.addEventListener(type, navigation);
  document.addEventListener("click", click, true);
  window.addEventListener("scroll", scroll, { passive: true });
  window.addEventListener("pagehide", pageHide);
  window.addEventListener("pageshow", pageShow);
  return () => {
    cancelRestoration(); cancelAnimationFrame(saveFrame); pageHide();
    for (const type of ["popstate", "pushState", "replaceState"]) window.removeEventListener(type, navigation);
    document.removeEventListener("click", click, true);
    window.removeEventListener("scroll", scroll);
    window.removeEventListener("pagehide", pageHide);
    window.removeEventListener("pageshow", pageShow);
    window.history.scrollRestoration = previousRestoration;
  };
}
