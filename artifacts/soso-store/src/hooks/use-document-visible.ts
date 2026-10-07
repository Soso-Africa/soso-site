import { useEffect, useState } from "react";

export function documentIsVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

export function observeDocumentVisibility(onChange: (visible: boolean) => void): () => void {
  const source = document;
  const update = () => onChange(source.visibilityState !== "hidden");
  source.addEventListener("visibilitychange", update);
  update();
  return () => source.removeEventListener("visibilitychange", update);
}

export function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(documentIsVisible);
  useEffect(() => observeDocumentVisibility(setVisible), []);
  return visible;
}