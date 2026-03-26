import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { getConversations, updateConversation } from "../../controllers/apiController.js";

export const conversationsRouter = Router();

conversationsRouter.get("/conversations", requireAuth, getConversations);
conversationsRouter.patch("/conversations/:waId", requireAuth, updateConversation);
