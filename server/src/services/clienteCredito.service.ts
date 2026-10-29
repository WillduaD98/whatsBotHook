// Acceso a datos del perfil de crédito del cliente (piloto de renovación).
import { ClienteCredito } from "../models/ClienteCredito.js";
import { clasificarFilasPiloto } from "../mappers/clienteCreditoCsv.mapper.js";
import type {
  CargaClientesCreditoResumen,
  ClienteCreditoCsvRow,
  ClienteCreditoInput,
  ClienteCreditoLean
} from "../types/clienteCredito.types.js";
import { normalizeTo } from "./waid.service.js";
import { findCreditByNumber } from "./credit.service.js";

// Perfil activo del cliente; normaliza el waId para que "521…" y "52…" encuentren el mismo documento.
export async function findClienteCreditoByWaId(waId: string): Promise<ClienteCreditoLean | null> {
  return ClienteCredito.findOne({ waId: normalizeTo(waId.trim()), activo: true }).lean<ClienteCreditoLean>();
}

// Perfil del piloto + su Credit (nombre, CLABE, referencia). credit es null si no hay perfil o si su numeroCredito
// no existe en Créditos; quien llama decide qué hacer en cada caso.
export async function findClienteConCredito(waId: string) {
  const cliente = await findClienteCreditoByWaId(waId);
  const credit = cliente ? await findCreditByNumber(cliente.numeroCredito) : null;
  return { cliente, credit };
}

// Upsert por waId: crea el perfil o actualiza solo los campos que vinieron en el CSV.
function toUpsertOperation(input: ClienteCreditoInput) {
  const { waId, ...campos } = input;
  return {
    updateOne: {
      filter: { waId },
      update: { $set: campos },
      upsert: true,
      setDefaultsOnInsert: true
    }
  };
}

// Carga las columnas del piloto del CSV de créditos; las filas sin datos del piloto se ignoran.
export async function cargarClientesCreditoDesdeCsv(rows: ClienteCreditoCsvRow[]): Promise<CargaClientesCreditoResumen> {
  const { recibidos, inputs, errores } = clasificarFilasPiloto(rows);
  const resumen: CargaClientesCreditoResumen = { recibidos, insertados: 0, actualizados: 0, omitidos: errores.length, errores };
  if (inputs.length === 0) return resumen;

  const result = await ClienteCredito.bulkWrite(inputs.map(toUpsertOperation), { ordered: false });
  resumen.insertados = result.upsertedCount;
  resumen.actualizados = result.modifiedCount;
  return resumen;
}
