// Cita de renovación que agenda el bot al final del flujo RENOVACION:* (la confirma un asesor).
// Guarda lo que el bot le ofreció al cliente: monto, plazo, tasa y cuota estimada.
import mongoose from "mongoose";
import { PLAZOS_SEMANAS } from "../shared/clienteCredito.constants.js";
import { RENOVACION_CITA_STATUS } from "../shared/renovacion.constants.js";

export const RenovacionCitaSchema = new mongoose.Schema(
  {
    waId: { type: String, required: true, index: true, trim: true },
    numeroCredito: { type: String, required: true, trim: true },
    monto: { type: Number, required: true, min: 0 },
    plazoSemanas: { type: Number, required: true, enum: [...PLAZOS_SEMANAS] },
    tasaSemanal: { type: Number, required: true, min: 0 },
    cuotaSemanal: { type: Number, required: true, min: 0 },
    // Día de la visita en hora de México ("YYYY-MM-DD"); null mientras el asesor no fije fecha (pendiente_fecha).
    fechaCita: { type: String, default: null },
    status: { type: String, required: true, enum: [...RENOVACION_CITA_STATUS], index: true }
  },
  { timestamps: true }
);

export const RenovacionCita = mongoose.model("RenovacionCita", RenovacionCitaSchema);
