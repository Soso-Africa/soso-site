/**
 * Skip expensive compatibility work only while its source is unchanged.
 * This is not an authority cache: callers still perform their normal reads.
 * A failed version check or initialization always rejects and can be retried.
 */
export function createVersionCheckedInitializer(options: {
  readVersion: () => Promise<string | null>;
  initialize: () => Promise<void>;
}): () => Promise<void> {
  let completedVersion: string | undefined;
  let pending: Promise<void> | undefined;

  return async () => {
    // Serialize different versions too: migrations must not race each other
    // inside one process. Read again after waiting, not before.
    for (;;) {
      while (pending) await pending;
      const version = await options.readVersion();
      // Another caller may have started during our version query. Its work
      // might concern a different version, so wait and recheck the source.
      if (pending) {
        await pending;
        continue;
      }
      if (version !== null && version === completedVersion) return;
      pending = options.initialize();
      try {
        await pending;
        // Record the pre-migration version. If initialization or another writer
        // changed it, the next call rechecks rather than blessing unseen data.
        completedVersion = version ?? undefined;
      } finally {
        pending = undefined;
      }
      return;
    }
  };
}
