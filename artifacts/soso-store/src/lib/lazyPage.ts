import { lazy, type ComponentType } from "react";

export class PageLoadError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super("The page could not be loaded.");
    this.name = "PageLoadError";
    this.cause = cause;
  }
}

/** Wrap only the module request; render-time errors remain ordinary errors. */
export function loadPageModule<T>(load: () => Promise<T>): Promise<T> {
  return Promise.resolve()
    .then(load)
    .catch((error: unknown) => {
      throw new PageLoadError(error);
    });
}

export function isPageLoadError(error: Error): error is PageLoadError {
  return error instanceof PageLoadError;
}

export function lazyPage<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>,
) {
  return lazy(() => loadPageModule(load));
}

export function getPageErrorRecoveryAction(error: Error): "reload" | "reset" {
  return isPageLoadError(error) ? "reload" : "reset";
}