import { useEffect, useRef, useState } from "react";

/* ============================================================
   SOSO Africa — Conversion-first Homepage Mockup
   Aesthetic: "Gilded Atelier" — editorial luxury layout with a
   hard-selling commerce layer. Fraunces (display serif) +
   Plus Jakarta Sans (body). Palette: ink black, ivory, gold.
   ============================================================ */

const GOLD = "#B8912F";
const GOLD_LIGHT = "#D4B45A";
const INK = "#100E0B";
const IVORY = "#F6F1E7";
const IVORY_DIM = "#EDE5D4";

function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, shown };
}

function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const { ref, shown } = useReveal();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : "translateY(28px)",
        transition: `opacity 0.9s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.9s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

const naira = (n: number) => "\u20A6" + n.toLocaleString("en-NG");

const WhatsAppIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2.05 22l5.3-1.39a9.87 9.87 0 0 0 4.69 1.19h.01c5.46 0 9.9-4.44 9.9-9.9 0-2.65-1.03-5.14-2.9-7.01A9.83 9.83 0 0 0 12.04 2Zm5.83 14.13c-.25.7-1.45 1.33-2.02 1.42-.52.08-1.17.11-1.89-.12-.44-.14-1-.32-1.72-.63-3.02-1.3-5-4.35-5.15-4.55-.15-.2-1.23-1.64-1.23-3.12 0-1.49.78-2.22 1.06-2.52.28-.3.6-.38.8-.38.2 0 .4 0 .58.01.19.01.44-.07.68.52.25.6.85 2.08.93 2.23.07.15.12.33.02.53-.1.2-.15.32-.3.5-.15.17-.31.39-.44.52-.15.15-.31.31-.13.61.17.3.78 1.28 1.67 2.08 1.15 1.02 2.11 1.34 2.41 1.49.3.15.47.13.65-.07.17-.2.75-.87.94-1.17.2-.3.4-.25.67-.15.27.1 1.74.82 2.04.97.3.15.5.22.57.35.08.13.08.72-.17 1.42Z" />
  </svg>
);

const Star = ({ filled = true }: { filled?: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? GOLD : "none"} stroke={GOLD} strokeWidth="1.5" aria-hidden>
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);

const products = [
  { name: "The Vault Kaftan", img: "/__mockup/images/soso/vault-black.jpg", price: 285000, tag: "Signature", note: "Midnight black, hand-finished collar" },
  { name: "Ivory Ascension Kaftan", img: "/__mockup/images/soso/kaftan-white.jpg", price: 240000, tag: "Best Seller", note: "Crisp ivory, ceremonial weight" },
  { name: "The Sovereign Agbada", img: "/__mockup/images/soso/agbada.jpg", price: 480000, tag: "Grand Occasion", note: "Full three-piece with embroidery" },
  { name: "Heritage Dashiki", img: "/__mockup/images/soso/dashiki.jpg", price: 165000, tag: "New", note: "Contemporary cut, heritage lines" },
  { name: "The Boardroom Shirt", img: "/__mockup/images/soso/shirts.jpg", price: 150000, tag: "Everyday Luxury", note: "Business-ready, breathable cotton" },
  { name: "Twin Set — Two Piece", img: "/__mockup/images/soso/twopiece.jpg", price: 220000, tag: "Weekend", note: "Matched set, relaxed authority" },
];

const reviews = [
  { name: "Chukwuemeka O.", city: "Abuja", text: "Wore the Sovereign Agbada to my traditional wedding. Three people asked for the tailor before the reception ended. Fit was flawless from measurements sent on WhatsApp.", item: "The Sovereign Agbada" },
  { name: "Ibrahim D.", city: "Kaduna", text: "Delivered to my door in 4 days. The kaftan fits like it was sewn on me. This is the first time I've bought clothing online in Nigeria without regret.", item: "The Vault Kaftan" },
  { name: "Tunde A.", city: "London, UK", text: "Shipped to London faster than some UK brands deliver locally. Quality is on the level of Savile Row pieces I own — at a fraction of the price.", item: "Ivory Ascension Kaftan" },
];

export function Homepage() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div style={{ backgroundColor: INK, color: IVORY, fontFamily: "'Plus Jakarta Sans', sans-serif" }} className="min-h-[100dvh] antialiased">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <style>{`
        .soso-display { font-family: 'Fraunces', serif; }
        .soso-card img { transition: transform 1.1s cubic-bezier(0.16,1,0.3,1); }
        .soso-card:hover img { transform: scale(1.05); }
        .soso-card .soso-cta-row { opacity: 0; transform: translateY(8px); transition: all .45s cubic-bezier(0.16,1,0.3,1); }
        .soso-card:hover .soso-cta-row { opacity: 1; transform: translateY(0); }
        .soso-btn-gold { transition: all .3s ease; }
        .soso-btn-gold:hover { background-color: ${GOLD_LIGHT} !important; transform: translateY(-1px); }
        .soso-btn-ghost:hover { background-color: rgba(246,241,231,0.08); }
        .soso-link:hover { color: ${GOLD_LIGHT}; }
        @keyframes soso-marquee { from { transform: translateX(0);} to { transform: translateX(-50%);} }
        .soso-marquee { animation: soso-marquee 30s linear infinite; }
        html { scroll-behavior: smooth; }
      `}</style>

      {/* ===== Announcement bar ===== */}
      <div className="text-center text-[11px] tracking-[0.22em] uppercase py-2 px-4" style={{ backgroundColor: GOLD, color: INK, fontWeight: 600 }}>
        Complimentary nationwide delivery on orders above {naira(250000)} &nbsp;&middot;&nbsp; Worldwide shipping in 5–10 days
      </div>

      {/* ===== Nav ===== */}
      <header
        className="sticky top-0 z-50 px-6 lg:px-12 flex items-center justify-between"
        style={{
          backgroundColor: scrolled ? "rgba(16,14,11,0.92)" : "rgba(16,14,11,0.4)",
          backdropFilter: "blur(14px)",
          borderBottom: `1px solid ${scrolled ? "rgba(184,145,47,0.25)" : "transparent"}`,
          height: 72,
          transition: "all .4s ease",
        }}
      >
        <nav className="hidden md:flex items-center gap-8 text-[12px] tracking-[0.18em] uppercase" style={{ color: IVORY_DIM }}>
          <a href="#collection" className="soso-link">Kaftans</a>
          <a href="#collection" className="soso-link">Agbadas</a>
          <a href="#collection" className="soso-link">Shirts</a>
        </nav>
        <img src="/__mockup/images/soso/logo.png" alt="SOSO Africa" className="h-9 md:absolute md:left-1/2 md:-translate-x-1/2" />
        <div className="flex items-center gap-4">
          <a
            href="#collection"
            className="soso-btn-gold hidden sm:inline-block text-[12px] tracking-[0.15em] uppercase px-5 py-2.5 font-semibold"
            style={{ backgroundColor: GOLD, color: INK }}
          >
            Shop Now
          </a>
          <a href="#whatsapp" className="soso-link flex items-center gap-2 text-[12px] tracking-[0.12em] uppercase" style={{ color: GOLD }}>
            <WhatsAppIcon /> <span className="hidden lg:inline">Order via WhatsApp</span>
          </a>
        </div>
      </header>

      {/* ===== 1. HERO — headline + CTA above the fold ===== */}
      <section className="relative overflow-hidden" style={{ minHeight: "calc(100dvh - 104px)" }}>
        <div className="absolute inset-0">
          <img src="/__mockup/images/soso/vault-black.jpg" alt="" className="w-full h-full object-cover object-top" style={{ opacity: 0.55 }} />
          <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, ${INK} 8%, rgba(16,14,11,0.55) 55%, rgba(16,14,11,0.2) 100%)` }} />
          <div className="absolute inset-x-0 bottom-0 h-40" style={{ background: `linear-gradient(180deg, transparent, ${INK})` }} />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12 flex flex-col justify-center" style={{ minHeight: "calc(100dvh - 104px)" }}>
          <Reveal>
            <p className="text-[12px] tracking-[0.35em] uppercase mb-6" style={{ color: GOLD }}>
              Bespoke Menswear &middot; Abuja, Nigeria
            </p>
          </Reveal>
          <Reveal delay={120}>
            <h1 className="soso-display font-light leading-[1.02] max-w-3xl" style={{ fontSize: "clamp(2.6rem, 6vw, 5.2rem)" }}>
              Dress like the man
              <br />
              they <em style={{ color: GOLD_LIGHT, fontStyle: "italic" }}>make way</em> for.
            </h1>
          </Reveal>
          <Reveal delay={240}>
            <p className="mt-6 max-w-xl text-[15px] leading-relaxed" style={{ color: IVORY_DIM }}>
              Hand-finished kaftans and agbadas, cut to your exact measurements. Worn at Nigeria's
              biggest weddings, boardrooms and pulpits. Delivered to your door — anywhere in the world.
            </p>
          </Reveal>
          <Reveal delay={360}>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <a href="#collection" className="soso-btn-gold text-[13px] tracking-[0.15em] uppercase px-8 py-4 font-bold" style={{ backgroundColor: GOLD, color: INK }}>
                Shop the Collection
              </a>
              <a
                href="#whatsapp"
                className="soso-btn-ghost flex items-center gap-2.5 text-[13px] tracking-[0.15em] uppercase px-8 py-4 font-semibold"
                style={{ border: `1px solid rgba(246,241,231,0.35)` }}
              >
                <WhatsAppIcon size={17} /> Order on WhatsApp
              </a>
            </div>
          </Reveal>
          <Reveal delay={480}>
            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 text-[12px] tracking-[0.08em]" style={{ color: IVORY_DIM }}>
              <span className="flex items-center gap-1.5"><Star /><Star /><Star /><Star /><Star /> <strong style={{ color: IVORY }}>4.9</strong> from 700+ clients</span>
              <span>Pay on delivery in Abuja</span>
              <span>Free re-fit if it isn't perfect</span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===== 2. Trust strip ===== */}
      <section style={{ borderTop: `1px solid rgba(184,145,47,0.25)`, borderBottom: `1px solid rgba(184,145,47,0.25)` }}>
        <div className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 divide-x" style={{ borderColor: "rgba(184,145,47,0.15)" }}>
          {[
            ["Nationwide in 2–5 days", "Worldwide in 5–10 days, tracked"],
            ["Made to your measure", "Guided sizing over WhatsApp video"],
            ["Free re-fit guarantee", "We alter until it's perfect"],
            ["Secure checkout", "Card, transfer, or pay on delivery"],
          ].map(([t, s], i) => (
            <div key={i} className="px-6 py-6 text-center" style={{ borderColor: "rgba(184,145,47,0.15)" }}>
              <p className="text-[13px] font-semibold tracking-wide" style={{ color: GOLD_LIGHT }}>{t}</p>
              <p className="text-[12px] mt-1" style={{ color: IVORY_DIM }}>{s}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== 3. Featured collection — products high on the page ===== */}
      <section id="collection" className="max-w-7xl mx-auto px-6 lg:px-12 py-24">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-4 mb-12">
            <div>
              <p className="text-[11px] tracking-[0.3em] uppercase mb-3" style={{ color: GOLD }}>The Collection</p>
              <h2 className="soso-display font-light" style={{ fontSize: "clamp(2rem,4vw,3.2rem)" }}>Built for the occasion.<br />Cut for you.</h2>
            </div>
            <a href="#collection" className="soso-link text-[12px] tracking-[0.2em] uppercase pb-1" style={{ color: GOLD, borderBottom: `1px solid ${GOLD}` }}>
              View all 42 pieces
            </a>
          </div>
        </Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-14">
          {products.map((p, i) => (
            <Reveal key={p.name} delay={(i % 3) * 120}>
              <div className="soso-card group cursor-pointer">
                <div className="relative overflow-hidden" style={{ aspectRatio: "3/4", backgroundColor: "#1a1712" }}>
                  <img src={p.img} alt={p.name} className="w-full h-full object-cover object-top" />
                  <span className="absolute top-4 left-4 text-[10px] tracking-[0.2em] uppercase px-3 py-1.5 font-semibold" style={{ backgroundColor: "rgba(16,14,11,0.85)", color: GOLD_LIGHT, border: `1px solid rgba(184,145,47,0.4)` }}>
                    {p.tag}
                  </span>
                  <div className="soso-cta-row absolute inset-x-4 bottom-4 flex gap-2">
                    <button className="soso-btn-gold flex-1 text-[11px] tracking-[0.15em] uppercase py-3 font-bold" style={{ backgroundColor: GOLD, color: INK }}>
                      Add to Cart
                    </button>
                    <button className="px-3 py-3 flex items-center justify-center" style={{ backgroundColor: "rgba(16,14,11,0.9)", color: GOLD, border: `1px solid rgba(184,145,47,0.5)` }} aria-label="Order on WhatsApp">
                      <WhatsAppIcon />
                    </button>
                  </div>
                </div>
                <div className="mt-5 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="soso-display text-[19px]">{p.name}</h3>
                    <p className="text-[12px] mt-1" style={{ color: IVORY_DIM }}>{p.note}</p>
                  </div>
                  <p className="text-[15px] font-semibold whitespace-nowrap" style={{ color: GOLD_LIGHT }}>{naira(p.price)}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===== 4. Occasion selector ===== */}
      <section className="py-20" style={{ backgroundColor: "#161310" }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <Reveal>
            <p className="text-[11px] tracking-[0.3em] uppercase mb-3" style={{ color: GOLD }}>Shop by occasion</p>
            <h2 className="soso-display font-light mb-12" style={{ fontSize: "clamp(1.8rem,3.5vw,2.8rem)" }}>Where will they see you next?</h2>
          </Reveal>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              ["The Wedding", "Agbadas & grand kaftans", "/__mockup/images/soso/agbada.jpg"],
              ["The Boardroom", "Shirts & sharp two-pieces", "/__mockup/images/soso/shirts.jpg"],
              ["Sunday Service", "Ivory & ceremonial kaftans", "/__mockup/images/soso/kaftan-white.jpg"],
              ["The Owambe", "Statement dashikis & sets", "/__mockup/images/soso/twopiece.jpg"],
            ].map(([t, s, img], i) => (
              <Reveal key={t} delay={i * 100}>
                <a href="#collection" className="soso-card group block relative overflow-hidden" style={{ aspectRatio: "3/4" }}>
                  <img src={img} alt={t} className="w-full h-full object-cover object-top" />
                  <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, transparent 40%, rgba(16,14,11,0.92))" }} />
                  <div className="absolute inset-x-0 bottom-0 p-5">
                    <p className="soso-display text-[20px]" style={{ color: IVORY }}>{t}</p>
                    <p className="text-[12px] mt-1" style={{ color: IVORY_DIM }}>{s}</p>
                    <p className="text-[11px] tracking-[0.2em] uppercase mt-3" style={{ color: GOLD }}>Shop the look →</p>
                  </div>
                </a>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== 5. Fit confidence / how it works ===== */}
      <section className="max-w-7xl mx-auto px-6 lg:px-12 py-24 grid lg:grid-cols-2 gap-14 items-center">
        <Reveal>
          <div className="relative">
            <img src="/__mockup/images/soso/kaftan-white.jpg" alt="Ivory kaftan fitting" className="w-full object-cover object-top" style={{ aspectRatio: "4/5" }} />
            <div className="absolute -bottom-6 -right-4 lg:-right-8 px-6 py-5" style={{ backgroundColor: GOLD, color: INK }}>
              <p className="soso-display text-[28px] leading-none">98%</p>
              <p className="text-[11px] tracking-[0.15em] uppercase mt-1 font-semibold">Perfect fit, first delivery</p>
            </div>
          </div>
        </Reveal>
        <div>
          <Reveal>
            <p className="text-[11px] tracking-[0.3em] uppercase mb-3" style={{ color: GOLD }}>Fit, guaranteed</p>
            <h2 className="soso-display font-light mb-8" style={{ fontSize: "clamp(1.8rem,3.5vw,2.8rem)" }}>
              Buying bespoke online should not be a gamble.
            </h2>
          </Reveal>
          {[
            ["01", "Choose your piece", "Pick from the collection, or send us your inspiration on WhatsApp."],
            ["02", "Measure in 5 minutes", "Our fit specialist guides you on a WhatsApp video call — no tape drama."],
            ["03", "We cut, sew and finish", "Hand-finished in our Abuja atelier within 7–10 working days."],
            ["04", "Delivered. Perfect. Or re-fit free.", "If any seam is off, we alter or remake at our cost. That is the SOSO promise."],
          ].map(([n, t, s], i) => (
            <Reveal key={n} delay={i * 110}>
              <div className="flex gap-6 py-5" style={{ borderBottom: "1px solid rgba(184,145,47,0.2)" }}>
                <span className="soso-display text-[15px]" style={{ color: GOLD }}>{n}</span>
                <div>
                  <p className="font-semibold text-[15px]">{t}</p>
                  <p className="text-[13px] mt-1 leading-relaxed" style={{ color: IVORY_DIM }}>{s}</p>
                </div>
              </div>
            </Reveal>
          ))}
          <Reveal delay={480}>
            <a href="#whatsapp" className="soso-btn-gold inline-flex items-center gap-2.5 mt-8 text-[13px] tracking-[0.15em] uppercase px-8 py-4 font-bold" style={{ backgroundColor: GOLD, color: INK }}>
              <WhatsAppIcon size={17} /> Start Your Fitting
            </a>
          </Reveal>
        </div>
      </section>

      {/* ===== 6. Social proof ===== */}
      <section className="py-24" style={{ backgroundColor: IVORY, color: INK }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <Reveal>
            <div className="text-center mb-14">
              <p className="text-[11px] tracking-[0.3em] uppercase mb-3" style={{ color: GOLD }}>Word of mouth</p>
              <h2 className="soso-display font-light" style={{ fontSize: "clamp(1.8rem,3.5vw,2.8rem)" }}>700+ men. One question:<br />"Who made that?"</h2>
            </div>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-6">
            {reviews.map((r, i) => (
              <Reveal key={r.name} delay={i * 130}>
                <div className="h-full flex flex-col p-8" style={{ backgroundColor: "#FFFDF8", border: "1px solid rgba(184,145,47,0.3)" }}>
                  <div className="flex gap-1 mb-4"><Star /><Star /><Star /><Star /><Star /></div>
                  <p className="text-[14px] leading-relaxed flex-1" style={{ color: "#3a352c" }}>"{r.text}"</p>
                  <div className="mt-6 pt-5" style={{ borderTop: "1px solid rgba(184,145,47,0.25)" }}>
                    <p className="font-semibold text-[14px]">{r.name} <span className="font-normal" style={{ color: "#8a8272" }}>— {r.city}</span></p>
                    <p className="text-[12px] mt-0.5" style={{ color: GOLD }}>Purchased: {r.item}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={200}>
            <div className="mt-12 overflow-hidden" style={{ borderTop: "1px solid rgba(184,145,47,0.3)", borderBottom: "1px solid rgba(184,145,47,0.3)" }}>
              <div className="soso-marquee flex whitespace-nowrap py-4 text-[12px] tracking-[0.25em] uppercase" style={{ color: "#8a8272" }}>
                {[0, 1].map((k) => (
                  <span key={k} className="flex">
                    {["As worn at Abuja society weddings", "Trusted by executives & clergy", "Shipped to 14 countries", "Featured in Nigerian style press"].map((t) => (
                      <span key={t} className="mx-8 flex items-center gap-8">{t} <span style={{ color: GOLD }}>&#9670;</span></span>
                    ))}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===== 7. Brand story — brief, below the sell ===== */}
      <section className="relative py-28 overflow-hidden">
        <img src="/__mockup/images/soso/dashiki.jpg" alt="" className="absolute inset-0 w-full h-full object-cover object-top" style={{ opacity: 0.25 }} />
        <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${INK}, rgba(16,14,11,0.6), ${INK})` }} />
        <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
          <Reveal>
            <img src="/__mockup/images/soso/logo.png" alt="SOSO" className="h-12 mx-auto mb-8" />
            <h2 className="soso-display font-light leading-snug" style={{ fontSize: "clamp(1.6rem,3.2vw,2.6rem)" }}>
              The Architect of the Modern Man.
            </h2>
            <p className="mt-6 text-[15px] leading-relaxed" style={{ color: IVORY_DIM }}>
              From a single atelier in Abuja, SOSO builds garments the way architects build landmarks —
              with proportion, restraint, and intent. Every stitch is placed by hand. Every silhouette is
              engineered for presence. We don't make clothes for the crowd. We make them for the man the crowd turns to see.
            </p>
            <a href="#collection" className="soso-link inline-block mt-8 text-[12px] tracking-[0.25em] uppercase pb-1" style={{ color: GOLD, borderBottom: `1px solid ${GOLD}` }}>
              Discover the house
            </a>
          </Reveal>
        </div>
      </section>

      {/* ===== 8. Final CTA / WhatsApp ===== */}
      <section id="whatsapp" className="py-24" style={{ backgroundColor: "#161310", borderTop: `1px solid rgba(184,145,47,0.25)` }}>
        <div className="max-w-4xl mx-auto px-6 text-center">
          <Reveal>
            <p className="text-[11px] tracking-[0.3em] uppercase mb-4" style={{ color: GOLD }}>Ready when you are</p>
            <h2 className="soso-display font-light" style={{ fontSize: "clamp(2rem,4.5vw,3.6rem)" }}>
              Your next event is coming.<br />Your outfit should already be sewing.
            </h2>
            <p className="mt-5 text-[14px]" style={{ color: IVORY_DIM }}>
              Bespoke pieces take 7–10 working days. Message us today and we'll hold your slot.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <a href="#collection" className="soso-btn-gold text-[13px] tracking-[0.15em] uppercase px-9 py-4 font-bold" style={{ backgroundColor: GOLD, color: INK }}>
                Shop the Collection
              </a>
              <a href="#whatsapp" className="soso-btn-ghost flex items-center gap-2.5 text-[13px] tracking-[0.15em] uppercase px-9 py-4 font-semibold" style={{ border: `1px solid rgba(246,241,231,0.35)` }}>
                <WhatsAppIcon size={17} /> Chat with a Fit Specialist
              </a>
            </div>
            <p className="mt-8 text-[12px]" style={{ color: IVORY_DIM }}>
              Replies within minutes, 9am–9pm WAT &middot; Pay by card, transfer, or on delivery in Abuja
            </p>
          </Reveal>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="px-6 lg:px-12 py-14" style={{ borderTop: `1px solid rgba(184,145,47,0.2)` }}>
        <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-10">
          <div className="md:col-span-2">
            <img src="/__mockup/images/soso/logo.png" alt="SOSO Africa" className="h-9 mb-4" />
            <p className="text-[13px] max-w-sm leading-relaxed" style={{ color: IVORY_DIM }}>
              Bespoke menswear house, Abuja. Kaftans, agbadas, dashikis and shirting —
              made to measure, delivered worldwide.
            </p>
          </div>
          <div>
            <p className="text-[11px] tracking-[0.25em] uppercase mb-4" style={{ color: GOLD }}>Shop</p>
            {["Kaftans", "Agbadas", "Dashikis", "Two-Piece Sets", "Shirts", "Cufflinks"].map((t) => (
              <a key={t} href="#collection" className="soso-link block text-[13px] py-1.5" style={{ color: IVORY_DIM }}>{t}</a>
            ))}
          </div>
          <div>
            <p className="text-[11px] tracking-[0.25em] uppercase mb-4" style={{ color: GOLD }}>House</p>
            {["Our Story", "Fit Guarantee", "Delivery & Returns", "Size Guide", "Contact / WhatsApp"].map((t) => (
              <a key={t} href="#whatsapp" className="soso-link block text-[13px] py-1.5" style={{ color: IVORY_DIM }}>{t}</a>
            ))}
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-12 pt-6 flex flex-wrap justify-between gap-3 text-[11px] tracking-[0.1em]" style={{ borderTop: "1px solid rgba(184,145,47,0.15)", color: "#7a715c" }}>
          <span>© 2025 SOSO Africa. Abuja, Nigeria.</span>
          <span>Prices in Nigerian Naira (\u20A6). Worldwide shipping available.</span>
        </div>
      </footer>

      {/* Floating WhatsApp */}
      <a
        href="#whatsapp"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-5 py-3.5 text-[12px] tracking-[0.1em] uppercase font-bold soso-btn-gold"
        style={{ backgroundColor: GOLD, color: INK, boxShadow: "0 8px 30px rgba(0,0,0,0.5)" }}
      >
        <WhatsAppIcon size={18} /> Order Now
      </a>
    </div>
  );
}

export default Homepage;
