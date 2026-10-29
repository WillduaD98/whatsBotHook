// Helpers genéricos para montos de dinero: redondeo, lectura de texto capturado y formato es-MX.

// Redondea a centavos; el EPSILON evita que 1.005 quede en 1.00 por el error de punto flotante.
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// Lee un monto capturado a mano: acepta "10000", "10,000", "$10,000" o "750.50"; null si no es un número.
export function parseMonto(raw: string | undefined): number | null {
  const cleaned = (raw ?? "").replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

const ENTERO_ES_MX = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });
const CENTAVOS_ES_MX = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Separador de miles sin "$" (10000 → "10,000"); para plantillas que ya traen el "$" en el texto.
// Enteros sin decimales; con centavos siempre dos dígitos (437.5 → "437.50", nunca "437.5").
export function formatMiles(value: number): string {
  const redondeado = round2(value);
  return Number.isInteger(redondeado) ? ENTERO_ES_MX.format(redondeado) : CENTAVOS_ES_MX.format(redondeado);
}

// Monto con "$" (750 → "$750", 541.67 → "$541.67", 437.5 → "$437.50").
export function formatPesos(value: number): string {
  return `$${formatMiles(value)}`;
}
