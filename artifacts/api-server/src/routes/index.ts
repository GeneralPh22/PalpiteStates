import { Router, type IRouter } from "express";
import healthRouter from "./health";
import matchesRouter from "./matches";
import playersRouter from "./players";
import oddsRouter from "./odds";
import leaguesRouter from "./leagues";
import aiRouter from "./ai";
import footballApiRouter from "./football-api";

const router: IRouter = Router();

router.use(healthRouter);
router.use(matchesRouter);
router.use(playersRouter);
router.use(oddsRouter);
router.use(leaguesRouter);
router.use(aiRouter);
router.use(footballApiRouter);

export default router;
