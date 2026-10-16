export const customSizingFields = [
  { key: "height", label: "Height" },
  { key: "chest", label: "Chest" },
  { key: "waist", label: "Waist" },
  { key: "hips", label: "Hips" },
  { key: "shoulder", label: "Shoulder" },
  { key: "sleeve", label: "Sleeve length" },
  { key: "garmentLength", label: "Garment length" },
] as const;

/** Order instructions only: these never confirm fit or overwrite saved profiles. */
export function customSizingOrderNotes(form: FormData, hasCustomItems: boolean): string {
  const deliveryNote = String(form.get("deliveryNote") ?? "").trim();
  let sizing = "";
  if (hasCustomItems) {
    const choice = form.get("customSizingChoice");
    if (choice === "later") {
      sizing = "Custom sizing (all Custom-size items): please contact me to arrange measurements after payment. Fitting not yet booked.";
    } else if (choice === "now") {
      const unit = form.get("customSizingUnit");
      if (unit !== "cm" && unit !== "in") throw new Error("Choose centimetres or inches for your measurements.");
      const entries = customSizingFields.flatMap(({ key, label }) => {
        const raw = String(form.get(`customSizing-${key}`) ?? "").trim();
        if (!raw) return [];
        const value = Number(raw);
        const max = unit === "cm" ? 300 : 120;
        if (!Number.isFinite(value) || value <= 0 || value > max) {
          throw new Error(`Enter a valid ${label.toLowerCase()} measurement between 0 and ${max} ${unit}.`);
        }
        return [`${label}: ${value}`];
      });
      if (!entries.length) throw new Error("Enter at least one measurement, or choose to have your measurements taken later.");
      sizing = `Custom sizing (all Custom-size items), shopper supplied, ${unit}: ${entries.join("; ")}. Atelier must confirm fit before production.`;
    } else {
      throw new Error("Choose whether to enter measurements now or have them taken later.");
    }
  }
  const notes = [deliveryNote, sizing].filter(Boolean).join("\n\n");
  // Match the existing merchant order-notes boundary; never silently lose sizing.
  if (notes.length > 1_000) throw new Error("Shorten your order note so your measurements and instructions fit within 1,000 characters.");
  return notes;
}
