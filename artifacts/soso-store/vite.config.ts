import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { livePublicPreviewPlugin } from './scripts/live-public-preview';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

// PORT is only needed for the local dev server; Vercel/static builds do not use it.
const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 3000;

if (rawPort && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// BASE_PATH defaults to "/" when not set (standard Vercel / static-site deployment).
const basePath = process.env.BASE_PATH ?? "/";

function normalizedPublicSiteUrl(value: string | undefined) {
  if (!value) return "";

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "";
    if (url.username || url.password || url.search || url.hash) return "";
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname.endsWith(".replit.dev")) return "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

export default defineConfig(async ({ command, isPreview }) => {
  const livePublicPreview = command === "serve" && !isPreview && Boolean(process.env.REPL_ID);
  return {
  base: basePath,
  define: {
    "__SOSO_LIVE_PUBLIC_PREVIEW__": JSON.stringify(livePublicPreview),
  },
  plugins: [
    react(),
    tailwindcss({ optimize: false }),
    ...(livePublicPreview ? [livePublicPreviewPlugin(basePath)] : []),
    ...(process.env.NODE_ENV !== 'production' ? [runtimeErrorOverlay()] : []),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
    ...(process.env.SOSO_API_PROXY_TARGET
      ? { proxy: { "/api": { target: process.env.SOSO_API_PROXY_TARGET } } }
      : {}),
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
  };
});
