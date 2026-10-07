import React, { useEffect, useState } from "react";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstall() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const update = () => setInstalled(media.matches || Boolean(
      (navigator as Navigator & { standalone?: boolean }).standalone,
    ));
    const before = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const done = () => { setInstalled(true); setPrompt(null); };
    update();
    window.addEventListener("beforeinstallprompt", before);
    window.addEventListener("appinstalled", done);
    media.addEventListener("change", update);
    return () => {
      window.removeEventListener("beforeinstallprompt", before);
      window.removeEventListener("appinstalled", done);
      media.removeEventListener("change", update);
    };
  }, []);
  if (installed) return null;
  return <div className="mb-12 max-w-xl text-[13px] leading-relaxed text-secondary">
    {prompt && <button type="button" className="mb-3 border border-border px-4 py-2 text-foreground hover:bg-muted"
      onClick={async () => {
        setError(false);
        try {
          await prompt.prompt();
          const choice = await prompt.userChoice;
          if (choice.outcome === "accepted") setInstalled(true);
        } catch {
          setError(true);
        } finally {
          setPrompt(null);
        }
      }}>Install SOSO</button>}
    {error && <p role="status">Use the browser instructions below to install SOSO.</p>}
    <details>
      <summary className="cursor-pointer py-2 text-foreground">Install SOSO on your device</summary>
      <div className="space-y-2 pt-2">
        <p><strong>iPhone and iPad:</strong> Open SOSO in Safari, tap Share, then Add to Home Screen. Enable Open as Web App if shown.</p>
        <p><strong>Desktop and Android:</strong> In Chrome or Edge, use the browser’s Install app or Add to Home Screen option when available. On Mac, Safari offers File → Add to Dock.</p>
        <p>Installation options depend on your browser. Shopping and checkout still need an internet connection.</p>
      </div>
    </details>
  </div>;
}
