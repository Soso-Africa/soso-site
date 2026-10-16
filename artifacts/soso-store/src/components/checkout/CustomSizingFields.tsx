import React, { useState } from "react";
import { customSizingFields } from "@/lib/custom-sizing";

export function CustomSizingFields() {
  const [choice, setChoice] = useState("later");
  const [unit, setUnit] = useState("cm");
  return (
    <fieldset className="space-y-4 border border-border p-5" data-testid="checkout-custom-sizing">
      <legend className="px-2 text-sm font-medium">Custom sizing</legend>
      <p className="text-sm text-secondary">
        These instructions apply to all Custom-size pieces in this order. Buying for different people? Place separate orders.
        Payment comes first; the atelier confirms measurements before production.
      </p>
      <label className="flex items-start gap-3 text-sm">
        <input type="radio" name="customSizingChoice" value="later" checked={choice === "later"} onChange={() => setChoice("later")} className="mt-1" />
        Please contact me to have my measurements taken later
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input type="radio" name="customSizingChoice" value="now" checked={choice === "now"} onChange={() => setChoice("now")} className="mt-1" />
        I have measurements to enter now
      </label>
      {choice === "now" ? (
        <div className="space-y-4">
          <label className="block text-sm">Measurement unit
            <select name="customSizingUnit" value={unit} onChange={(event) => setUnit(event.target.value)} className="mt-2 w-full border border-border bg-transparent px-3 py-3">
              <option value="cm">Centimetres (cm)</option>
              <option value="in">Inches (in)</option>
            </select>
          </label>
          <p className="text-xs text-secondary">Enter the measurements you know. Leave unknown fields blank; the atelier will confirm any missing details.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {customSizingFields.map(({ key, label }) => (
              <label key={`${key}-${unit}`} className="text-sm">{label} ({unit})
                <input name={`customSizing-${key}`} type="number" inputMode="decimal" min="0.01" max={unit === "cm" ? 300 : 120} step="any"
                  className="mt-2 w-full border border-border bg-transparent px-3 py-3" />
              </label>
            ))}
          </div>
          <p className="text-xs text-secondary">Sent privately with this order, not saved as a confirmed measurement profile. Changing units clears the values to avoid mixing units.</p>
        </div>
      ) : (
        <p role="status" className="text-xs text-secondary">Your request will accompany the order. SOSO will arrange the next steps after payment; this does not book a fitting appointment.</p>
      )}
    </fieldset>
  );
}
