import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { getProspectsStats } from "../../controllers/apiController.js";

export const statsRouter = Router();

statsRouter.get("/stats/prospectos", requireAuth, getProspectsStats);
