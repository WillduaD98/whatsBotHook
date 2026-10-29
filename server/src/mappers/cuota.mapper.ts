// Cálculo puro de la cuota semanal estimada que el bot le muestra al cliente en la renovación (sin BD).
import type { CalculoCuotaInput } from "../types/renovacion.types.js";
import { round2 } from "../utils/money.js";

// Método flat/add-on: el interés se cobra sobre el monto original todas las semanas (no sobre saldo decreciente).
// Ej. $5,000 a 8 semanas al 2.5%: (5,000 + 5,000·0.025·8) / 8 = $750. Es estimada: un asesor confirma.
export function calcularCuota({ monto, plazoSemanas, tasaSemanal }: CalculoCuotaInput): number {
  const interes = monto * tasaSemanal * plazoSemanas;
  return round2((monto + interes) / plazoSemanas);
}
