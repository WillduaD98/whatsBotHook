// Tests de lo que el panel recibe de las citas de renovación: forma de salida (id string, fecha ISO) y nombre del cliente.
import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { parseCitaStatusFilter, toRenovacionCitaDtos } from '../mappers/renovacionCita.mapper';
import { PilotoError } from '../errors/PilotoErrores';
import type { RenovacionCitaLean } from '../types/renovacion.types';

const id = new Types.ObjectId('6720f0a1b2c3d4e5f6a7b8c9');
const creada = new Date('2026-10-29T18:00:00.000Z');

// Cita como la guarda el bot al tocar "Sí, agéndala": $8,000 a 8 semanas, cuota 1,200, visita mañana.
const cita: RenovacionCitaLean = {
  _id: id,
  waId: '525512345678',
  numeroCredito: '10483',
  monto: 8000,
  plazoSemanas: 8,
  tasaSemanal: 0.025,
  cuotaSemanal: 1200,
  fechaCita: '2026-10-30',
  status: 'pendiente_confirmacion',
  createdAt: creada,
  updatedAt: creada
};

describe('toRenovacionCitaDtos', () => {
  it('id como string, createdAt en ISO y el nombre tomado de su crédito', () => {
    expect(toRenovacionCitaDtos([cita], [{ numeroCredito: '10483', nombre: 'María López' }])).toEqual([
      {
        id: '6720f0a1b2c3d4e5f6a7b8c9',
        waId: '525512345678',
        numeroCredito: '10483',
        nombre: 'María López',
        monto: 8000,
        plazoSemanas: 8,
        tasaSemanal: 0.025,
        cuotaSemanal: 1200,
        fechaCita: '2026-10-30',
        status: 'pendiente_confirmacion',
        createdAt: '2026-10-29T18:00:00.000Z'
      }
    ]);
  });

  it('si su numeroCredito ya no está en Créditos, nombre es null', () => {
    expect(toRenovacionCitaDtos([cita], [])[0]?.nombre).toBeNull();
  });

  it('una solicitud de "Otro día" no tiene fecha', () => {
    const otroDia: RenovacionCitaLean = { ...cita, status: 'pendiente_fecha', fechaCita: null };
    expect(toRenovacionCitaDtos([otroDia], [])[0]?.fechaCita).toBeNull();
  });
});

describe('parseCitaStatusFilter', () => {
  it('vacío = todas', () => {
    expect(parseCitaStatusFilter('')).toBeUndefined();
  });

  it.each([['pendiente_confirmacion'], ['pendiente_fecha']])('acepta %s', (status) => {
    expect(parseCitaStatusFilter(status)).toBe(status);
  });

  it('un estado que no existe es error del que llama', () => {
    expect(() => parseCitaStatusFilter('confirmada')).toThrow(PilotoError);
  });
});
