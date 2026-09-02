import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, ZoomIn, ZoomOut } from "lucide-react";
import type { CatalogProduct, PlatformContent } from "../data/platformContent";

type TurnSet = NonNullable<CatalogProduct["materialTurnSets"]>[0];
type ProductCopy = PlatformContent["productCopy"];

export interface MaterialTurnStageProps {
  sets: TurnSet[];
  productCopy: ProductCopy;
}

export function mapScrollToTurnState(scrollOffset: number, maxScroll: number, totalStates: number) {
  if (maxScroll <= 0) return { activeSetIndex: 0, activeView: "front" as const, stateFloat: 0 };
  const progress = Math.max(0, Math.min(1, scrollOffset / maxScroll));
  const stateFloat = progress * (totalStates - 1);
  const activeStateIndex = Math.round(stateFloat);
  const activeSetIndex = Math.floor(activeStateIndex / 2);
  const activeView = activeStateIndex % 2 === 0 ? ("front" as const) : ("back" as const);
  return { activeSetIndex, activeView, stateFloat };
}

export function MaterialTurnStage({ sets, productCopy }: MaterialTurnStageProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeView, setActiveView] = useState<"front" | "back">("front");
  const [zoomed, setZoomed] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const totalStates = sets.length * 2;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);
    const onChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!trackRef.current || !stickyRef.current) return;
        const trackRect = trackRef.current.getBoundingClientRect();
        const stickyRect = stickyRef.current.getBoundingClientRect();

        const maxScroll = trackRect.height - stickyRect.height;
        let scrollOffset = stickyRect.top - trackRect.top;
        if (scrollOffset < 0) scrollOffset = 0;
        if (scrollOffset > maxScroll) scrollOffset = maxScroll;

        const { activeSetIndex, activeView, stateFloat } = mapScrollToTurnState(scrollOffset, maxScroll, totalStates);
        
        setActiveIndex(Math.min(activeSetIndex, sets.length - 1));
        setActiveView(activeView);

        const activeStateIndex = Math.round(stateFloat);
        if (!prefersReducedMotion) {
          applyIllusion(stateFloat);
        } else {
          applySnap(activeStateIndex);
        }
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [totalStates, prefersReducedMotion]);

  const applyIllusion = (stateFloat: number) => {
    sets.forEach((set, setIdx) => {
      (["front", "back"] as const).forEach((view, viewIdx) => {
        const stateIdx = setIdx * 2 + viewIdx;
        const el = document.getElementById(`turn-img-wrap-${set.id}-${view}`);
        if (!el) return;

        const dist = stateFloat - stateIdx;

        if (Math.abs(dist) >= 1) {
          el.style.opacity = "0";
          el.style.pointerEvents = "none";
          el.style.transform = "translateX(" + (dist > 0 ? -5 : 5) + "%) rotateY(" + (dist > 0 ? -70 : 70) + "deg)";
          el.style.zIndex = "1";
          return;
        }

        const ease = Math.sin((dist * Math.PI) / 2);
        const rotateY = ease * -70;
        const translateX = ease * -3; // subtle sway
        const translateY = Math.abs(ease) * -2;
        const scale = 1 - Math.abs(dist) * 0.05;

        let opacity = 1 - Math.pow(Math.abs(dist), 1.5);
        opacity = Math.max(0, Math.min(1, opacity));

        el.style.opacity = opacity.toString();
        el.style.pointerEvents = Math.abs(dist) < 0.1 ? "auto" : "none";
        el.style.transform = "translateX(" + translateX + "%) translateY(" + translateY + "%) scale(" + scale + ") rotateY(" + rotateY + "deg)";
        el.style.zIndex = Math.abs(dist) < 0.5 ? "10" : "5";
      });
    });
  };

  const applySnap = (activeStateIndex: number) => {
    sets.forEach((set, setIdx) => {
      (["front", "back"] as const).forEach((view, viewIdx) => {
        const stateIdx = setIdx * 2 + viewIdx;
        const el = document.getElementById(`turn-img-wrap-${set.id}-${view}`);
        if (!el) return;
        const isActive = stateIdx === activeStateIndex;
        el.style.opacity = isActive ? "1" : "0";
        el.style.pointerEvents = isActive ? "auto" : "none";
        el.style.transform = "none";
        el.style.zIndex = isActive ? "10" : "5";
      });
    });
  };

  const scrollToState = (stateIdx: number) => {
    if (!trackRef.current || !stickyRef.current) return;
    const trackRect = trackRef.current.getBoundingClientRect();
    const stickyRect = stickyRef.current.getBoundingClientRect();
    
    const trackTopDoc = window.scrollY + trackRect.top;
    const stickyOffset = stickyRect.top;
    const maxScroll = trackRect.height - stickyRect.height;
    
    const targetScrollOffset = maxScroll > 0 ? (stateIdx / (totalStates - 1)) * maxScroll : 0;
    const targetScrollY = trackTopDoc - stickyOffset + targetScrollOffset;

    window.scrollTo({ top: targetScrollY, behavior: prefersReducedMotion ? "auto" : "smooth" });
  };

  const activeSet = sets[activeIndex];
  const activeImg = activeSet[activeView];

  return (
    <div ref={trackRef} className="relative w-full" style={{ height: (totalStates * 100) + "vh" }}>
      <div 
        ref={stickyRef} 
        className="sticky top-[80px] w-full h-[calc(100vh-140px)] min-h-[28rem] md:h-[calc(100vh-120px)] bg-background overflow-hidden flex flex-col group"
      >
        <div aria-live="polite" className="sr-only">{["Showing material ", activeSet.label, " ", activeView, " view"].join("")}</div>

        <div className="flex-1 relative" style={{ perspective: "1500px", transformStyle: "preserve-3d" }}>
           {sets.map((set) => (
             <div key={set.id} className="absolute inset-0 pointer-events-none">
                {(["front", "back"] as const).map((view) => (
                   <div 
                     key={set.id + "-" + view}
                     id={"turn-img-wrap-" + set.id + "-" + view}
                     className="absolute inset-0 origin-center pointer-events-none"
                     style={{ opacity: 0 }}
                   >
                     <img
                       src={set[view].src}
                       alt={set[view].alt}
                        className="absolute inset-0 w-full h-full object-cover origin-center transition-transform duration-500 ease-out motion-reduce:transition-none"
                       style={{ transform: zoomed && activeSet.id === set.id && activeView === view ? "scale(1.8)" : "scale(1)" }}
                     />
                   </div>
                ))}
             </div>
           ))}

           {/* Controls Overlay */}
           <div className="absolute inset-0 pointer-events-none z-20 flex flex-col justify-between p-4">
              <div className="flex justify-between items-start">
                 <div className="text-[10px] tracking-[0.25em] uppercase px-3 py-1.5 pointer-events-auto bg-white/90 text-foreground backdrop-blur-sm border border-border transition-opacity motion-reduce:transition-none">
                  {activeSet.label}
                </div>
              </div>

              <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-2 pointer-events-auto">
                <button
                  type="button"
                  onClick={() => {
                    const curIdx = activeIndex * 2 + (activeView === "front" ? 0 : 1);
                    if (curIdx > 0) scrollToState(curIdx - 1);
                  }}
                  disabled={activeIndex === 0 && activeView === "front"}
                  className="w-10 h-10 flex items-center justify-center bg-background/80 text-foreground backdrop-blur-sm border border-border disabled:opacity-40 transition-opacity motion-reduce:transition-none"
                  aria-label={productCopy.previousImageLabel}
                  data-testid="button-turn-stage-prev"
                >
                  <ChevronUp size={20} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const curIdx = activeIndex * 2 + (activeView === "front" ? 0 : 1);
                    if (curIdx < totalStates - 1) scrollToState(curIdx + 1);
                  }}
                  disabled={activeIndex === sets.length - 1 && activeView === "back"}
                  className="w-10 h-10 flex items-center justify-center bg-background/80 text-foreground backdrop-blur-sm border border-border disabled:opacity-40 transition-opacity motion-reduce:transition-none"
                  aria-label={productCopy.nextImageLabel}
                  data-testid="button-turn-stage-next"
                >
                  <ChevronDown size={20} />
                </button>
              </div>

              <div className="flex justify-between items-end">
                <div className="flex gap-2 pointer-events-auto">
                  <button
                    type="button"
                    onClick={() => scrollToState(activeIndex * 2)}
                    className={"px-4 py-2 text-[10px] font-bold tracking-[0.2em] uppercase backdrop-blur-sm transition-all motion-reduce:transition-none border " + (activeView === "front" ? "bg-foreground text-background border-foreground" : "bg-background/90 text-foreground border-border hover:bg-background")}
                  >
                    Front
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToState(activeIndex * 2 + 1)}
                    className={"px-4 py-2 text-[10px] font-bold tracking-[0.2em] uppercase backdrop-blur-sm transition-all motion-reduce:transition-none border " + (activeView === "back" ? "bg-foreground text-background border-foreground" : "bg-background/90 text-foreground border-border hover:bg-background")}
                  >
                    Back
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setZoomed((z) => !z)}
                  className="flex min-h-10 min-w-10 items-center justify-center bg-white/90 text-foreground backdrop-blur-sm border border-border pointer-events-auto transition-transform active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100"
                  aria-label={zoomed ? productCopy.zoomOutImageLabel : productCopy.zoomInImageLabel}
                  aria-pressed={zoomed}
                  data-testid="button-gallery-zoom"
                >
                  {zoomed ? <ZoomOut size={18} /> : <ZoomIn size={18} />}
                </button>
              </div>
           </div>
        </div>

        {/* Thumbnails Row */}
        <div className="flex gap-3 mt-3 overflow-x-auto pb-2 snap-x hide-scrollbar px-1 pointer-events-auto">
          {sets.map((set, i) => (
            <button
              key={set.id}
              type="button"
              onClick={() => scrollToState(i * 2)}
              className="w-16 shrink-0 snap-start overflow-hidden relative group motion-reduce:transition-none"
              style={{
                outline: i === activeIndex ? `2px solid hsl(var(--foreground))` : "1px solid hsl(var(--border))",
                outlineOffset: 2,
                opacity: i === activeIndex ? 1 : 0.6
              }}
              aria-label={"View " + set.label}
              aria-current={i === activeIndex}
              data-testid={"button-turn-stage-thumb-" + set.id}
            >
              <img src={set.front.src} alt={set.front.alt} className="aspect-[3/4] object-cover w-full group-hover:scale-105 transition-transform duration-500 motion-reduce:transition-none motion-reduce:group-hover:scale-100" />
              {i !== activeIndex && (
                <div className="absolute inset-0 bg-background/20 group-hover:bg-transparent transition-colors motion-reduce:transition-none" />
              )}
            </button>
          ))}
        </div>

        {(activeImg.provenance?.credit || activeImg.provenance?.source) && (
          <p className="mt-2 text-[10px] uppercase tracking-wider opacity-55">
            {productCopy.imageCreditLabel}: {activeImg.provenance.credit || activeImg.provenance.source}
          </p>
        )}
      </div>
    </div>
  );
}
