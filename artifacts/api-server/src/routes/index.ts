import { Router, type IRouter } from "express";
import healthRouter from "./health";
import contentRouter from "./content";
import authRouter, { requireAuth } from "./auth";
import publishingRouter from "./publishing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(requireAuth, contentRouter);
router.use(requireAuth, publishingRouter);

export default router;
