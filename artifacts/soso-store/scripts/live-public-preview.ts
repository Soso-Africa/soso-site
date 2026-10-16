import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

// Public, merchant-confirmed storefront origin. No credentials are forwarded.
const liveOrigin = "https://shopsoso.co";
const publicAssetPath = /^\/(?:images\/|media\/|api\/storage\/objects\/)/;
const managedAssetPath = /^\/api\/storage\/objects\//;

export function previewPrefix(basePath: string) {
  return `${basePath.replace(/\/$/, "")}/__soso_live_preview`;
}

export function previewTarget(path: string, method: string) {
  if (method !== "GET" && method !== "HEAD") return null;
  if (path === "/content") return `${liveOrigin}/api/content/platform`;
  try {
    const url = new URL(path, liveOrigin);
    if (url.origin !== liveOrigin || !publicAssetPath.test(url.pathname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function rewritePreviewAssets(value: unknown, prefix: string): unknown {
  if (typeof value === "string") {
    // Bundled paths must retain their identity: hero playback selects its
    // compatible MP4 alternative by the original bundled media path.
    return managedAssetPath.test(value) ? `${prefix}${value}` : value;
  }
  if (Array.isArray(value)) return value.map((item) => rewritePreviewAssets(item, prefix));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewritePreviewAssets(item, prefix)]));
  }
  return value;
}

export function livePublicPreviewPlugin(basePath: string): Plugin {
  const prefix = previewPrefix(basePath);
  return {
    name: "soso-read-only-live-public-preview",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const pathname = (req.url ?? "").split("?")[0];
        if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return next();
        const publicPath = (req.url ?? "").slice(prefix.length);
        const target = previewTarget(publicPath, req.method ?? "");
        if (!target) {
          res.statusCode = 405;
          res.setHeader("Allow", "GET, HEAD");
          res.end("Only published content and public media can be previewed.");
          return;
        }
        try {
          const upstream = await fetch(target, {
            method: req.method,
            credentials: "omit",
            headers: req.headers.range ? { Range: req.headers.range } : {},
            signal: AbortSignal.timeout(30_000),
          });
          res.statusCode = upstream.status;
          if (publicPath === "/content") {
            res.setHeader("Cache-Control", "no-store");
            res.setHeader("Content-Type", "application/json");
            if (!upstream.ok) {
              res.end(JSON.stringify({ error: "Live published content is unavailable. Please retry." }));
              return;
            }
            if (req.method === "HEAD") { res.end(); return; }
            const content = await upstream.json();
            res.end(JSON.stringify(rewritePreviewAssets(content, prefix)));
            return;
          }
          // fetch can decompress a response; do not forward its encoded byte length.
          for (const header of ["content-type", "content-range", "accept-ranges", "etag", "last-modified", "cache-control"]) {
            const value = upstream.headers.get(header);
            if (value) res.setHeader(header, value);
          }
          if (req.method === "HEAD" || !upstream.body) { res.end(); return; }
          const stream = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]);
          stream.on("error", () => res.destroy());
          stream.pipe(res);
        } catch (error) {
          server.config.logger.error(`Live public preview request failed: ${error instanceof Error ? error.message : "request failed"}`);
          if (res.headersSent) { res.destroy(); return; }
          res.statusCode = 502;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify({ error: "Live published content is unavailable. Please retry." }));
        }
      });
    },
  };
}
