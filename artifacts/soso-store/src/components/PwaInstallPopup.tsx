import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Share, Smartphone } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { usePwaInstallState } from "./PwaInstall";
import { consumeInstallPrompt } from "@/lib/pwa";

const dismissedKey = "soso-pwa-install-dismissed-v1";
let dismissedInMemory = false;

function wasDismissed() {
  try { return dismissedInMemory || sessionStorage.getItem(dismissedKey) === "yes"; }
  catch { return dismissedInMemory; }
}

/** A site-owned guide is necessary on Safari; it cannot open Apple's install UI. */
export function PwaInstallPopup({ contentReady }: { contentReady: boolean }) {
  const [pathname] = useLocation();
  const { prompt, installed } = usePwaInstallState();
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(wasDismissed);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState(false);
  const [installing, setInstalling] = useState(false);
  const appleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const macSafari = !appleMobile && /Macintosh/.test(navigator.userAgent)
    && /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Edg/.test(navigator.userAgent);
  const eligible = !/^\/(checkout|staff|sign-in|sign-up|privacy|cookies|terms|policies)(\/|$)/.test(pathname);

  useEffect(() => {
    if (!contentReady || !eligible || installed || dismissed) return;
    const timer = window.setTimeout(() => setReady(true), 2500);
    return () => window.clearTimeout(timer);
  }, [contentReady, eligible, installed, dismissed]);

  useEffect(() => {
    // Privacy choices and other open dialogs always take precedence.
    const update = () => setBlocked(Array.from(document.querySelectorAll(
      '[data-soso-privacy-choices], [role="dialog"][data-state="open"]:not([data-pwa-install-popup])',
    )).some((element) => element.getClientRects().length > 0));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true,
      attributes: true, attributeFilter: ["data-state", "hidden", "style"] });
    return () => observer.disconnect();
  }, []);

  function dismiss() {
    dismissedInMemory = true;
    try { sessionStorage.setItem(dismissedKey, "yes"); } catch { /* Keep the in-memory choice. */ }
    setDismissed(true);
  }

  return <Dialog open={contentReady && ready && eligible && !installed && !dismissed && !blocked}
    onOpenChange={(open) => { if (!open) dismiss(); }}>
    <DialogContent data-pwa-install-popup className="w-[calc(100%_-_2rem)] max-w-md p-7 sm:p-8">
      <div className="flex items-center gap-4">
        <img src={`${import.meta.env.BASE_URL}pwa-icon-gold-192.png`} alt="" width={56} height={56}
          className="h-14 w-14 rounded-xl" />
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">SOSO Africa</p>
          <DialogTitle className="soso-display text-2xl font-normal">Install SOSO</DialogTitle>
        </div>
      </div>
      <DialogDescription className="text-sm leading-6">
        Keep SOSO on your home screen or desktop and open the store like an app.
      </DialogDescription>
      {appleMobile ? <div className="space-y-3 border-y border-border py-5 text-sm leading-6">
        <p className="font-medium">On your iPhone or iPad</p>
        <p>1. Open this website in <strong>Safari</strong>.</p>
        <p className="flex items-center gap-2">2. Tap <Share size={17} aria-hidden="true" /> <strong>Share</strong> in the browser.</p>
        <p>3. Choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.</p>
        <p className="text-xs text-muted-foreground">Enable “Open as Web App” if shown. Safari requires these steps—we can’t install the app automatically.</p>
      </div> : <div className="space-y-3 border-y border-border py-5 text-sm leading-6">
        <p className="flex items-center gap-2 font-medium"><Smartphone size={17} aria-hidden="true" /> On your device</p>
        {macSafari ? <p>In Safari, choose <strong>File → Add to Dock</strong>.</p>
          : <p>In Chrome or Edge, use <strong>Install app</strong> or <strong>Add to Home Screen</strong> in the browser menu. Options depend on your browser.</p>}
      </div>}
      {error && <p role="status" className="text-sm">The browser couldn’t open installation. Use the steps above instead.</p>}
      {prompt && !appleMobile ? <button type="button" disabled={installing}
        className="bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
        onClick={async () => {
          setInstalling(true);
          setError(false);
          try {
            await prompt.prompt();
            await prompt.userChoice;
            dismiss();
          } catch { setError(true); }
          finally { consumeInstallPrompt(prompt); setInstalling(false); }
        }}>{installing ? "Opening installation…" : "Install SOSO"}</button> : null}
      <button type="button" onClick={dismiss}
        className="border border-border px-5 py-3 text-sm text-foreground hover:bg-muted">
        {appleMobile || !prompt ? "Continue browsing" : "Not now"}
      </button>
      <p className="text-[11px] leading-5 text-muted-foreground">
        Shopping needs an internet connection. Already installed? Open SOSO from your home screen or launcher.
      </p>
    </DialogContent>
  </Dialog>;
}
