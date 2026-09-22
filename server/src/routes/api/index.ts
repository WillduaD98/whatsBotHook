import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { broadcastRouter } from "./broadcast.routes.js";
import { conversationsRouter } from "./conversations.routes.js";
import { creditsRouter } from "./credits.routes.js";
import { messagesRouter } from "./messages.routes.js";
import { paymentProofRouter } from "./paymentProof.routes.js";
import { statsRouter } from "./stats.routes.js";
import { weeklyTipRouter } from "./weeklyTip.routes.js";

export const apiRouter = Router();

apiRouter.use(authRouter);
apiRouter.use(conversationsRouter);
apiRouter.use(messagesRouter);
apiRouter.use(broadcastRouter);
apiRouter.use(weeklyTipRouter);
apiRouter.use(statsRouter);
apiRouter.use(creditsRouter);
apiRouter.use(paymentProofRouter);
