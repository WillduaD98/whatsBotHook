import { PaymentProof } from "../models/PaymentProof.js";

export interface CreatePaymentProofInput {
  waId: string;
  numeroCredito?: string | undefined;
  mediaUrl: string;
  mimeType?: string | undefined;
}

export async function createPaymentProof(input: CreatePaymentProofInput) {
  return PaymentProof.create({
    waId: input.waId,
    numeroCredito: input.numeroCredito,
    mediaUrl: input.mediaUrl,
    mimeType: input.mimeType
  });
}
