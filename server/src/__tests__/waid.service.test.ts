// Tests de caracterización: fijan el comportamiento ACTUAL de waid.service.ts.
import { describe, it, expect } from 'vitest';
import { normalizeTo } from '../services/waid.service';

describe('normalizeTo', () => {
  it('normalizeTo: caso MX con prefijo 521 (13 dígitos) -> "5214771234567" pasa a "524771234567"', () => {
    // Arrange
    const input = '5214771234567';
    // Act
    const result = normalizeTo(input);
    // Assert
    expect(result).toBe('524771234567');
  });

  it('normalizeTo: otro número con prefijo 521 (13 dígitos) -> "5215551234567" pasa a "525551234567"', () => {
    const input = '5215551234567';
    const result = normalizeTo(input);
    expect(result).toBe('525551234567');
  });

  it('normalizeTo: número ya normalizado (sin el "1" extra) regresa igual', () => {
    const input = '524771234567';
    const result = normalizeTo(input);
    expect(result).toBe('524771234567');
  });

  const casosSinCambio: Array<[string, string]> = [
    ['52147712345', '52147712345'], // empieza con 521 pero tiene 11 dígitos (no 13) -> no cumple el patrón
    ['521477123456789', '521477123456789'], // empieza con 521 pero tiene 15 dígitos (no 13) -> no cumple el patrón
    ['4771234567', '4771234567'], // no empieza con 521 -> no cumple el patrón
    ['', '']
  ];

  it.each(casosSinCambio)(
    'normalizeTo(%s) regresa igual cuando no cumple el patrón "521" + 13 dígitos: %s',
    (input, expected) => {
      expect(normalizeTo(input)).toBe(expected);
    }
  );
});
