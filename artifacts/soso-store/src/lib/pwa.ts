/** Also applies metadata to crawler-generated pages that omit the base head. */
export function preparePwa() {
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
