// Acceso a datos de las citas de renovación del piloto.
import type { FilterQuery } from "mongoose";
import { Credit } from "../models/Credit.js";
import { RenovacionCita } from "../models/RenovacionCita.js";
import { toRenovacionCitaDtos } from "../mappers/renovacionCita.mapper.js";
import type { RenovacionCitaStatus } from "../shared/renovacion.constants.js";
import type { CreditNombreLean, RenovacionCitaDto, RenovacionCitaInput, RenovacionCitaLean } from "../types/renovacion.types.js";

// El panel muestra las más recientes; para el piloto no hace falta paginar.
const MAX_CITAS_PANEL = 200;

// Upsert atómico por (waId, status, fechaCita): si el webhook reintenta el mismo mensaje no se duplica la cita,
// y un cliente tiene a lo más una cita pendiente por día (o una sola solicitud "otro día" abierta).
export async function guardarCitaRenovacion(input: RenovacionCitaInput): Promise<void> {
  await RenovacionCita.findOneAndUpdate(
    { waId: input.waId, status: input.status, fechaCita: input.fechaCita },
    { $set: input },
    { upsert: true, setDefaultsOnInsert: true }
  );
}

// Citas para el panel (más recientes primero), con el nombre del cliente tomado de Créditos.
export async function listarCitasRenovacion(status: RenovacionCitaStatus | undefined): Promise<RenovacionCitaDto[]> {
  const filter: FilterQuery<RenovacionCitaLean> = status ? { status } : {};
  const citas = await RenovacionCita.find(filter).sort({ createdAt: -1 }).limit(MAX_CITAS_PANEL).lean<RenovacionCitaLean[]>();
  const numerosCredito = [...new Set(citas.map((cita) => cita.numeroCredito))];
  const credits = await Credit.find({ numeroCredito: { $in: numerosCredito } })
    .select("numeroCredito nombre")
    .lean<CreditNombreLean[]>();
  return toRenovacionCitaDtos(citas, credits);
}
