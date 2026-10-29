// Tests de la cuota semanal estimada (método flat al 2.5% semanal).
// Los esperados salen de la tabla real del negocio: $5,000 → 4 sem = $5,500 · 8 = $6,000 · 12 = $6,500 · 16 = $7,000 en total.
import { describe, it, expect } from 'vitest';
import { calcularCuota } from '../mappers/cuota.mapper';
import { round2 } from '../utils/money';
import type { PlazoSemanas } from '../shared/clienteCredito.constants';

describe('calcularCuota', () => {
  const tablaDelNegocio: Array<[PlazoSemanas, number]> = [
    [4, 5500],
    [8, 6000],
    [12, 6500],
    [16, 7000]
  ];

  it.each(tablaDelNegocio)('$5,000 a %i semanas: cuota = total de la tabla ($%i) / semanas', (plazoSemanas, totalTabla) => {
    expect(calcularCuota({ monto: 5000, plazoSemanas, tasaSemanal: 0.025 })).toBe(round2(totalTabla / plazoSemanas));
  });

  it('ejemplo del spec: $8,000 a 8 semanas → $1,200/semana', () => {
    expect(calcularCuota({ monto: 8000, plazoSemanas: 8, tasaSemanal: 0.025 })).toBe(1200);
  });

  it('cuota que no cierra en centavos se redondea: $5,000 a 12 semanas → 6,500 / 12 = 541.67', () => {
    expect(calcularCuota({ monto: 5000, plazoSemanas: 12, tasaSemanal: 0.025 })).toBe(541.67);
  });

  it('sin tasa, la cuota es solo el monto entre las semanas', () => {
    expect(calcularCuota({ monto: 6000, plazoSemanas: 4, tasaSemanal: 0 })).toBe(1500);
  });
});

