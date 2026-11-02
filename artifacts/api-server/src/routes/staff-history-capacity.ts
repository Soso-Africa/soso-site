import { Router, type IRouter } from "express";
import { requireStaff, requireStaffRoles } from "../middlewares/staff";
import { getCatalogueHistoryCapacity } from "../lib/catalogue-history-capacity";

const router: IRouter = Router();
router.get("/staff/catalogue-history-capacity", requireStaff, requireStaffRoles("owner"), async (req, res): Promise<void> => {
  res.set("Cache-Control", "private, no-store");
  try {
    res.json(await getCatalogueHistoryCapacity());
  } catch {
    req.log.warn("Catalogue history capacity cache unavailable");
    res.status(503).json({ error: "Storage measurements are unavailable. This does not mean usage is within budget. Try again later." });
  }
});
export default router;
