/** Serialises Drive binary downloads: exactly one request active; the next starts only after the previous settles. */
export class StaleTaskError extends Error {
  constructor() { super("Skipped: no longer needed"); this.name = "StaleTaskError"; }
}

export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    /** `shouldRun` is checked immediately before the task starts; a stale task never touches the network. */
    run<T>(task: () => Promise<T>, shouldRun: () => boolean = () => true): Promise<T> {
      const result = tail.then(() => {
        if (!shouldRun()) throw new StaleTaskError();
        return task();
      });
      tail = result.then(() => undefined, () => undefined);
      return result;
    },
  };
}
