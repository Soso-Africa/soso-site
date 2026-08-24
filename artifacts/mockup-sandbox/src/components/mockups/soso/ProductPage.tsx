import { useEffect, useRef, useState } from "react";

// ————————————————————————————————————————————————
// SOSO Africa — "Vault" Product Page (conversion-first mockup)
// Aesthetic: Lagos Luxe — editorial black/ivory with gold accents,
// Fraunces display + DM Sans body, slow confident reveals.
// ————————————————————————————————————————————————

const GOLD = "#B8912F";
const INK = "#121110";
const IVORY = "#F7F3EB";
const IVORY_DIM = "#EFE8DA";

const SIZES = ["S", "M", "L", "XL", "XXL", "Custom"];

const REVIEWS = [
  {
    name: "Emeka O.",
    city: "Abuja",
    rating: 5,
    title: "Wore it to my brother's wedding",
    body: "The fabric alone announces itself before you enter the room. Three people asked for my tailor — I told them SOSO isn't a tailor, it's a house. Fit was exact from the size guide.",
    verified: true,
  },
  {
    name: "Tunde A.",
    city: "Lagos",
    rating: 5,
    title: "Delivered to Lekki in 2 days",
    body: "I was skeptical about paying ₦250k online. Messaged them on WhatsApp, got a video of the actual piece before dispatch. That is how you sell premium in Nigeria.",
    verified: true,
  },
  {
    name: "Chidi N.",
    city: "London, UK",
    rating: 4,
    title: "Diaspora order, zero stress",
    body: "Shipped to London in 6 days with tracking. The black is deeper in person — photos undersell it. Only wish the cuff came in a second style.",
    verified: true,
  },
];

const LOOK = [
  { src: "/__mockup/images/soso/agbada.jpg", name: "The Sovereign Agbada", price: "₦450,000" },
  { src: "/__mockup/images/soso/kaftan-white.jpg", name: "Vault — Ivory", price: "₦250,000" },
  { src: "/__mockup/images/soso/twopiece.jpg", name: "Meridian Two-Piece", price: "₦320,000" },
  { src: "/__mockup/images/soso/shirts.jpg", name: "Ascot Shirt", price: "₦150,000" },
];

function useReveal() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, seen };
}

function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const { ref, seen } = useReveal();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: seen ? 1 : 0,
        transform: seen ? "translateY(0)" : "translateY(28px)",
        transition: `opacity 0.9s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.9s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex gap-[2px]" aria-label={`${n} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill={i <= n ? GOLD : "#3a352c"}>
          <path d="M12 2l2.9 6.6 7.1.6-5.4 4.8 1.6 7-6.2-3.8L5.8 21l1.6-7L2 9.2l7.1-.6L12 2z" />
        </svg>
      ))}
    </span>
  );
}

function WhatsAppIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.5 14.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07a8.2 8.2 0 0 1-2.4-1.49 9 9 0 0 1-1.66-2.07c-.17-.3-.02-.46.13-.6.14-.14.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.5 0 1.47 1.07 2.9 1.22 3.1.15.2 2.11 3.22 5.1 4.52.71.3 1.27.49 1.7.63.72.23 1.37.2 1.88.12.58-.09 1.76-.72 2-1.42.25-.7.25-1.3.18-1.42-.08-.12-.28-.2-.58-.35zM12.05 21.8h-.01a9.8 9.8 0 0 1-5-1.37l-.36-.21-3.72.97.99-3.62-.23-.37a9.77 9.77 0 1 1 8.33 4.6zM12.04.5A11.5 11.5 0 0 0 2.1 17.75L.5 23.5l5.9-1.55A11.5 11.5 0 1 0 12.04.5z" />
    </svg>
  );
}

export function ProductPage() {
  const [size, setSize] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [img, setImg] = useState(0);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 60);
    return () => clearTimeout(t);
  }, []);

  const gallery = [
    { src: "/__mockup/images/soso/vault-black.jpg", label: "Studio" },
    { src: "/__mockup/images/soso/kaftan-white.jpg", label: "Vault in Ivory" },
    { src: "/__mockup/images/soso/twopiece.jpg", label: "House cut" },
  ];

  const needSize = size === null;

  return (
    <div style={{ background: IVORY, color: INK, fontFamily: "'DM Sans', sans-serif" }} className="min-h-[100dvh]">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600&family=DM+Sans:wght@300;400;500;600&display=swap"
        rel="stylesheet"
      />
      <style>{`
        .serif { font-family: 'Fraunces', serif; }
        .gold { color: ${GOLD}; }
        .lift { transition: transform .5s cubic-bezier(.16,1,.3,1), box-shadow .5s; }
        .lift:hover { transform: translateY(-4px); }
        .imgzoom img { transition: transform 1.2s cubic-bezier(.16,1,.3,1); }
        .imgzoom:hover img { transform: scale(1.045); }
        @keyframes marquee { from { transform: translateX(0);} to { transform: translateX(-50%);} }
      `}</style>

      {/* Announcement bar */}
      <div className="text-center text-[11px] tracking-[0.22em] uppercase py-2" style={{ background: INK, color: IVORY }}>
        <span className="gold">Free delivery within Abuja</span>&nbsp;&nbsp;·&nbsp;&nbsp;Nationwide in 2–4 days&nbsp;&nbsp;·&nbsp;&nbsp;Worldwide shipping
      </div>

      {/* Nav */}
      <header className="flex items-center justify-between px-6 md:px-12 py-4 border-b" style={{ borderColor: "#e4dccb" }}>
        <nav className="hidden md:flex gap-8 text-[12px] tracking-[0.18em] uppercase opacity-80">
          <span className="cursor-pointer hover:opacity-100">Kaftans</span>
          <span className="cursor-pointer hover:opacity-100">Agbadas</span>
          <span className="cursor-pointer hover:opacity-100">Two-Piece</span>
        </nav>
        <img src="/__mockup/images/soso/logo.png" alt="SOSO Africa" className="h-10 md:h-12" />
        <div className="hidden md:flex gap-8 text-[12px] tracking-[0.18em] uppercase opacity-80">
          <span className="cursor-pointer hover:opacity-100">Bespoke</span>
          <span className="cursor-pointer hover:opacity-100">The House</span>
          <span className="cursor-pointer hover:opacity-100">Bag (0)</span>
        </div>
      </header>

      {/* ————— HERO / BUY BLOCK ————— */}
      <main className="max-w-[1280px] mx-auto px-6 md:px-12 grid md:grid-cols-2 gap-10 md:gap-16 pt-8 md:pt-14 pb-16">
        {/* Gallery */}
        <div
          style={{
            opacity: loaded ? 1 : 0,
            transform: loaded ? "none" : "translateY(24px)",
            transition: "opacity 1s cubic-bezier(.16,1,.3,1), transform 1s cubic-bezier(.16,1,.3,1)",
          }}
        >
          <div className="relative overflow-hidden imgzoom" style={{ background: INK }}>
            <img src={gallery[img].src} alt="Vault kaftan in black" className="w-full aspect-[2/3] object-cover" />
            <div className="absolute top-4 left-4 text-[10px] tracking-[0.25em] uppercase px-3 py-1.5" style={{ background: "rgba(18,17,16,.75)", color: GOLD, backdropFilter: "blur(4px)" }}>
              Signature Collection
            </div>
          </div>
          <div className="flex gap-3 mt-3">
            {gallery.map((g, i) => (
              <button
                key={g.src}
                onClick={() => setImg(i)}
                className="w-20 overflow-hidden"
                style={{ outline: i === img ? `2px solid ${GOLD}` : "1px solid #d8cfba", outlineOffset: 2 }}
                aria-label={g.label}
              >
                <img src={g.src} alt={g.label} className="aspect-[3/4] object-cover w-full" />
              </button>
            ))}
          </div>
        </div>

        {/* Buy panel */}
        <div
          style={{
            opacity: loaded ? 1 : 0,
            transform: loaded ? "none" : "translateY(24px)",
            transition: "opacity 1s cubic-bezier(.16,1,.3,1) .15s, transform 1s cubic-bezier(.16,1,.3,1) .15s",
          }}
        >
          <p className="text-[11px] tracking-[0.3em] uppercase gold mb-3">Kaftans · Made in Abuja</p>
          <h1 className="serif text-5xl md:text-6xl font-light leading-[1.02]">Vault</h1>
          <p className="serif text-lg mt-2 opacity-70 italic">The kaftan you reach for when the room matters.</p>

          <div className="flex items-center gap-4 mt-5">
            <span className="text-2xl font-medium tracking-wide">₦250,000</span>
            <span className="flex items-center gap-2 text-sm opacity-80">
              <Stars n={5} /> 4.9 · 38 reviews
            </span>
          </div>

          <p className="mt-6 text-[15px] leading-relaxed opacity-85 max-w-md">
            Cut from midnight-black Italian cashmere-wool, finished by hand in our Abuja atelier.
            A concealed placket, structured shoulder and the SOSO signature cuff — designed to be
            the most serious garment in any room it enters.
          </p>

          {/* Size */}
          <div className="mt-8">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[12px] tracking-[0.2em] uppercase font-medium">Select size</span>
              <button onClick={() => setGuideOpen(true)} className="text-[12px] underline underline-offset-4 gold hover:opacity-70">
                Size guide & fit help
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {SIZES.map((s) => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className="px-5 py-2.5 text-sm tracking-wide transition-all duration-300"
                  style={
                    size === s
                      ? { background: INK, color: IVORY, border: `1px solid ${INK}` }
                      : { background: "transparent", color: INK, border: "1px solid #c8bda2" }
                  }
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="text-[12px] mt-2 opacity-60">
              {size === "Custom"
                ? "Our atelier will contact you for measurements within 24 hours."
                : "Between sizes? Size up — the Vault is cut for a regal drape."}
            </p>
          </div>

          {/* CTAs */}
          <div className="mt-7 space-y-3">
            <button
              className="w-full py-4 text-[13px] tracking-[0.25em] uppercase font-medium transition-all duration-300"
              style={{
                background: needSize ? "#2a2723" : INK,
                color: IVORY,
                boxShadow: needSize ? "none" : `inset 0 0 0 1px ${GOLD}`,
              }}
              onClick={() => !needSize && undefined}
            >
              {needSize ? "Select a size to continue" : `Add to bag — ₦250,000 · Size ${size}`}
            </button>
            <button
              className="w-full py-4 text-[13px] tracking-[0.2em] uppercase flex items-center justify-center gap-2 transition-colors duration-300 hover:bg-[#0f3d2e] hover:text-white"
              style={{ border: "1px solid #128C56", color: "#0f6b43" }}
            >
              <WhatsAppIcon /> Ask about this piece on WhatsApp
            </button>
            <p className="text-center text-[12px] opacity-60">
              Speak to a stylist before you buy — photos, videos, fit advice. Replies in minutes, 9am–9pm WAT.
            </p>
          </div>

          {/* Trust strip */}
          <div className="grid grid-cols-3 gap-px mt-8" style={{ background: "#d8cfba" }}>
            {[
              ["2–4 days", "Nationwide delivery, tracked"],
              ["7-day", "Exchange & fit adjustment"],
              ["Pay on WhatsApp", "Transfer, card or Paystack"],
            ].map(([a, b]) => (
              <div key={a} className="p-4 text-center" style={{ background: IVORY_DIM }}>
                <p className="text-sm font-semibold">{a}</p>
                <p className="text-[11px] opacity-60 mt-1 leading-snug">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Marquee */}
      <div className="overflow-hidden py-4 border-y" style={{ borderColor: "#e0d7c4", background: INK, color: IVORY }}>
        <div className="flex whitespace-nowrap" style={{ animation: "marquee 28s linear infinite", width: "max-content" }}>
          {[0, 1].map((k) => (
            <span key={k} className="serif text-lg tracking-wide">
              {Array(4)
                .fill("The Architect of the Modern Man")
                .map((t, i) => (
                  <span key={i} className="mx-8">
                    <span className="gold mr-8">✦</span>
                    {t}
                  </span>
                ))}
            </span>
          ))}
        </div>
      </div>

      {/* ————— STORY ————— */}
      <section className="max-w-[1280px] mx-auto px-6 md:px-12 py-20 grid md:grid-cols-2 gap-12 items-center">
        <Reveal>
          <div className="overflow-hidden imgzoom">
            <img src="/__mockup/images/soso/dashiki.jpg" alt="SOSO atelier craftsmanship" className="w-full aspect-[4/5] object-cover" />
          </div>
        </Reveal>
        <div>
          <Reveal>
            <p className="text-[11px] tracking-[0.3em] uppercase gold mb-4">The craft</p>
            <h2 className="serif text-4xl md:text-5xl font-light leading-tight">Forty-one hours of hands. One garment.</h2>
          </Reveal>
          <Reveal delay={120}>
            <div className="mt-8 space-y-6 text-[15px] leading-relaxed opacity-85 max-w-md">
              <p>
                <span className="font-semibold">The fabric.</span> Midnight-black cashmere-wool blend, milled in Biella, Italy.
                It holds structure in Abuja heat and drapes without wrinkling through a full owambe.
              </p>
              <p>
                <span className="font-semibold">The construction.</span> Hand-set shoulders, a concealed six-button placket,
                and French-seamed interiors — the inside is finished as carefully as the outside.
              </p>
              <p>
                <span className="font-semibold">The cut.</span> Our signature "architect's line": sharp through the shoulder,
                generous through the body. Commands a room seated or standing.
              </p>
            </div>
          </Reveal>
          <Reveal delay={220}>
            <div className="flex gap-10 mt-10">
              {[
                ["41 hrs", "Hand-finishing"],
                ["1 of 40", "Per production run"],
                ["Biella", "Fabric origin"],
              ].map(([a, b]) => (
                <div key={a}>
                  <p className="serif text-3xl gold">{a}</p>
                  <p className="text-[11px] tracking-[0.15em] uppercase opacity-60 mt-1">{b}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ————— DELIVERY & RETURNS ————— */}
      <section style={{ background: INK, color: IVORY }} className="py-20">
        <div className="max-w-[1280px] mx-auto px-6 md:px-12">
          <Reveal>
            <p className="text-[11px] tracking-[0.3em] uppercase gold mb-4">No surprises</p>
            <h2 className="serif text-4xl md:text-5xl font-light">Buying ₦250k online should feel safe. Here it is, in writing.</h2>
          </Reveal>
          <div className="grid md:grid-cols-4 gap-px mt-12" style={{ background: "#2c2820" }}>
            {[
              ["Delivery", "Free same-day in Abuja. Lagos & nationwide in 2–4 days via GIG, fully tracked. Worldwide via DHL in 5–8 days."],
              ["Before dispatch", "We send you photos and a video of your exact piece on WhatsApp before it leaves the atelier."],
              ["Fit guarantee", "If the fit isn't right, we adjust or exchange within 7 days. Abuja clients get a same-week atelier fitting."],
              ["Payment", "Card, bank transfer or Paystack. Diaspora orders in USD or GBP. Receipt issued for every order."],
            ].map(([t, b], i) => (
              <Reveal key={t} delay={i * 100}>
                <div className="p-8 h-full" style={{ background: "#181613" }}>
                  <p className="serif text-xl gold mb-3">{t}</p>
                  <p className="text-sm leading-relaxed opacity-75">{b}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ————— REVIEWS ————— */}
      <section className="max-w-[1280px] mx-auto px-6 md:px-12 py-20">
        <Reveal>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-12">
            <div>
              <p className="text-[11px] tracking-[0.3em] uppercase gold mb-3">Worn to the moments that matter</p>
              <h2 className="serif text-4xl md:text-5xl font-light">38 men. 4.9 stars.</h2>
            </div>
            <div className="flex items-center gap-3">
              <Stars n={5} />
              <span className="text-sm opacity-70">Verified purchases only</span>
            </div>
          </div>
        </Reveal>
        <div className="grid md:grid-cols-3 gap-6">
          {REVIEWS.map((r, i) => (
            <Reveal key={r.name} delay={i * 120}>
              <div className="p-7 h-full lift" style={{ background: "#fff", border: "1px solid #e6ddc9", boxShadow: "0 1px 0 #e6ddc9" }}>
                <Stars n={r.rating} />
                <p className="serif text-xl mt-4">{r.title}</p>
                <p className="text-sm leading-relaxed opacity-75 mt-3">{r.body}</p>
                <div className="flex items-center gap-3 mt-6 pt-5" style={{ borderTop: "1px solid #efe8d8" }}>
                  <div className="w-9 h-9 flex items-center justify-center text-xs font-semibold" style={{ background: INK, color: GOLD }}>
                    {r.name[0]}
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {r.name} <span className="opacity-50 font-normal">· {r.city}</span>
                    </p>
                    <p className="text-[11px] gold tracking-wide uppercase">Verified purchase</p>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ————— COMPLETE THE LOOK ————— */}
      <section className="max-w-[1280px] mx-auto px-6 md:px-12 pb-24">
        <Reveal>
          <h2 className="serif text-4xl font-light mb-10">Complete the wardrobe</h2>
        </Reveal>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {LOOK.map((p, i) => (
            <Reveal key={p.name} delay={i * 90}>
              <div className="cursor-pointer group">
                <div className="overflow-hidden imgzoom" style={{ background: INK }}>
                  <img src={p.src} alt={p.name} className="w-full aspect-[3/4] object-cover" />
                </div>
                <p className="serif mt-3 text-lg group-hover:underline underline-offset-4">{p.name}</p>
                <p className="text-sm opacity-70">{p.price}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer style={{ background: INK, color: IVORY }} className="py-14 text-center">
        <img src="/__mockup/images/soso/logo.png" alt="SOSO Africa" className="h-12 mx-auto mb-4" />
        <p className="text-[11px] tracking-[0.3em] uppercase opacity-60">The Architect of the Modern Man · Abuja, Nigeria</p>
        <p className="text-[12px] opacity-40 mt-3">shopsoso.co · WhatsApp +234 · Instagram @shopsoso</p>
      </footer>

      {/* Sticky mobile buy bar */}
      <div
        className="fixed bottom-0 left-0 right-0 md:hidden flex items-center gap-3 px-4 py-3 z-40"
        style={{ background: "rgba(18,17,16,.96)", backdropFilter: "blur(8px)", borderTop: `1px solid ${GOLD}` }}
      >
        <div className="flex-1">
          <p className="text-[11px] uppercase tracking-widest" style={{ color: GOLD }}>Vault</p>
          <p className="text-sm text-white font-medium">₦250,000</p>
        </div>
        <button className="px-6 py-3 text-[12px] tracking-[0.2em] uppercase" style={{ background: GOLD, color: INK }}>
          {needSize ? "Choose size" : "Add to bag"}
        </button>
      </div>

      {/* Size guide modal */}
      {guideOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(18,17,16,.7)" }} onClick={() => setGuideOpen(false)}>
          <div className="max-w-lg w-full p-8 relative" style={{ background: IVORY }} onClick={(e) => e.stopPropagation()}>
            <button className="absolute top-4 right-5 text-2xl opacity-60 hover:opacity-100" onClick={() => setGuideOpen(false)} aria-label="Close">
              ×
            </button>
            <h3 className="serif text-3xl font-light">Vault fit guide</h3>
            <p className="text-sm opacity-70 mt-2">Measurements in inches. Cut for a regal, relaxed drape.</p>
            <table className="w-full mt-6 text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-widest opacity-60">
                  <th className="py-2">Size</th>
                  <th>Chest</th>
                  <th>Length</th>
                  <th>Sleeve</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["S", "38–40", "44", "24.5"],
                  ["M", "41–43", "45", "25"],
                  ["L", "44–46", "46", "25.5"],
                  ["XL", "47–49", "47", "26"],
                  ["XXL", "50–52", "48", "26.5"],
                ].map((row) => (
                  <tr key={row[0]} style={{ borderTop: "1px solid #ddd3bd" }}>
                    {row.map((c, i) => (
                      <td key={i} className={`py-2.5 ${i === 0 ? "font-semibold" : "opacity-75"}`}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-6 p-4 text-sm" style={{ background: IVORY_DIM }}>
              Not sure? Send your height and weight on WhatsApp — a stylist will size you in one message. Or choose <span className="font-semibold">Custom</span> for made-to-measure at no extra cost.
            </div>
            <button
              className="w-full mt-5 py-3.5 text-[12px] tracking-[0.2em] uppercase flex items-center justify-center gap-2"
              style={{ background: "#128C56", color: "#fff" }}
            >
              <WhatsAppIcon size={16} /> Get sized on WhatsApp
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProductPage;
