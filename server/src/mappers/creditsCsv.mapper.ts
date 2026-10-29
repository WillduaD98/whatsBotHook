// Prepara las filas del CSV de Créditos antes de cargarlas (puro, sin BD): alinea cada fila con el encabezado
// para que un valor nunca caiga en la columna equivocada, y reporta las filas que no se pueden alinear.
import { isPlazoSemanas } from "../shared/clienteCredito.constants.js";
import type { UpsertCreditsError } from "../services/credit.service.js";
import type { CreditsCsvColumn, CreditsCsvPreparado, CreditsCsvRow, ResumenCargaCsv } from "../types/creditsCsv.types.js";

type AlineacionFila = { ok: true; cols: string[] } | { ok: false; motivo: string };

// Si la fila trae columnas de más, la única coma permitida sin comillas es la de `plazos` ("4,8,12"):
// se juntan en "4|8|12" solo si TODAS las celdas sobrantes son plazos válidos. Si no, se rechaza la fila completa.
// Las celdas vacías de más tampoco se recortan: un nombre con coma y columnas del piloto vacías se vería igual.
export function alinearFila(columnKeys: Array<CreditsCsvColumn | null>, cols: string[]): AlineacionFila {
  const extra = cols.length - columnKeys.length;
  if (extra <= 0) return { ok: true, cols };

  const plazosIdx = columnKeys.indexOf("plazos");
  const partes = plazosIdx >= 0 ? cols.slice(plazosIdx, plazosIdx + extra + 1) : [];
  const sonPlazos = partes.length === extra + 1 && partes.every((parte) => isPlazoSemanas(Number(parte.trim())));
  if (!sonPlazos) {
    return { ok: false, motivo: `La fila tiene ${extra} columna(s) de más: revisa que ningún campo (ej. nombre) lleve comas` };
  }

  const plazos = partes.map((parte) => parte.trim()).join("|");
  return { ok: true, cols: [...cols.slice(0, plazosIdx), plazos, ...cols.slice(plazosIdx + extra + 1)] };
}

// Una fila de celdas → objeto por columna conocida; las columnas desconocidas se ignoran.
function toCsvRow(columnKeys: Array<CreditsCsvColumn | null>, cols: string[]): CreditsCsvRow {
  const row: CreditsCsvRow = {};
  columnKeys.forEach((key, idx) => {
    if (key) row[key] = cols[idx] ?? "";
  });
  return row;
}

// Alinea todas las filas de datos; `fila` (en errores y en filaOriginal) es el índice de la fila de datos del CSV.
export function prepararFilasCsv(columnKeys: Array<CreditsCsvColumn | null>, dataRows: string[][]): CreditsCsvPreparado {
  const preparado: CreditsCsvPreparado = { rows: [], filaOriginal: [], errores: [] };
  dataRows.forEach((cols, fila) => {
    const alineada = alinearFila(columnKeys, cols);
    if (!alineada.ok) {
      preparado.errores.push({ fila, motivo: alineada.motivo });
      return;
    }
    preparado.rows.push(toCsvRow(columnKeys, alineada.cols));
    preparado.filaOriginal.push(fila);
  });
  return preparado;
}

// Las cargas numeran sus errores por posición en las filas que recibieron; aquí se regresan a la fila real del CSV
// y se suman las filas rechazadas por formato (que no llegaron a ninguna carga).
export function ajustarResumenCsv<T extends ResumenCargaCsv>(
  resumen: T,
  filaOriginal: number[],
  erroresDeFormato: UpsertCreditsError[] = []
): T {
  const errores = resumen.errores.map((error) => ({ ...error, fila: filaOriginal[error.fila] ?? error.fila }));
  return {
    ...resumen,
    recibidos: resumen.recibidos + erroresDeFormato.length,
    omitidos: resumen.omitidos + erroresDeFormato.length,
    errores: [...erroresDeFormato, ...errores].sort((a, b) => a.fila - b.fila)
  };
}
