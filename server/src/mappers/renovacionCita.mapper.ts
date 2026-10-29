// Convierte las citas de renovación de BD en lo que muestra el panel (puro, sin BD).
import { PilotoError } from "../errors/PilotoErrores.js";
import { RENOVACION_CITA_STATUS, type RenovacionCitaStatus } from "../shared/renovacion.constants.js";
import type { CreditNombreLean, RenovacionCitaDto, RenovacionCitaLean } from "../types/renovacion.types.js";

// Filtro ?status= del panel: vacío = todas; un valor fuera de la lista es error del que llama.
export function parseCitaStatusFilter(raw: string): RenovacionCitaStatus | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const status = RENOVACION_CITA_STATUS.find((valor) => valor === trimmed);
  if (!status) throw new PilotoError("STATUS_CITA_INVALIDO");
  return status;
}

// nombre null si su numeroCredito ya no está en Créditos (el panel muestra solo el WhatsApp).
export function toRenovacionCitaDto(cita: RenovacionCitaLean, nombre: string | null): RenovacionCitaDto {
  return {
    id: cita._id.toString(),
    waId: cita.waId,
    numeroCredito: cita.numeroCredito,
    nombre,
    monto: cita.monto,
    plazoSemanas: cita.plazoSemanas,
    tasaSemanal: cita.tasaSemanal,
    cuotaSemanal: cita.cuotaSemanal,
    fechaCita: cita.fechaCita ?? null,
    status: cita.status,
    createdAt: cita.createdAt.toISOString()
  };
}

// Une cada cita con el nombre de su crédito.
export function toRenovacionCitaDtos(citas: RenovacionCitaLean[], credits: CreditNombreLean[]): RenovacionCitaDto[] {
  const nombrePorCredito = new Map(credits.map((credit) => [credit.numeroCredito, credit.nombre]));
  return citas.map((cita) => toRenovacionCitaDto(cita, nombrePorCredito.get(cita.numeroCredito) ?? null));
}
