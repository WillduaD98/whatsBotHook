// Reglas duras de la renovación (puras, sin BD): el monto nunca pasa del límite y el plazo siempre es
// uno de los autorizados del cliente. Se aplican al capturar y otra vez justo antes de agendar.
import { isPlazoSemanas, type PlazoSemanas } from "../shared/clienteCredito.constants.js";
import type {
  MontoValidacion,
  RenovacionCliente,
  RenovacionSlots,
  RenovacionSolicitud
} from "../types/renovacion.types.js";
import { parseMonto } from "../utils/money.js";
import { calcularCuota } from "./cuota.mapper.js";

// Prefijo del id de cada opción de la lista de plazos ("RENOV_PLAZO_8").
export const PLAZO_OPCION_PREFIX = "RENOV_PLAZO_";

// Plazos del cliente que también son plazos permitidos, sin repetidos y en orden (lo que se le muestra en la lista).
export function plazosDelCliente(cliente: Pick<RenovacionCliente, "plazos">): PlazoSemanas[] {
  return [...new Set(cliente.plazos.filter(isPlazoSemanas))].sort((a, b) => a - b);
}

// Hay algo que ofrecer solo con límite > 0 y al menos un plazo; si no, aplica el flujo de NO RENOVACIÓN.
export function renovacionAutorizada(cliente: Pick<RenovacionCliente, "limite" | "plazos">): boolean {
  return cliente.limite > 0 && plazosDelCliente(cliente).length > 0;
}

// Monto escrito por el cliente ("8000", "8,000" o "$8,000"): número > 0 y ≤ su límite.
export function validarMonto(raw: string, limite: number): MontoValidacion {
  const monto = parseMonto(raw);
  if (monto === null || monto <= 0) return { ok: false, motivo: "NO_ES_NUMERO" };
  if (monto > limite) return { ok: false, motivo: "EXCEDE_LIMITE" };
  return { ok: true, monto };
}

// Plazo de la opción tocada en la lista; null si el id no es de la lista o el plazo no es del cliente.
export function plazoDesdeOpcion(opcionId: string | undefined, cliente: Pick<RenovacionCliente, "plazos">): PlazoSemanas | null {
  if (!opcionId?.startsWith(PLAZO_OPCION_PREFIX)) return null;
  const plazo = Number(opcionId.slice(PLAZO_OPCION_PREFIX.length));
  return plazosDelCliente(cliente).find((permitido) => permitido === plazo) ?? null;
}

// GUARDRAIL: revalida lo guardado en la conversación contra el perfil actual y recalcula la cuota con la tasa de BD.
// null = algo no cuadra (no hay monto/plazo, el límite bajó, el plazo ya no es suyo) → no se agenda.
export function construirSolicitud(slots: RenovacionSlots, cliente: RenovacionCliente): RenovacionSolicitud | null {
  const { monto, plazoSemanas } = slots;
  if (monto === undefined || plazoSemanas === undefined) return null;
  if (monto <= 0 || monto > cliente.limite) return null;
  if (!plazosDelCliente(cliente).includes(plazoSemanas)) return null;
  return { monto, plazoSemanas, cuotaSemanal: calcularCuota({ monto, plazoSemanas, tasaSemanal: cliente.tasaSemanal }) };
}

// Lee conv.slots.renovacion sin confiar en su forma (es un objeto libre en BD): solo toma valores válidos.
export function readRenovacionSlots(slots: Record<string, unknown> | undefined): RenovacionSlots {
  const raw = slots?.renovacion;
  if (!raw || typeof raw !== "object") return {};
  const monto = "monto" in raw && typeof raw.monto === "number" ? raw.monto : undefined;
  const plazo = "plazoSemanas" in raw && typeof raw.plazoSemanas === "number" ? raw.plazoSemanas : undefined;
  return {
    ...(monto !== undefined && { monto }),
    ...(plazo !== undefined && isPlazoSemanas(plazo) && { plazoSemanas: plazo })
  };
}
