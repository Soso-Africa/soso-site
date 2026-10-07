import { Router } from "express";
import { DisplayPricesBody } from "@workspace/api-zod";
import { createRateLoader, convertDisplayPrices } from "../lib/display-prices";
import { trustedCountryCode } from "./consent-region";

const router = Router();
const loadRates = createRateLoader();
router.post("/price-display", async (req, res): Promise<void> => {
  const input = DisplayPricesBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Choose a valid display currency and up to 128 valid naira amounts." });
    return;
  }
  // Country classification and preferences must never be shared across shoppers.
  res.setHeader("Cache-Control", "private, no-store");
  res.json(convertDisplayPrices(await loadRates(), input.data.currency, trustedCountryCode(req.headers), input.data.amounts));
});
export default router;
