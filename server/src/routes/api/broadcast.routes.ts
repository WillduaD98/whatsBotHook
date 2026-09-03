import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { rateLimitByKey } from "../../middleware/rateLimit.js";
import { broadcastWeeklyTip, sendBroadcast } from "../../controllers/broadcast.controller.js";
import { broadcastUploadMiddleware, weeklyTipTemplateUploadMiddleware } from "./uploads.js";

export const broadcastRouter = Router();

broadcastRouter.post(
  "/broadcast/send",
  requireAuth,
  rateLimitByKey({ windowMs: 60_000, max: 2, keyFn: (req) => req.ip || "unknown" }),
  broadcastUploadMiddleware,
  sendBroadcast
);

broadcastRouter.post(
  "/broadcast/weekly-tip",
  requireAuth,
  rateLimitByKey({ windowMs: 60_000, max: 2, keyFn: (req) => req.ip || "unknown" }),
  weeklyTipTemplateUploadMiddleware,
  broadcastWeeklyTip
);
