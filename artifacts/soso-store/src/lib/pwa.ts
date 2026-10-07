export interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let installPrompt: InstallPrompt | null = null;
let installationObserved = false;
let listening = false;
const installListeners = new Set<() => void>();
const notify = () => installListeners.forEach((listener) => listener());

export function pwaInstallState() {
  return {
    prompt: installPrompt,
    installed: installationObserved || window.matchMedia("(display-mode: standalone)").matches
      || window.matchMedia("(display-mode: fullscreen)").matches
      || Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
  };
}

export function subscribePwaInstall(listener: () => void) {
  installListeners.add(listener);
  return () => { installListeners.delete(listener); };
}

export function consumeInstallPrompt(prompt: InstallPrompt) {
  if (installPrompt === prompt) installPrompt = null;
  notify();
}

function listenForInstallation() {
  if (listening) return;
  listening = true;
  // Capture the browser event before slow catalogue requests mount the footer.
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event as InstallPrompt;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installationObserved = true;
    installPrompt = null;
    notify();
  });
  for (const mode of ["standalone", "fullscreen"]) {
    window.matchMedia(`(display-mode: ${mode})`).addEventListener("change", notify);
  }
}

/** Also applies metadata to crawler-generated pages that omit the base head. */
export function preparePwa() {
  listenForInstallation();
  const base = new URL(import.meta.env.BASE_URL, window.location.origin);
  for (const [rel, file] of [
    ["manifest", "manifest.webmanifest"],
    ["apple-touch-icon", "apple-touch-icon.png"],
  ]) {
    if (document.querySelector(`link[rel="${rel}"]`)) continue;
    const link = document.createElement("link");
    link.rel = rel;
    link.href = new URL(file, base).href;
    document.head.append(link);
  }
  for (const [name, content] of [
    ["theme-color", "#1857A4"],
    ["apple-mobile-web-app-capable", "yes"],
    ["apple-mobile-web-app-title", "SOSO Africa"],
  ]) {
    if (document.querySelector(`meta[name="${name}"]`)) continue;
    const meta = document.createElement("meta");
    meta.name = name;
    meta.content = content;
    document.head.append(meta);
  }
  if (!import.meta.env.PROD || !window.isSecureContext || !("serviceWorker" in navigator)) return;
  const register = () => {
    void navigator.serviceWorker.register(new URL("sw.js", base), {
      scope: base.pathname, updateViaCache: "none",
    }).catch((error) => console.warn("SOSO offline support could not start.", error));
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
