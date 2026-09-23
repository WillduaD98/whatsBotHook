import { Router } from "express";
// import { rateLimitByKey } from "../middleware/rateLimit.js";
// import { waIdFromBody } from "../services/waid.service.js";
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
// Aplica seguridad (firma Meta) , y delega al controlador
//Se elimina Ratelimit por ser una fuente confiable (META)
webhookRouter.post(
  "/webhook",
  ...(process.env.NODE_ENV === "production" ? [verifyMetaSignature] : []),
  handleWebhookPost
);
