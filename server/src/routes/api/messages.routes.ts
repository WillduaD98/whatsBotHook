import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { getMessages, sendMessage, sendWeeklyTip, sendPaymentReminder, sendPaymentProofExample } from "../../controllers/messages.controller.js";
import { weeklyTipTemplateUploadMiddleware, templateVideoUploadMiddleware } from "./uploads.js";
import { rateLimitByKey } from "../../middleware/rateLimit.js";
import { sendPilotoTemplate } from "../../controllers/piloto.controller.js";
export const messagesRouter = Router();

messagesRouter.get("/messages/:waId", requireAuth, getMessages);
messagesRouter.post("/messages/send", 
    requireAuth, 
    rateLimitByKey({ windowMs: 60_000, max: 15, keyFn:(req) => req.ip || "unknown" }),
    sendMessage);
messagesRouter.post("/chats/:waId/weekly-tip", requireAuth, weeklyTipTemplateUploadMiddleware, sendWeeklyTip);
messagesRouter.post("/chats/:waId/payment-reminder", requireAuth, sendPaymentReminder);
// Plantilla ejemplo_comprobante_pago: video de cómo hacer válido el comprobante (para clientes nuevos).
messagesRouter.post("/chats/:waId/payment-proof-example", requireAuth, templateVideoUploadMiddleware, sendPaymentProofExample);
// Plantillas del piloto (streak_alert, due_date_action, prox_credito_gancho) con datos del cliente en BD.
messagesRouter.post("/chats/:waId/piloto-template", requireAuth, sendPilotoTemplate);
