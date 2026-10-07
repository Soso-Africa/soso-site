import React, { useEffect, useState } from "react";
import { consumeInstallPrompt, pwaInstallState, subscribePwaInstall } from "@/lib/pwa";

export function usePwaInstallState() {
  const [state, setState] = useState(pwaInstallState);
  useEffect(() => {
    const update = () => setState(pwaInstallState());
    const unsubscribe = subscribePwaInstall(update);
    update();
    return unsubscribe;
  }, []);
  return state;
}

export function PwaInstall() {
  const { prompt, installed } = usePwaInstallState();
  const [error, setError] = useState(false);
  if (installed) return null;
  return <div className="mb-12 max-w-xl text-[13px] leading-relaxed text-secondary">
    {prompt && <button type="button" className="mb-3 border border-border px-4 py-2 text-foreground hover:bg-muted"
      onClick={async () => {
        setError(false);
        try {
          await prompt.prompt();
           await prompt.userChoice;
        } catch {
          setError(true);
        } finally {
           consumeInstallPrompt(prompt);
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
