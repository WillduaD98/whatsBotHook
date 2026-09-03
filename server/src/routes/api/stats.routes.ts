import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { getProspectsStats } from "../../controllers/stats.controller.js";

export const statsRouter = Router();

statsRouter.get("/stats/prospectos", requireAuth, getProspectsStats);
