// Tests del mapper que valida las columnas del piloto (ClienteCredito) en el CSV de créditos.
import { describe, it, expect } from 'vitest';
import {
  clasificarFilasPiloto,
  parseClienteCreditoCsvRow,
  tieneDatosDePiloto
} from '../mappers/clienteCreditoCsv.mapper';
import type { ClienteCreditoCsvRow } from '../types/clienteCredito.types';

const filaValida: ClienteCreditoCsvRow = {
  numeroCredito: '10483',
  waId: '525512345678',
  limite: '10000',
  plazos: '4|8|12|16',
  nivel: '2',
  racha: '7',
  renovaciones: '1'
};

describe('tieneDatosDePiloto', () => {
  it('una fila con solo columnas de Credit no es del piloto', () => {
    expect(tieneDatosDePiloto({ numeroCredito: '10483' })).toBe(false);
  });

  it('columnas del piloto vacías o con espacios no cuentan', () => {
    expect(tieneDatosDePiloto({ numeroCredito: '10483', waId: '  ', limite: '' })).toBe(false);
  });

  it('basta una columna del piloto con valor', () => {
    expect(tieneDatosDePiloto({ numeroCredito: '10483', limite: '6000' })).toBe(true);
  });
});

describe('parseClienteCreditoCsvRow', () => {
  it('fila completa → perfil con los valores del CSV', () => {
    expect(parseClienteCreditoCsvRow(filaValida)).toEqual({
      ok: true,
      input: {
        waId: '525512345678',
        numeroCredito: '10483',
        limite: 10000,
        plazos: [4, 8, 12, 16],
        nivel: 2,
        racha: 7,
        renovaciones: 1
      }
    });
  });

  it('waId con el "1" de 521 se guarda como lo guarda Conversation (52 + 10 dígitos)', () => {
    const result = parseClienteCreditoCsvRow({ ...filaValida, waId: '5215512345678' });
    expect(result.ok && result.input.waId).toBe('525512345678');
  });

  it('waId sin lada de país (10 dígitos) se rechaza', () => {
    expect(parseClienteCreditoCsvRow({ ...filaValida, waId: '5512345678' })).toEqual({
      ok: false,
      motivo: 'waId inválido (usa 52 + 10 dígitos)'
    });
  });

  it('limite con $ y comas se lee como número', () => {
    const result = parseClienteCreditoCsvRow({ ...filaValida, limite: '$10,000' });
    expect(result.ok && result.input.limite).toBe(10000);
  });

  it.each([['-500'], ['diez mil'], ['']])('limite "%s" se rechaza', (limite) => {
    expect(parseClienteCreditoCsvRow({ ...filaValida, limite })).toEqual({
      ok: false,
      motivo: 'limite debe ser un número mayor o igual a 0 (0 = sin renovación)'
    });
  });

  it('limite 0 = renovación no autorizada: se acepta y los plazos pueden ir vacíos', () => {
    const result = parseClienteCreditoCsvRow({ ...filaValida, limite: '0', plazos: '' });
    expect(result.ok && result.input.limite).toBe(0);
    expect(result.ok && result.input.plazos).toEqual([]);
  });

  it('con limite mayor a 0, los plazos siguen siendo obligatorios', () => {
    expect(parseClienteCreditoCsvRow({ ...filaValida, limite: '6000', plazos: '' })).toEqual({
      ok: false,
      motivo: 'plazos inválidos (usa 4|8|12|16)'
    });
  });

  it('plazos desordenados y repetidos quedan únicos y en orden', () => {
    const result = parseClienteCreditoCsvRow({ ...filaValida, plazos: '12;4 8|4' });
    expect(result.ok && result.input.plazos).toEqual([4, 8, 12]);
  });

  it.each([['6'], ['4|10'], ['']])('plazos "%s" fuera de 4/8/12/16 se rechazan', (plazos) => {
    expect(parseClienteCreditoCsvRow({ ...filaValida, plazos })).toEqual({
      ok: false,
      motivo: 'plazos inválidos (usa 4|8|12|16)'
    });
  });

  it.each([['0'], ['5'], ['2.5']])('nivel "%s" fuera de 1-4 se rechaza', (nivel) => {
    expect(parseClienteCreditoCsvRow({ ...filaValida, nivel })).toEqual({
      ok: false,
      motivo: 'nivel debe ser 1, 2, 3 o 4'
    });
  });

  it('racha no entera se rechaza', () => {
    expect(parseClienteCreditoCsvRow({ ...filaValida, racha: 'siete' })).toEqual({
      ok: false,
      motivo: 'racha debe ser un entero mayor o igual a 0'
    });
  });

  it('nivel, racha y renovaciones vacíos no se incluyen (no pisan lo que ya hay en BD)', () => {
    const result = parseClienteCreditoCsvRow({ ...filaValida, nivel: '', racha: '', renovaciones: '' });
    expect(result).toEqual({
      ok: true,
      input: { waId: '525512345678', numeroCredito: '10483', limite: 10000, plazos: [4, 8, 12, 16] }
    });
  });

  it('sin numeroCredito no se puede ligar al Credit → se rechaza', () => {
    expect(parseClienteCreditoCsvRow({ ...filaValida, numeroCredito: '' })).toEqual({
      ok: false,
      motivo: 'numeroCredito vacío o inválido'
    });
  });
});

describe('clasificarFilasPiloto', () => {
  it('ignora filas sin datos del piloto y reporta errores con el índice de la fila', () => {
    const rows: ClienteCreditoCsvRow[] = [
      filaValida,
      { numeroCredito: '10517' },
      { ...filaValida, waId: '525599998888', plazos: '6' }
    ];

    expect(clasificarFilasPiloto(rows)).toEqual({
      recibidos: 2,
      inputs: [
        {
          waId: '525512345678',
          numeroCredito: '10483',
          limite: 10000,
          plazos: [4, 8, 12, 16],
          nivel: 2,
          racha: 7,
          renovaciones: 1
        }
      ],
      errores: [{ fila: 2, motivo: 'plazos inválidos (usa 4|8|12|16)' }]
    });
  });
});
