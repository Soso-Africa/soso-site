import { Router, type IRouter } from "express";
import analyticsRouter from "./analytics";
import contentRouter from "./content";
import faqRouter from "./faq";
import healthRouter from "./health";
import staffContentRouter from "./staff-content";
import staffRouter from "./staff";

const router: IRouter = Router();

router.use(healthRouter);
router.use(analyticsRouter);
router.use(contentRouter);
router.use(faqRouter);
router.use(staffRouter);
router.use(staffContentRouter);

export default router;
