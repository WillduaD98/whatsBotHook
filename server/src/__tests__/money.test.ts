// Tests de los helpers de dinero (redondeo, lectura de montos capturados y formato es-MX).
import { describe, it, expect } from 'vitest';
import { formatMiles, formatPesos, parseMonto, round2 } from '../utils/money';

describe('round2', () => {
  it('redondea a centavos sin error de punto flotante (1.005 → 1.01)', () => {
    expect(round2(1.005)).toBe(1.01);
  });
});

describe('parseMonto', () => {
  it.each([
    ['10000', 10000],
    ['10,000', 10000],
    ['$10,000', 10000],
    [' 750.50 ', 750.5]
  ])('"%s" → %d', (raw, esperado) => {
    expect(parseMonto(raw)).toBe(esperado);
  });

  it.each([[undefined], [''], ['diez mil'], ['-500']])('%s → null', (raw) => {
    expect(parseMonto(raw)).toBeNull();
  });
});

describe('formatMiles / formatPesos', () => {
  it('separa miles con coma y no agrega decimales a un entero', () => {
    expect(formatMiles(10000)).toBe('10,000');
    expect(formatPesos(750)).toBe('$750');
  });

  it('conserva centavos cuando los hay', () => {
    expect(formatPesos(541.67)).toBe('$541.67');
  });

  it('con centavos siempre muestra dos dígitos (437.5 → $437.50)', () => {
    expect(formatPesos(437.5)).toBe('$437.50');
  });
});
