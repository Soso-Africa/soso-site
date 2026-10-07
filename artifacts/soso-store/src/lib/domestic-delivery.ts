import type { CheckoutRequest } from "./commerce";

export function deliveryFromForm(form: FormData): Extract<CheckoutRequest["fulfillment"], { type: "delivery" }> {
  const field = (name: string) => String(form.get(name) ?? "").trim();
  const addressLines = [field("address"), field("addressLine2")].filter(Boolean);
  const region = field("region");
  const city = field("city");
  const deliveryInstructions = field("deliveryNote");
  return {
    type: "delivery", destinationCountry: "NG",
    address: [...addressLines, city, region, "Nigeria"].join(", "),
    shippingAddress: {
      country: "NG", region, city, postalCode: field("postalCode"), addressLines,
      recipientName: field("name"), recipientPhone: field("phone"),
      ...(deliveryInstructions ? { deliveryInstructions } : {}),
    },
  };
}
