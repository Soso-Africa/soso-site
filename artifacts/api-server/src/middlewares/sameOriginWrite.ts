import type { NextFunction, Request, Response } from "express";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Browser requests that carry a staff session cookie must come from the same
 * storefront origin. Unauthenticated public requests without an Origin header
 * remain available for rate-limited browser and future server integrations;
 * signed webhook routes must add their own signature verification.
 */
export function requireSameOriginForWrites(req: Request, res: Response, next: NextFunction): void {
  if (!MUTATING_METHODS.has(req.method) || !req.path.startsWith("/api")) {
    next();
    return;
  }

  const origin = req.get("origin");
  if (!origin) {
    if (req.staff) {
      res.status(403).json({ error: "Origin is required for authenticated write requests" });
      return;
    }
    next();
    return;
  }

  const host = req.get("x-forwarded-host") ?? req.get("host");
  if (!host) {
    res.status(403).json({ error: "Origin could not be verified" });
    return;
  }

  const protocol = req.get("x-forwarded-proto") ?? req.protocol;
  const expectedOrigin = `${protocol.split(",")[0].trim()}://${host.split(",")[0].trim()}`;

  if (origin !== expectedOrigin) {
    res.status(403).json({ error: "Cross-origin write requests are not allowed" });
    return;
  }

  next();
}