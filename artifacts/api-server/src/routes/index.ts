import { Router, type IRouter } from "express";
import analyticsRouter from "./analytics";
import contentRouter from "./content";
import faqRouter from "./faq";
import healthRouter from "./health";
import marketingPixelsRouter from "./marketing-pixels";
import paymentRouter from "./payment";
import redirectsRouter from "./redirects";
import sitemapRouter from "./sitemap";
import staffAuthRouter from "./staff-auth";
import staffContentRouter from "./staff-content";
import staffRouter from "./staff";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(marketingPixelsRouter);
router.use(analyticsRouter);
router.use(contentRouter);
router.use(faqRouter);
router.use(paymentRouter);
router.use(redirectsRouter);
router.use(sitemapRouter);
router.use(staffAuthRouter);
router.use(staffRouter);
router.use(staffContentRouter);
router.use(storageRouter);

export default router;
