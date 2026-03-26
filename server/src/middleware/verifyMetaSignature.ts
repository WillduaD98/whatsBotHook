import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";

function timingSafeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function verifyMetaSignature(req: Request, res: Response, next: NextFunction): void {
  // Header: X-Hub-Signature-256: sha256=...
  const sigHeader = req.header("X-Hub-Signature-256");
  if (!sigHeader) {
    res.sendStatus(403);
    return;
  }

  const rawBody = (req as any).rawBody as Buffer | undefined;
  if (!rawBody) {
    res.sendStatus(400);
    return;
  }

  const expected = "sha256=" + crypto
    .createHmac("sha256", env.META_APP_SECRET)
    .update(rawBody)
    .digest("hex");

  if (!timingSafeEqual(sigHeader, expected)) {
    res.sendStatus(403);
    return;
  }
  next();
}
