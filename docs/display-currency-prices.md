# SOSO display-only currency prices

This feature is implemented in the workspace. It has not been released to shopsoso.co.

## Shopper experience

- Country classification comes from Vercel's country header, never browser language or GPS permission. Unknown locations fall back to NGN.
- The default currency is a currently supported local tender from Unicode CLDR 48.1. An unavailable currency falls back to NGN.
- Shoppers can override the default in the footer's **Display currency** selector or the mobile navigation menu. **Automatic** restores country-based selection.
- The explicit selection is saved as a functional browser preference. If storage is blocked, it still works for the current page.
- Product cards, product details and add-to-cart labels, quick views, search results, cart lines and cart subtotal use approximate ISO-labelled local prices.
- Price-filter inputs remain explicitly labelled NGN, so their numerical meaning is not silently changed.
- Checkout item prices, subtotal, confirmed quote, payment button, provider request, order and refund remain NGN.
- Converted values are prefixed with `≈`. The site explains that payment is in NGN and banks may apply different exchange rates/fees. Currency selection does not enable international shipping or foreign-card acceptance.

## Rate source and safeguards

- ExchangeRate-API open access endpoint, requested server-side with NGN as the base. No API key or shopper data is sent to it.
- Official documentation: https://www.exchangerate-api.com/docs/free
- Daily rates are cached per API-server instance, with shared in-flight requests and five-minute failure backoff. Different serverless instances do not yet share the cache.
- A snapshot older than 48 hours, invalid response, unsupported currency, oversized response or network failure cannot produce a fabricated conversion.
- A still-valid cached estimate may remain usable during a provider outage; its update date is shown. Otherwise prices revert to original NGN values, with a retry control.
- Responses provide converted amounts for the shopper's bounded display request, not a redistributed exchange-rate feed.
- Required provider attribution appears in the currency notice. The pinned Unicode country-currency mapping's license is included beside the data.
- Currency preference and browser conversion responses do not alter merchant product records, shopping-cart prices, advertising money, checkout arithmetic, or SEO price schemas.

## Release boundary

Publish from the latest GitHub production main only. The workspace also contains the separate unreleased domestic-delivery changes: do not release the entire local tree or carry that older generated delivery contract into the currency release accidentally. Reconcile the narrow currency source/spec changes against current main and regenerate contracts there.
