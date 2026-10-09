import React from "react";
import { useReveal } from "@/hooks/use-reveal";
import { isHistoryReturn } from "@/lib/storefront-navigation";

export function Reveal({
  children,
  delay = 0,
  className = "",
  threshold = 0.12,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  threshold?: number;
}) {
  const { ref, shown } = useReveal(threshold);
  const visible = shown || isHistoryReturn();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(28px)",
        transition: isHistoryReturn() ? "none" : `opacity 0.9s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.9s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}
