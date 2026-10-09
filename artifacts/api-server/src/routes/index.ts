import purchaseConversionsRouter from "./purchase-conversions";
import { Router, type IRouter } from "express";
import analyticsRouter from "./analytics";
import contentRouter from "./content";
import displayPricesRouter from "./display-prices";
import faqRouter from "./faq";
import healthRouter from "./health";
import marketingPixelsRouter from "./marketing-pixels";
import paymentRouter from "./payment";
import redirectsRouter from "./redirects";
import sitemapRouter from "./sitemap";
import staffAuthRouter from "./staff-auth";
import staffMailRouter from "./staff-mail";
import staffActivationRouter from "./staff-activation";
import staffContentRouter from "./staff-content";
import staffRouter from "./staff";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(displayPricesRouter);
router.use(healthRouter);
router.use(marketingPixelsRouter);
router.use(analyticsRouter);
router.use(contentRouter);
router.use(faqRouter);
router.use(paymentRouter);
router.use(purchaseConversionsRouter);
router.use(redirectsRouter);
router.use(sitemapRouter);
router.use(staffAuthRouter);
router.use(staffMailRouter);
router.use(staffRouter);
router.use(staffActivationRouter);
router.use(staffContentRouter);
router.use(storageRouter);

export default router;
