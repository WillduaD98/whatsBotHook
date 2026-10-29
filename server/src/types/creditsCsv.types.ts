// Formas del CSV de Créditos (catálogo de Credit + columnas opcionales del piloto ClienteCredito).
import type { CreditRow, UpsertCreditsError } from "../services/credit.service.js";
import type { ClienteCreditoCsvRow } from "./clienteCredito.types.js";

// Cada columna conocida del CSV: las del Credit (obligatorias) y las del piloto (opcionales).
export type CreditsCsvColumn = keyof CreditRow | keyof ClienteCreditoCsvRow;

// Una fila ya separada por columna conocida (todo texto, sin validar).
export type CreditsCsvRow = Partial<Record<CreditsCsvColumn, string>>;

// Filas listas para cargar + la fila original del CSV de cada una + las filas rechazadas por formato.
export type CreditsCsvPreparado = {
  rows: CreditsCsvRow[];
  filaOriginal: number[];
  errores: UpsertCreditsError[];
};

// Lo común de los resúmenes de carga (Credit y piloto) que se ajusta al reportar filas al panel.
export type ResumenCargaCsv = {
  recibidos: number;
  omitidos: number;
  errores: UpsertCreditsError[];
};
