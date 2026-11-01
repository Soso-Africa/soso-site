import { useEffect, useState } from "react";
import { documentIsVisible } from "./use-document-visible";

export const STAFF_BACKGROUND_IDLE_MS = 5 * 60_000;

/**
 * Pause optional refreshes in hidden or unattended Staff tabs. This never
 * changes authentication, explicit actions, uploads or approval validation.
 */
export function observeStaffBackgroundActivity(onChange: (active: boolean) => void): () => void {
  const source = document;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: boolean | undefined;
  const publish = (value: boolean) => {
    if (active !== value) {
      active = value;
      onChange(value);
    }
  };
  const activity = () => {
    clearTimeout(timer);
    if (source.visibilityState === "hidden") {
      publish(false);
      return;
    }
    publish(true);
    timer = setTimeout(() => publish(false), STAFF_BACKGROUND_IDLE_MS);
  };
  const events = ["pointerdown", "keydown", "scroll", "visibilitychange"] as const;
  for (const event of events) source.addEventListener(event, activity, true);
  activity();
  return () => {
    clearTimeout(timer);
    for (const event of events) source.removeEventListener(event, activity, true);
  };
}

export function useStaffBackgroundActive(): boolean {
  const [active, setActive] = useState(documentIsVisible);
  useEffect(() => observeStaffBackgroundActivity(setActive), []);
  return active;
}
