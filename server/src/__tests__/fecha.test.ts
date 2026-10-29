// Tests de la fecha de la cita ("mañana") en hora de México, aunque el server corra en UTC.
import { describe, it, expect } from 'vitest';
import { fechaMananaMx } from '../utils/fecha';

describe('fechaMananaMx', () => {
  it('jue 29 oct a mediodía en México → vie 30 oct', () => {
    expect(fechaMananaMx(new Date('2026-10-29T12:00:00-06:00'))).toBe('2026-10-30');
  });

  it('jue 29 oct 23:30 en México (ya es 30 en UTC) sigue siendo "mañana" = 30, no 31', () => {
    expect(fechaMananaMx(new Date('2026-10-29T23:30:00-06:00'))).toBe('2026-10-30');
  });

  it('cambio de mes: 31 oct → 1 nov', () => {
    expect(fechaMananaMx(new Date('2026-10-31T10:00:00-06:00'))).toBe('2026-11-01');
  });
});
