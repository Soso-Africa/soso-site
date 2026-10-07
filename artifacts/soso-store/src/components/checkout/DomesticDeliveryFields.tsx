import React from "react";

const states = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno",
  "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "Federal Capital Territory",
  "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara",
  "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers",
  "Sokoto", "Taraba", "Yobe", "Zamfara",
];
const inputClass = "mt-2 w-full bg-transparent border border-border px-4 py-3.5 outline-none focus:border-foreground";

export function DomesticDeliveryFields() {
  return (
    <fieldset className="space-y-4 text-sm" data-testid="domestic-delivery-fields">
      <legend className="font-semibold">Delivery address</legend>
      <p className="text-xs leading-relaxed text-secondary">
        Delivery within Nigeria only. We will use the name and phone number above for the recipient.
        Delivery charges will be shown in your order review before payment. International delivery is not available yet.
      </p>
      <label className="block">Country<input value="Nigeria" readOnly className={inputClass} autoComplete="country-name" /></label>
      <label className="block">Street address<input required name="address" maxLength={250} autoComplete="address-line1" className={inputClass} /></label>
      <label className="block">Apartment, building or landmark (optional)<input name="addressLine2" maxLength={250} autoComplete="address-line2" className={inputClass} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">State / FCT
          <select required name="region" defaultValue="" autoComplete="address-level1" className={inputClass}>
            <option value="">Select a state</option>
            {states.map((state) => <option key={state} value={state}>{state}</option>)}
          </select>
        </label>
        <label className="block">City / town<input required name="city" maxLength={120} autoComplete="address-level2" className={inputClass} /></label>
      </div>
      <label className="block">Postal code (if known)
        <input name="postalCode" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="postal-code" className={inputClass} />
      </label>
    </fieldset>
  );
}
