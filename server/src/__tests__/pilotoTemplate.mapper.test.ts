// Tests del armado de las plantillas del piloto: el orden de bodyParams debe ser el de las variables dadas de alta en Meta
// (PILOTO_DROGA_DEL_PAGO.md §2). Si Meta recibe otro orden o número de parámetros, el cliente ve datos cruzados o falla el envío.
import { describe, it, expect } from 'vitest';
import { armarPlantillaPiloto, parsePilotoTemplateName } from '../mappers/pilotoTemplate.mapper';
import { PilotoError } from '../errors/PilotoErrores';
import type { PilotoClienteDatos } from '../types/piloto.types';

const maria: PilotoClienteDatos = { nombre: 'María López', racha: 7, nivel: 2, limite: 10000 };

describe('parsePilotoTemplateName', () => {
  it.each([['streak_alert'], ['due_date_action'], ['prox_credito_gancho']])('acepta %s', (name) => {
    expect(parsePilotoTemplateName(name)).toBe(name);
  });

  it('rechaza una plantilla que no es del piloto', () => {
    expect(() => parsePilotoTemplateName('recordatorio_de_pago1')).toThrow(PilotoError);
  });
});

describe('armarPlantillaPiloto · streak_alert (día −1)', () => {
  it('body: {{1}} nombre · {{2}} monto con $ · {{3}} fecha · {{4}} racha (4 parámetros, la racha una sola vez)', () => {
    const { bodyParams } = armarPlantillaPiloto(maria, { plantilla: 'streak_alert', monto: '750', fecha: 'mañana, vie 30 oct' });
    expect(bodyParams).toEqual(['María López', '$750', 'mañana, vie 30 oct', '7']);
  });

  it('la vista previa trae los mismos valores que recibe el cliente', () => {
    const { preview } = armarPlantillaPiloto(maria, { plantilla: 'streak_alert', monto: '750', fecha: 'vie 30 oct' });
    expect(preview).toContain('Hola María López, mañana toca tu pago de *$750* (vence *vie 30 oct*).');
    expect(preview).toContain('🔥 Tu racha: 7');
    expect(preview).toContain('*7 pagos en tiempo y forma*');
  });
});

describe('armarPlantillaPiloto · due_date_action (día 0)', () => {
  it('body: {{1}} nombre · {{2}} monto con $ · {{3}} fecha · {{4}} racha', () => {
    const { bodyParams } = armarPlantillaPiloto(maria, { plantilla: 'due_date_action', monto: '$1,500', fecha: 'hoy, jue 29 oct' });
    expect(bodyParams).toEqual(['María López', '$1,500', 'hoy, jue 29 oct', '7']);
  });

  it.each([[undefined], [''], ['abc'], ['0']])('monto %s → MONTO_INVALIDO', (monto) => {
    expect(() => armarPlantillaPiloto(maria, { plantilla: 'due_date_action', fecha: 'hoy', ...(monto !== undefined && { monto }) }))
      .toThrow(expect.objectContaining({ pilotoCode: 'MONTO_INVALIDO' }));
  });

  it('sin fecha → FALTA_FECHA', () => {
    expect(() => armarPlantillaPiloto(maria, { plantilla: 'due_date_action', monto: '750', fecha: '  ' }))
      .toThrow(expect.objectContaining({ pilotoCode: 'FALTA_FECHA' }));
  });
});

describe('armarPlantillaPiloto · prox_credito_gancho (renovación)', () => {
  it('body: {{1}} nombre · {{2}} racha · {{3}} nivel · {{4}} límite SIN $ (el $ ya está en el texto)', () => {
    const { bodyParams } = armarPlantillaPiloto(maria, { plantilla: 'prox_credito_gancho' });
    expect(bodyParams).toEqual(['María López', '7', '2', '10,000']);
  });

  it('cliente con límite 0 (renovación no autorizada) → no se le puede mandar el gancho', () => {
    expect(() => armarPlantillaPiloto({ ...maria, limite: 0 }, { plantilla: 'prox_credito_gancho' }))
      .toThrow(expect.objectContaining({ pilotoCode: 'RENOVACION_NO_AUTORIZADA', status: 409 }));
  });

  it('no pide monto ni fecha (salen de BD) y el límite sale con un solo $', () => {
    const { preview } = armarPlantillaPiloto(maria, { plantilla: 'prox_credito_gancho' });
    expect(preview).toContain('Tu nuevo límite disponible: *$10,000.*');
    expect(preview).not.toContain('$$');
  });
});
