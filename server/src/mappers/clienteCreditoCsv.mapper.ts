// Convierte las columnas del piloto del CSV de créditos en perfiles ClienteCredito validados (puro, sin BD).
import { isNivelConfianza, isPlazoSemanas } from "../shared/clienteCredito.constants.js";
import type { NivelConfianza, PlazoSemanas } from "../shared/clienteCredito.constants.js";
import type {
  ClienteCreditoCsvParse,
  ClienteCreditoCsvRow,
  ClienteCreditoInput,
  ClientesCreditoCsvClasificacion
} from "../types/clienteCredito.types.js";
import { normalizeCreditNumber } from "../services/credit.service.js";
import { normalizeTo } from "../services/waid.service.js";
import { parseMonto } from "../utils/money.js";

const PILOTO_COLUMNS = ["waId", "limite", "plazos", "nivel", "racha", "renovaciones"] as const;

// Una fila es del piloto si trae al menos una columna del piloto; si no, solo se carga su Credit.
export function tieneDatosDePiloto(row: ClienteCreditoCsvRow): boolean {
  return PILOTO_COLUMNS.some((column) => (row[column] ?? "").trim() !== "");
}

// waId en la forma que guarda Conversation (52 + 10 dígitos); acepta "521…", espacios o guiones.
function parseWaId(raw: string | undefined): string | null {
  const normalized = normalizeTo((raw ?? "").replace(/\D/g, ""));
  return /^52\d{10}$/.test(normalized) ? normalized : null;
}

// "4|8|12" (también separados por ; , o espacio) → [4, 8, 12] sin repetidos; null si alguno no es un plazo permitido.
function parsePlazos(raw: string | undefined): PlazoSemanas[] | null {
  const parts = (raw ?? "").split(/[|;,\s]+/).filter((part) => part !== "");
  const plazos = parts.map(Number);
  if (plazos.length === 0 || !plazos.every(isPlazoSemanas)) return null;
  return [...new Set(plazos)].sort((a, b) => a - b);
}

// Con limite 0 (renovación no autorizada) los plazos pueden ir vacíos; con limite > 0 son obligatorios.
function parsePlazosSegunLimite(raw: string | undefined, limite: number): PlazoSemanas[] | null {
  if (limite === 0 && (raw ?? "").trim() === "") return [];
  return parsePlazos(raw);
}

// Entero ≥ 0; vacío → undefined (no se toca), texto no entero → null (inválido).
function parseEnteroOpcional(raw: string | undefined): number | undefined | null {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return undefined;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

// Agrega nivel/racha/renovaciones solo si vinieron, para no pisar lo que ya hay en BD con defaults.
function withOpcionales(
  base: ClienteCreditoInput,
  opcionales: { nivel: NivelConfianza | undefined; racha: number | undefined; renovaciones: number | undefined }
): ClienteCreditoInput {
  return {
    ...base,
    ...(opcionales.nivel !== undefined && { nivel: opcionales.nivel }),
    ...(opcionales.racha !== undefined && { racha: opcionales.racha }),
    ...(opcionales.renovaciones !== undefined && { renovaciones: opcionales.renovaciones })
  };
}

// Valida una fila del piloto; el motivo es el texto que ve quien sube el CSV en el panel.
export function parseClienteCreditoCsvRow(row: ClienteCreditoCsvRow): ClienteCreditoCsvParse {
  const numeroCredito = normalizeCreditNumber(row.numeroCredito);
  if (!numeroCredito) return { ok: false, motivo: "numeroCredito vacío o inválido" };

  const waId = parseWaId(row.waId);
  if (!waId) return { ok: false, motivo: "waId inválido (usa 52 + 10 dígitos)" };

  // limite 0 es válido: significa renovación NO autorizada (el bot responde con el flujo de NO RENOVACIÓN).
  const limite = parseMonto(row.limite);
  if (limite === null) return { ok: false, motivo: "limite debe ser un número mayor o igual a 0 (0 = sin renovación)" };

  const plazos = parsePlazosSegunLimite(row.plazos, limite);
  if (!plazos) return { ok: false, motivo: "plazos inválidos (usa 4|8|12|16)" };

  const nivel = parseEnteroOpcional(row.nivel);
  if (nivel === null || (nivel !== undefined && !isNivelConfianza(nivel))) {
    return { ok: false, motivo: "nivel debe ser 1, 2, 3 o 4" };
  }

  const racha = parseEnteroOpcional(row.racha);
  if (racha === null) return { ok: false, motivo: "racha debe ser un entero mayor o igual a 0" };

  const renovaciones = parseEnteroOpcional(row.renovaciones);
  if (renovaciones === null) return { ok: false, motivo: "renovaciones debe ser un entero mayor o igual a 0" };

  return { ok: true, input: withOpcionales({ waId, numeroCredito, limite, plazos }, { nivel, racha, renovaciones }) };
}

// Separa las filas del piloto en perfiles válidos y errores; `fila` es el índice de la fila de datos (igual que en Credit).
export function clasificarFilasPiloto(rows: ClienteCreditoCsvRow[]): ClientesCreditoCsvClasificacion {
  const clasificacion: ClientesCreditoCsvClasificacion = { recibidos: 0, inputs: [], errores: [] };

  rows.forEach((row, fila) => {
    if (!tieneDatosDePiloto(row)) return;
    clasificacion.recibidos++;
    const parsed = parseClienteCreditoCsvRow(row);
    if (parsed.ok) clasificacion.inputs.push(parsed.input);
    else clasificacion.errores.push({ fila, motivo: parsed.motivo });
  });

  return clasificacion;
}
