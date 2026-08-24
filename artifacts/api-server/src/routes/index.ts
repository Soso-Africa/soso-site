import { Router, type IRouter } from "express";
import analyticsRouter from "./analytics";
import contentRouter from "./content";
import faqRouter from "./faq";
import healthRouter from "./health";
import paymentRouter from "./payment";
import redirectsRouter from "./redirects";
import sitemapRouter from "./sitemap";
<<<<<<< HEAD
import staffAuthRouter from "./staff-auth";
=======
>>>>>>> github/main
import staffContentRouter from "./staff-content";
import staffRouter from "./staff";

const router: IRouter = Router();

router.use(healthRouter);
router.use(analyticsRouter);
router.use(contentRouter);
router.use(faqRouter);
router.use(paymentRouter);
router.use(redirectsRouter);
router.use(sitemapRouter);
<<<<<<< HEAD
router.use(staffAuthRouter);
=======
>>>>>>> github/main
router.use(staffRouter);
router.use(staffContentRouter);

export default router;
