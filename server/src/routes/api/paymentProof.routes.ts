import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { listPaymentProofs, updatePaymentProofStatus } from "../../controllers/paymentProof.controller.js";

export const paymentProofRouter = Router();

paymentProofRouter.get("/payment-proofs", requireAuth, listPaymentProofs);
paymentProofRouter.patch("/payment-proofs/:id", requireAuth, updatePaymentProofStatus);
