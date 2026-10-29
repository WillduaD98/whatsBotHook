// Perfil de crédito del cliente para el piloto de renovación: límite, plazos autorizados, tasa, nivel y racha.
// Se busca por waId; el nombre, la CLABE y la referencia NO se duplican aquí: salen de Credit vía numeroCredito.
import mongoose from "mongoose";
import { NIVELES_CONFIANZA, PLAZOS_SEMANAS, TASA_SEMANAL_DEFAULT } from "../shared/clienteCredito.constants.js";

// waId se guarda normalizado (52 + 10 dígitos, sin el "1" de 521) para que haga match con Conversation.waId.
export const ClienteCreditoSchema = new mongoose.Schema(
  {
    waId: { type: String, required: true, unique: true, index: true, trim: true },
    numeroCredito: {
      type: String,
      required: true,
      index: true,
      trim: true,
      set: (value: string) => (value ?? "").replace(/\D/g, "")
    },
    // 0 = renovación no autorizada (su historial no lo permite por ahora); en ese caso plazos puede ir vacío.
    limite: { type: Number, required: true, min: 0 },
    plazos: { type: [{ type: Number, enum: [...PLAZOS_SEMANAS] }], default: [] },
    tasaSemanal: { type: Number, required: true, min: 0, default: TASA_SEMANAL_DEFAULT },
    nivel: { type: Number, required: true, enum: [...NIVELES_CONFIANZA], default: 1 },
    // Pagos seguidos en tiempo y forma (no semanas); es el número que muestran las plantillas.
    racha: { type: Number, required: true, min: 0, default: 0 },
    renovaciones: { type: Number, required: true, min: 0, default: 0 },
    activo: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const ClienteCredito = mongoose.model("ClienteCredito", ClienteCreditoSchema);
