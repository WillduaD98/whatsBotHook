// Tests de la alineación de filas del CSV de Créditos (PILOTO_DROGA_DEL_PAGO.md §8.1): "4,8,12" sin comillas
// debe llegar completo a `plazos`, y ninguna coma de más puede recorrer valores a otra columna en silencio.
import { describe, it, expect } from 'vitest';
import { ajustarResumenCsv, alinearFila, prepararFilasCsv } from '../mappers/creditsCsv.mapper';
import type { CreditsCsvColumn } from '../types/creditsCsv.types';

const header: CreditsCsvColumn[] = [
  'numeroCredito', 'nombre', 'clabe', 'referencia', 'waId', 'limite', 'plazos', 'nivel', 'racha', 'renovaciones'
];

describe('alinearFila', () => {
  it('fila con el mismo número de columnas queda igual', () => {
    const cols = ['10483', 'María López', '0121', 'REF1', '525512345678', '10000', '4|8|12', '2', '7', '1'];
    expect(alinearFila(header, cols)).toEqual({ ok: true, cols });
  });

  it('"4,8,12" sin comillas se junta en plazos y nivel/racha/renovaciones quedan en su lugar', () => {
    const cols = ['10483', 'María López', '0121', 'REF1', '525512345678', '10000', '4', '8', '12', '2', '7', '1'];
    expect(alinearFila(header, cols)).toEqual({
      ok: true,
      cols: ['10483', 'María López', '0121', 'REF1', '525512345678', '10000', '4|8|12', '2', '7', '1']
    });
  });

  it('nombre con coma sin comillas (columnas de más que no son plazos) → fila rechazada', () => {
    const cols = ['10483', 'López', ' María', '0121', 'REF1', '525512345678', '10000', '4|8', '2', '7', '1'];
    expect(alinearFila(header, cols)).toEqual({
      ok: false,
      motivo: 'La fila tiene 1 columna(s) de más: revisa que ningún campo (ej. nombre) lleve comas'
    });
  });

  it('nombre con coma y columnas del piloto vacías también se rechaza (no se recortan celdas vacías de más)', () => {
    const cols = ['10517', 'Ruiz', ' Alberto', '0121', 'REF2', '', '', '', '', '', ''];
    expect(alinearFila(header, cols).ok).toBe(false);
  });

  it('sin columna plazos en el encabezado, cualquier columna de más se rechaza', () => {
    const soloCredit: CreditsCsvColumn[] = ['numeroCredito', 'nombre', 'clabe', 'referencia'];
    expect(alinearFila(soloCredit, ['1', 'A', 'B', 'C', 'D']).ok).toBe(false);
  });
});

describe('prepararFilasCsv', () => {
  it('separa filas válidas de rechazadas y recuerda la fila original de cada una', () => {
    const result = prepararFilasCsv(header, [
      ['1', 'Ana', 'C1', 'R1', '525500000001', '5000', '4', '8', '', '', ''],
      ['2', 'Ruiz', ' Alberto', 'C2', 'R2', '', '', '', '', '', ''],
      ['3', 'Luis', 'C3', 'R3', '', '', '', '', '', '']
    ]);

    expect(result.rows.map((row) => row.numeroCredito)).toEqual(['1', '3']);
    expect(result.rows[0]?.plazos).toBe('4|8');
    expect(result.filaOriginal).toEqual([0, 2]);
    expect(result.errores).toEqual([
      { fila: 1, motivo: 'La fila tiene 1 columna(s) de más: revisa que ningún campo (ej. nombre) lleve comas' }
    ]);
  });
});

describe('ajustarResumenCsv', () => {
  it('regresa los errores a la fila real del CSV y suma las rechazadas por formato', () => {
    const resumen = { recibidos: 2, insertados: 1, actualizados: 0, omitidos: 1, errores: [{ fila: 1, motivo: 'clabe requerida' }] };
    const ajustado = ajustarResumenCsv(resumen, [0, 2], [{ fila: 1, motivo: 'columnas de más' }]);

    expect(ajustado).toEqual({
      recibidos: 3,
      insertados: 1,
      actualizados: 0,
      omitidos: 2,
      errores: [
        { fila: 1, motivo: 'columnas de más' },
        { fila: 2, motivo: 'clabe requerida' }
      ]
    });
  });
});
