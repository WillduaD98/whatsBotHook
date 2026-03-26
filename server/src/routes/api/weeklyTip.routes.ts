import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { rateLimitByKey } from "../../middleware/rateLimit.js";
import { deleteActiveWeeklyTipImage, getActiveWeeklyTip, upsertActiveWeeklyTip } from "../../controllers/apiController.js";
import { weeklyTipUploadMiddleware } from "./uploads.js";

export const weeklyTipRouter = Router();

weeklyTipRouter.get("/weekly-tip/active", requireAuth, getActiveWeeklyTip);
weeklyTipRouter.delete("/weekly-tip/active/images/:imageId", requireAuth, deleteActiveWeeklyTipImage);
weeklyTipRouter.post(
  "/weekly-tip/active",
  requireAuth,
  rateLimitByKey({ windowMs: 60_000, max: 20, keyFn: (req) => req.ip || "unknown" }),
  weeklyTipUploadMiddleware,
  upsertActiveWeeklyTip
);
