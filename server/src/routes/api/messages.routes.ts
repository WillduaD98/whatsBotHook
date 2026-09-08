import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { getMessages, sendMessage, sendWeeklyTip, sendPaymentReminder } from "../../controllers/messages.controller.js";
import { weeklyTipTemplateUploadMiddleware } from "./uploads.js";
import { rateLimitByKey } from "../../middleware/rateLimit.js";
export const messagesRouter = Router();

messagesRouter.get("/messages/:waId", requireAuth, getMessages);
messagesRouter.post("/messages/send", 
    requireAuth, 
    rateLimitByKey({ windowMs: 60_000, max: 15, keyFn:(req) => req.ip || "unknown" }),
    sendMessage);
messagesRouter.post("/chats/:waId/weekly-tip", requireAuth, weeklyTipTemplateUploadMiddleware, sendWeeklyTip);
messagesRouter.post("/chats/:waId/payment-reminder", requireAuth, sendPaymentReminder);
