import type { Request, Response, NextFunction } from "express";

/** Cookie-authenticated shopper writes always require same-origin proof. */
export function requireShopperOrigin(req: Request, res: Response, next: NextFunction): void {
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(req.method) || !req.shopper) {
    next();
    return;
  }
  const host = (req.get("x-forwarded-host") ?? req.get("host"))?.split(",")[0]?.trim();
  const protocol = (req.get("x-forwarded-proto") ?? req.protocol).split(",")[0]?.trim();
  if (!host || req.get("origin") !== `${protocol}://${host}`) {
    res.status(403).json({ error: "Same-origin proof is required for account changes.", code: "ORIGIN_REQUIRED" });
    return;
  }
  next();
}
