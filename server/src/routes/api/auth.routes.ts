import { Router } from "express";
import { rateLimitByKey } from "../../middleware/rateLimit.js";
import { login } from "../../controllers/authController.js";

export const authRouter = Router();

authRouter.post(
  "/auth/login",
  rateLimitByKey({
    windowMs: 60_000,
    max: 5,
    keyFn: (req) => (req.ip || "unknown") + ":" + String((req.body || {}).username || "nouser")
  }),
  login
);
