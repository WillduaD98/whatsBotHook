import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { getMessages, sendMessage, sendWeeklyTip, sendPaymentReminder } from "../../controllers/apiController.js";
import { weeklyTipTemplateUploadMiddleware } from "./uploads.js";

export const messagesRouter = Router();

messagesRouter.get("/messages/:waId", requireAuth, getMessages);
messagesRouter.post("/messages/send", requireAuth, sendMessage);
messagesRouter.post("/chats/:waId/weekly-tip", requireAuth, weeklyTipTemplateUploadMiddleware, sendWeeklyTip);
messagesRouter.post("/chats/:waId/payment-reminder", requireAuth, sendPaymentReminder);
