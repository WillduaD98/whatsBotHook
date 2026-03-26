import { Router } from "express";
import { rateLimitByKey } from "../middleware/rateLimit.js";
import { waIdFromBody } from "../services/waid.service.js";
import { handleWebhookGet, handleWebhookPost } from "../controllers/webhookController.js";
import { apiRouter } from "./api/index.js";
import { verifyMetaSignature } from "../middleware/verifyMetaSignature.js";

// Instancia del enrutador de Express
export const webhookRouter = Router();

webhookRouter.use("/api", apiRouter);

// GET /webhook → verificación de suscripción (challenge)
// La lógica vive en el controlador; aquí solo se conecta la ruta
webhookRouter.get("/webhook", handleWebhookGet);

// POST /webhook → recepción de mensajes entrantes
// Aplica seguridad (firma Meta) + rate limit por waId, y delega al controlador
webhookRouter.post(
  "/webhook",
  ...(process.env.NODE_ENV === "production" ? [verifyMetaSignature] : []),
  rateLimitByKey({ windowMs: 60_000, max: 15, keyFn: waIdFromBody as any }),
  handleWebhookPost
);
