import { Router, type IRouter } from "express";
import analyticsRouter from "./analytics";
import contentRouter from "./content";
import healthRouter from "./health";
import staffRouter from "./staff";

const router: IRouter = Router();

router.use(healthRouter);
router.use(analyticsRouter);
router.use(contentRouter);
router.use(staffRouter);

export default router;
