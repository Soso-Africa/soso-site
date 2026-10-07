/**
 * Reuse a large snapshot only after checking its version at the source.
 * No stale-on-error fallback: failed/missing version checks cannot serve a
 * previously approved snapshot after withdrawal or an authority change.
 */
export function createVersionCheckedCache<T>(options: {
  readVersion: () => Promise<string | null>;
  load: () => Promise<{ version: string; value: T } | null>;
  maxAgeMs?: number;
  now?: () => number;
}): () => Promise<T | null> {
  const now = options.now ?? Date.now;
  const maxAgeMs = options.maxAgeMs ?? 60 * 60_000;
  let cached: { version: string; value: T; loadedAt: number } | null = null;
  const pending = new Map<string, Promise<T | null>>();

  return async () => {
    const version = await options.readVersion();
    if (version === null) {
      cached = null;
      return null;
    }
    if (cached?.version === version && now() - cached.loadedAt < maxAgeMs) {
      return cached.value;
    }
    const existing = pending.get(version);
    if (existing) return existing;
    const loading = (async () => {
      const snapshot = await options.load();
      if (!snapshot) {
        cached = null;
        return null;
      }
      // The version must come from the SAME read as the full value: a
      // publication can commit between the version and snapshot queries.
      cached = { ...snapshot, loadedAt: now() };
      return snapshot.value;
    })();
    pending.set(version, loading);
    try {
      return await loading;
    } finally {
      pending.delete(version);
    }
  };
}