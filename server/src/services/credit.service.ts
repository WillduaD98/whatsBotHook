import { Credit } from "../models/Credit.js";

// Quita espacios y cualquier caracter no numérico; forma canónica usada como clave de búsqueda/índice
export function normalizeCreditNumber(raw: unknown): string {
  return String(raw ?? "").replace(/\D/g, "");
}

export async function findCreditByNumber(raw: unknown) {
  const numeroCredito = normalizeCreditNumber(raw);
  if (!numeroCredito) return null;
  return Credit.findOne({ numeroCredito, activo: true });
}

export interface CreditRow {
  numeroCredito?: unknown;
  nombre?: unknown;
  clabe?: unknown;
  referencia?: unknown;
}

export interface UpsertCreditsError {
  fila: number;
  motivo: string;
}

export interface UpsertCreditsResult {
  recibidos: number;
  insertados: number;
  actualizados: number;
  omitidos: number;
  errores: UpsertCreditsError[];
}

export async function upsertCredits(rows: unknown): Promise<UpsertCreditsResult> {
  const recibidos = Array.isArray(rows) ? rows.length : 0;
  const result: UpsertCreditsResult = { recibidos, insertados: 0, actualizados: 0, omitidos: 0, errores: [] };

  if (!Array.isArray(rows) || rows.length === 0) return result;

  const operations: any[] = [];
  // Mapea cada operación de bulkWrite de vuelta a su índice original en `rows`,
  // porque las filas inválidas se descartan antes de construir las operaciones
  const rowIndexByOperation: number[] = [];

  rows.forEach((row: CreditRow, index: number) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      result.omitidos++;
      result.errores.push({ fila: index, motivo: "Fila inválida" });
      return;
    }

    const numeroCredito = normalizeCreditNumber(row.numeroCredito);
    const nombre = String(row.nombre ?? "").trim();
    const clabe = String(row.clabe ?? "").trim();
    const referencia = String(row.referencia ?? "").trim();

    if (!numeroCredito) {
      result.omitidos++;
      result.errores.push({ fila: index, motivo: "numeroCredito vacío o inválido" });
      return;
    }
    if (!nombre) {
      result.omitidos++;
      result.errores.push({ fila: index, motivo: "nombre requerido" });
      return;
    }
    if (!clabe) {
      result.omitidos++;
      result.errores.push({ fila: index, motivo: "clabe requerida" });
      return;
    }
    if (!referencia) {
      result.omitidos++;
      result.errores.push({ fila: index, motivo: "referencia requerida" });
      return;
    }

    operations.push({
      updateOne: {
        filter: { numeroCredito },
        update: { $set: { numeroCredito, nombre, clabe, referencia } },
        upsert: true,
        setDefaultsOnInsert: true
      }
    });
    rowIndexByOperation.push(index);
  });

  if (operations.length === 0) return result;

  try {
    const bulkResult: any = await Credit.bulkWrite(operations, { ordered: false });
    result.insertados = bulkResult.upsertedCount ?? 0;
    result.actualizados = bulkResult.modifiedCount ?? 0;
  } catch (err: any) {
    // bulkWrite con ordered:false lanza al terminar pero conserva los resultados parciales de las operaciones que sí tuvieron éxito
    const writeErrors: any[] = err?.writeErrors ?? err?.result?.result?.writeErrors ?? [];
    if (writeErrors.length === 0) throw err;

    result.insertados = err?.result?.result?.nUpserted ?? err?.result?.upsertedCount ?? 0;
    result.actualizados = err?.result?.result?.nModified ?? err?.result?.modifiedCount ?? 0;

    for (const writeError of writeErrors) {
      const fila = rowIndexByOperation[writeError.index] ?? writeError.index;
      result.omitidos++;
      result.errores.push({ fila, motivo: writeError.errmsg || "Error al escribir en la base de datos" });
    }
  }

  return result;
}
