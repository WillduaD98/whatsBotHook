// Tests de las reglas duras de la renovación (PILOTO_DROGA_DEL_PAGO.md §3): el monto nunca supera el límite,
// el plazo siempre es uno autorizado del cliente, y antes de agendar se revalida todo contra el perfil en BD.
import { describe, it, expect } from 'vitest';
import {
  construirSolicitud,
  plazoDesdeOpcion,
  plazosDelCliente,
  readRenovacionSlots,
  renovacionAutorizada,
  validarMonto
} from '../mappers/renovacion.mapper';
import type { RenovacionCliente } from '../types/renovacion.types';

// Perfil del ejemplo del spec: límite $10,000, plazos 4/8/12/16, tasa flat 2.5% semanal.
const maria: RenovacionCliente = {
  numeroCredito: '10483',
  limite: 10000,
  plazos: [4, 8, 12, 16],
  tasaSemanal: 0.025,
  racha: 7,
  nivel: 2
};

describe('renovacionAutorizada (§8.2: límite 0 = NO RENOVACIÓN)', () => {
  it('límite mayor a 0 con plazos → hay renovación', () => {
    expect(renovacionAutorizada(maria)).toBe(true);
  });

  it('límite 0 → no hay renovación, aunque tenga plazos', () => {
    expect(renovacionAutorizada({ ...maria, limite: 0 })).toBe(false);
  });

  it('sin ningún plazo autorizado no hay nada que ofrecer', () => {
    expect(renovacionAutorizada({ ...maria, plazos: [] })).toBe(false);
  });
});

describe('validarMonto', () => {
  it.each([['8000', 8000], ['8,000', 8000], ['$8,000', 8000], ['10000', 10000]])('"%s" dentro del límite → %d', (raw, monto) => {
    expect(validarMonto(raw, maria.limite)).toEqual({ ok: true, monto });
  });

  it('un peso arriba del límite se rechaza', () => {
    expect(validarMonto('10001', maria.limite)).toEqual({ ok: false, motivo: 'EXCEDE_LIMITE' });
  });

  it.each([['hola'], [''], ['0'], ['-500']])('"%s" no es un monto válido', (raw) => {
    expect(validarMonto(raw, maria.limite)).toEqual({ ok: false, motivo: 'NO_ES_NUMERO' });
  });
});

describe('plazosDelCliente / plazoDesdeOpcion', () => {
  const beto: RenovacionCliente = { ...maria, limite: 6000, plazos: [12, 4, 8, 4] };

  it('la lista solo muestra los plazos del cliente, sin repetidos y en orden', () => {
    expect(plazosDelCliente(beto)).toEqual([4, 8, 12]);
  });

  it('toca un plazo suyo → ese plazo', () => {
    expect(plazoDesdeOpcion('RENOV_PLAZO_8', beto)).toBe(8);
  });

  it('un plazo permitido en general pero que NO es del cliente se rechaza (16 para quien solo tiene 4/8/12)', () => {
    expect(plazoDesdeOpcion('RENOV_PLAZO_16', beto)).toBeNull();
  });

  it('un id que no es de la lista de plazos se rechaza', () => {
    expect(plazoDesdeOpcion('RENOV_CALCULAR', beto)).toBeNull();
    expect(plazoDesdeOpcion(undefined, beto)).toBeNull();
  });
});

describe('construirSolicitud (guardrail antes de agendar)', () => {
  it('monto y plazo válidos → solicitud con la cuota recalculada (8,000 a 8 semanas = 1,200/semana)', () => {
    expect(construirSolicitud({ monto: 8000, plazoSemanas: 8 }, maria)).toEqual({
      monto: 8000,
      plazoSemanas: 8,
      cuotaSemanal: 1200
    });
  });

  it('si el límite bajó desde que el cliente escribió el monto, no se agenda', () => {
    expect(construirSolicitud({ monto: 8000, plazoSemanas: 8 }, { ...maria, limite: 5000 })).toBeNull();
  });

  it('si el plazo ya no está autorizado para el cliente, no se agenda', () => {
    expect(construirSolicitud({ monto: 8000, plazoSemanas: 16 }, { ...maria, plazos: [4, 8] })).toBeNull();
  });

  it('sin monto o sin plazo guardado, no se agenda', () => {
    expect(construirSolicitud({ monto: 8000 }, maria)).toBeNull();
    expect(construirSolicitud({ plazoSemanas: 8 }, maria)).toBeNull();
  });
});

describe('readRenovacionSlots', () => {
  it('toma monto y plazo válidos de conv.slots.renovacion', () => {
    expect(readRenovacionSlots({ renovacion: { monto: 8000, plazoSemanas: 8 } })).toEqual({ monto: 8000, plazoSemanas: 8 });
  });

  it('ignora un plazo que no es de los permitidos y valores de otro tipo', () => {
    expect(readRenovacionSlots({ renovacion: { monto: '8000', plazoSemanas: 6 } })).toEqual({});
  });

  it('sin slots o sin renovacion → vacío', () => {
    expect(readRenovacionSlots(undefined)).toEqual({});
    expect(readRenovacionSlots({ cliente: { numeroCredito: '1' } })).toEqual({});
  });
});
