// Tests del armado de las plantillas del piloto: el orden de bodyParams debe ser el de las variables dadas de alta en Meta
// (PILOTO_DROGA_DEL_PAGO.md §2). Si Meta recibe otro orden o número de parámetros, el cliente ve datos cruzados o falla el envío.
import { describe, it, expect } from 'vitest';
import { armarPlantillaPiloto, parsePilotoTemplateName } from '../mappers/pilotoTemplate.mapper';
import { PilotoError } from '../errors/PilotoErrores';
import type { PilotoClienteDatos } from '../types/piloto.types';

const maria: PilotoClienteDatos = { nombre: 'María López', racha: 7, nivel: 2, limite: 10000 };
// Nombre tal como viene en BD: "APELLIDO PATERNO APELLIDO MATERNO PRIMER NOMBRE SEGUNDO NOMBRE".
const clienteBd: PilotoClienteDatos = { ...maria, nombre: 'LOPEZ HERNANDEZ MARIA GUADALUPE' };

describe('parsePilotoTemplateName', () => {
  it.each([['faltan_dos_dias_pago_racha'], ['streak_alert'], ['due_date_action'], ['prox_credito_gancho']])('acepta %s', (name) => {
    expect(parsePilotoTemplateName(name)).toBe(name);
  });

  it('rechaza una plantilla que no es del piloto', () => {
    expect(() => parsePilotoTemplateName('recordatorio_de_pago1')).toThrow(PilotoError);
  });
});

describe('armarPlantillaPiloto · faltan_dos_dias_pago_racha (día −2)', () => {
  const beneficio = 'un límite más alto en tu próximo crédito';

  it('body: {{1}} primer nombre · {{2}} monto sin $ · {{3}} racha · {{4}} beneficio; sin variable en el encabezado', () => {
    const armada = armarPlantillaPiloto(clienteBd, { plantilla: 'faltan_dos_dias_pago_racha', monto: '$1,500', beneficio });
    expect(armada.bodyParams).toEqual(['MARIA', '1,500', '7', beneficio]);
    expect(armada.headerText).toBeUndefined();
  });

  it('no pide fecha (la plantilla no la lleva)', () => {
    expect(() => armarPlantillaPiloto(clienteBd, { plantilla: 'faltan_dos_dias_pago_racha', monto: '750', beneficio })).not.toThrow();
  });

  it('la vista previa es el texto de Meta con los valores del cliente', () => {
    const { preview } = armarPlantillaPiloto(clienteBd, { plantilla: 'faltan_dos_dias_pago_racha', monto: '750', beneficio });
    expect(preview).toContain('*¡No rompas tu racha!*');
    expect(preview).toContain('Hola _MARIA,_ en *2 días toca tu pago de: $750* 🗓️');
    expect(preview).toContain('🔥 Llevas *7 pagos* seguidos a tiempo.');
    expect(preview).toContain(`puedes desbloquear: *${beneficio}* 🎁`);
    expect(preview).toContain('_Beneficios sujetos a aprobación._');
  });

  it.each([[undefined], [''], ['   ']])('beneficio %s → FALTA_BENEFICIO', (valor) => {
    expect(() =>
      armarPlantillaPiloto(clienteBd, { plantilla: 'faltan_dos_dias_pago_racha', monto: '750', ...(valor !== undefined && { beneficio: valor }) })
    ).toThrow(expect.objectContaining({ pilotoCode: 'FALTA_BENEFICIO' }));
  });

  it('Meta no acepta saltos de línea en una variable → BENEFICIO_INVALIDO', () => {
    expect(() => armarPlantillaPiloto(clienteBd, { plantilla: 'faltan_dos_dias_pago_racha', monto: '750', beneficio: 'más plazos\ny mejor límite' }))
      .toThrow(expect.objectContaining({ pilotoCode: 'BENEFICIO_INVALIDO' }));
  });

  it('más de 60 caracteres → BENEFICIO_INVALIDO; justo 60 sí pasa', () => {
    const base = { plantilla: 'faltan_dos_dias_pago_racha' as const, monto: '750' };
    expect(() => armarPlantillaPiloto(clienteBd, { ...base, beneficio: 'a'.repeat(61) }))
      .toThrow(expect.objectContaining({ pilotoCode: 'BENEFICIO_INVALIDO' }));
    expect(armarPlantillaPiloto(clienteBd, { ...base, beneficio: 'a'.repeat(60) }).bodyParams[3]).toBe('a'.repeat(60));
  });

  it('los espacios de más se compactan (Meta rechaza más de 4 seguidos)', () => {
    const { bodyParams } = armarPlantillaPiloto(clienteBd, { plantilla: 'faltan_dos_dias_pago_racha', monto: '750', beneficio: '  más     plazos  ' });
    expect(bodyParams[3]).toBe('más plazos');
  });

  it('monto inválido → MONTO_INVALIDO', () => {
    expect(() => armarPlantillaPiloto(clienteBd, { plantilla: 'faltan_dos_dias_pago_racha', monto: 'abc', beneficio }))
      .toThrow(expect.objectContaining({ pilotoCode: 'MONTO_INVALIDO' }));
  });
});

describe('armarPlantillaPiloto · streak_alert (día −1)', () => {
  it('body: {{1}} nombre · {{2}} monto sin $ (la plantilla ya lo trae) · {{3}} fecha · {{4}} y {{5}} la misma racha', () => {
    const { bodyParams } = armarPlantillaPiloto(maria, { plantilla: 'streak_alert', monto: '$1,500', fecha: 'mañana, vie 30 oct' });
    expect(bodyParams).toEqual(['María López', '1,500', 'mañana, vie 30 oct', '7', '7']);
  });

  it('el encabezado lleva solo el primer nombre (3ª palabra: PATERNO MATERNO NOMBRE), no el apellido', () => {
    const { headerText } = armarPlantillaPiloto(clienteBd, { plantilla: 'streak_alert', monto: '750', fecha: 'vie 30 oct' });
    expect(headerText).toBe('MARIA');
  });

  it('con un solo apellido ("PATERNO NOMBRE") toma el nombre', () => {
    const { headerText } = armarPlantillaPiloto({ ...maria, nombre: 'LOPEZ MARIA' }, { plantilla: 'streak_alert', monto: '750', fecha: 'hoy' });
    expect(headerText).toBe('MARIA');
  });

  it('con un nombre completo largo el encabezado cabe en 60 caracteres y el body lleva el nombre completo', () => {
    const largo = { ...maria, nombre: 'HERNANDEZ GUTIERREZ MARIA GUADALUPE' };
    const { headerText, bodyParams } = armarPlantillaPiloto(largo, { plantilla: 'streak_alert', monto: '750', fecha: 'vie 30 oct' });
    expect(headerText).toBe('MARIA');
    expect(`Mañana toca tu pago, no rompas tu racha ${headerText}!`.length).toBeLessThanOrEqual(60);
    expect(bodyParams[0]).toBe('HERNANDEZ GUTIERREZ MARIA GUADALUPE');
  });

  it('due_date_action no lleva variable en el encabezado', () => {
    const { headerText } = armarPlantillaPiloto(maria, { plantilla: 'due_date_action', monto: '750', fecha: 'hoy' });
    expect(headerText).toBeUndefined();
  });

  it('la vista previa trae los mismos valores que recibe el cliente', () => {
    const { preview } = armarPlantillaPiloto(clienteBd, { plantilla: 'streak_alert', monto: '750', fecha: 'vie 30 oct' });
    expect(preview).toContain('*Mañana toca tu pago, no rompas tu racha MARIA!*');
    expect(preview).toContain('Hola LOPEZ HERNANDEZ MARIA GUADALUPE, mañana toca tu pago de $*750* (vence *vie 30 oct*).');
    expect(preview).toContain('*🔥 Tu racha: 7*, sigue así!');
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
