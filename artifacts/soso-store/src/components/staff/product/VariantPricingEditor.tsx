import React from "react";
import type { CatalogProduct } from "../../../data/platformContent";
import { purchaseChoicePrice } from "../../../lib/purchasing";

type RemoteProduct = { amountKobo: number; variants: Array<{ id: string; amountKobo: number }> };

export function refreshLinkedVariantPrices(product: CatalogProduct, remote: RemoteProduct): CatalogProduct {
  const choices = [
    ...(product.standardEligible ? product.standardSizes : []),
    ...(product.customEligible ? ["Custom"] : []),
  ];
  const prices: Record<string, number> = {};
  choices.forEach((choice) => {
    const variant = remote.variants.find((item) => item.id === product.commerceVariantIds?.[choice]);
    if (variant) prices[choice] = variant.amountKobo / 100;
    else if (product.variantPrices?.[choice] !== undefined) prices[choice] = product.variantPrices[choice];
  });
  return { ...product, price: remote.amountKobo / 100, variantPrices: prices, commerceMappingConfirmation: undefined };
}

export function VariantPricingEditor({ product, remote, onChange }: {
  product: CatalogProduct;
  remote?: RemoteProduct;
  onChange: (product: CatalogProduct) => void;
}) {
  const choices = [
    ...(product.standardEligible ? product.standardSizes : []),
    ...(product.customEligible ? ["Custom"] : []),
  ];
  const linked = choices.filter((choice) => remote?.variants.some((variant) =>
    variant.id === product.commerceVariantIds?.[choice]));
  if (!choices.length) return null;
  return <section className="space-y-3 border border-border p-3" aria-label="Size variant prices">
    <h5 className="text-xs font-semibold">Prices by size / variant (NGN)</h5>
    <p className="text-xs leading-5 text-muted-foreground">
      Selecting a JusticeSure variant copies its price to that size. Refresh prices after changing
      JusticeSure, then review and confirm the mapping again before publishing.
      Unset size prices use the base product price.
    </p>
    <button type="button" disabled={!remote || linked.length === 0}
      className="min-h-10 border border-border px-3 text-xs disabled:opacity-40"
      data-testid={`button-sync-variant-prices-${product.slug}`}
      onClick={() => {
        if (!remote) return;
        onChange(refreshLinkedVariantPrices(product, remote));
      }}>Refresh linked prices from JusticeSure</button>
    {choices.map((choice) => {
      const variant = remote?.variants.find((item) => item.id === product.commerceVariantIds?.[choice]);
      const price = purchaseChoicePrice(product, choice);
      const mismatch = variant && Math.round(price * 100) !== variant.amountKobo;
      return <div key={choice} className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs">{choice} price (NGN)
          <input type="number" min="0.01" max="1000000000" step="0.01"
            className="staff-input mt-1 text-xs" value={product.variantPrices?.[choice] ?? ""}
            placeholder={`Base price: ${product.price}`}
            data-testid={`input-variant-price-${product.slug}-${choice}`}
            onChange={(event) => {
              const prices = { ...product.variantPrices };
              if (event.target.value === "") delete prices[choice];
              else prices[choice] = Number(event.target.value);
              onChange({ ...product, variantPrices: Object.keys(prices).length ? prices : undefined, commerceMappingConfirmation: undefined });
            }} />
        </label>
        <p className={`self-center text-xs ${mismatch ? "text-destructive" : "text-muted-foreground"}`}>
          {variant ? `JusticeSure: NGN ${(variant.amountKobo / 100).toLocaleString()}${mismatch ? " — mismatch; refresh before confirming." : " — matches."}` : "Link this size to its JusticeSure variant."}
        </p>
      </div>;
    })}
  </section>;
}
