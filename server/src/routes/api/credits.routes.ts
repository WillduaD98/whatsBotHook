import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { rateLimitByKey } from "../../middleware/rateLimit.js";
import { listCredits, uploadCredits } from "../../controllers/credits.controller.js";
import { creditsCsvUploadMiddleware } from "./uploads.js";

export const creditsRouter = Router();

creditsRouter.get("/credits", requireAuth, listCredits);
creditsRouter.post(
  "/credits/upload",
  requireAuth,
  rateLimitByKey({ windowMs: 60_000, max: 5, keyFn: (req) => req.ip || "unknown" }),
  creditsCsvUploadMiddleware,
  uploadCredits
);
