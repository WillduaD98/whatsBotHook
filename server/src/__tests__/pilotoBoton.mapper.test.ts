// Tests del reconocimiento de los botones de la plantilla due_date_action: el webhook recibe el TEXTO del botón
// tal como se dio de alta en Meta ("Ya pagué", "Pásame los datos de pago", "Necesito ayuda").
import { describe, it, expect } from 'vitest';
import { esComprobanteAutomatico, pilotoPagoBotonFromMessage, renovacionEntradaFromMessage } from '../mappers/pilotoBoton.mapper';
import { PILOTO_MANDAR_COMPROBANTE_BOTON } from '../shared/pilotoTemplates.constants';

describe('pilotoPagoBotonFromMessage', () => {
  it.each([
    ['Ya pagué', 'YA_PAGUE'],
    ['Pásame los datos de pago', 'DATOS_PAGO'],
    ['Necesito ayuda', 'AYUDA']
  ])('texto exacto de Meta "%s" → %s', (texto, esperado) => {
    expect(pilotoPagoBotonFromMessage('button', texto)).toBe(esperado);
  });

  it('no depende de acentos, emojis ni mayúsculas', () => {
    expect(pilotoPagoBotonFromMessage('button', 'YA PAGUE')).toBe('YA_PAGUE');
    expect(pilotoPagoBotonFromMessage('button', 'pasame los datos de pago')).toBe('DATOS_PAGO');
  });

  it('solo aplica a botones de plantilla: un botón interactivo del bot (type interactive) no se toma', () => {
    expect(pilotoPagoBotonFromMessage('interactive', 'Ya pagué')).toBeNull();
  });

  it('el cliente escribiendo "ya pagué" como texto no se toma como el botón', () => {
    expect(pilotoPagoBotonFromMessage('text', 'ya pagué')).toBeNull();
  });

  it('otro botón de plantilla (ej. el gancho de renovación) no es de pago', () => {
    expect(pilotoPagoBotonFromMessage('button', 'Calcular mi próximo crédito')).toBeNull();
  });

  it('sin texto → null', () => {
    expect(pilotoPagoBotonFromMessage('button', undefined)).toBeNull();
  });
});

describe('renovacionEntradaFromMessage', () => {
  it('botón del gancho con el texto de Meta (con acentos) → PLANTILLA', () => {
    expect(renovacionEntradaFromMessage('button', 'Calcular mi próximo crédito', 'Calcular mi próximo crédito')).toBe('PLANTILLA');
  });

  it('el cliente escribe solo "renovar" (sin importar mayúsculas/espacios) → TEXTO', () => {
    expect(renovacionEntradaFromMessage('text', undefined, '  Renovar ')).toBe('TEXTO');
  });

  it('"quiero renovar mi crédito" no es la palabra clave sola → null', () => {
    expect(renovacionEntradaFromMessage('text', undefined, 'quiero renovar mi crédito')).toBeNull();
  });

  it('un botón de pago no abre la renovación', () => {
    expect(renovacionEntradaFromMessage('button', 'Pásame los datos de pago', 'Pásame los datos de pago')).toBeNull();
  });
});

describe('botón "🧾 Mandar comprobante" (lo manda el bot tras los datos de pago)', () => {
  it('tocarlo equivale a "Ya pagué": pide el comprobante', () => {
    expect(pilotoPagoBotonFromMessage('interactive', '🧾 Mandar comprobante', 'PILOTO_MANDAR_COMPROBANTE')).toBe('YA_PAGUE');
  });

  it('otro botón interactivo del bot no es de pago', () => {
    expect(pilotoPagoBotonFromMessage('interactive', 'Sí, programar ✅', 'RENOV_PROGRAMAR')).toBeNull();
  });

  it('su título cabe en el límite de 20 caracteres de Meta', () => {
    expect([...PILOTO_MANDAR_COMPROBANTE_BOTON.title].length).toBeLessThanOrEqual(20);
  });
});

describe('esComprobanteAutomatico', () => {
  const base = { stageComprobantePendiente: 'CLIENTE:comprobante_pendiente' };

  it.each([['image'], ['document']])('foto/PDF (%s) en cualquier stage normal → comprobante', (type) => {
    expect(esComprobanteAutomatico({ ...base, type, mediaUrl: '/uploads/x.jpg', stage: 'start' })).toBe(true);
  });

  it('a medio pre-solicitud la foto es un documento de la solicitud, no un comprobante', () => {
    expect(esComprobanteAutomatico({ ...base, type: 'image', mediaUrl: '/uploads/x.jpg', stage: 'PRE_SOLICITUD:ine' })).toBe(false);
  });

  it('con un comprobante ya en revisión se respeta el flujo actual (no se duplica)', () => {
    expect(esComprobanteAutomatico({
      ...base, type: 'image', mediaUrl: '/uploads/x.jpg', stage: 'CLIENTE:comprobante_pendiente'
    })).toBe(false);
  });

  it('sin archivo descargado (mediaUrl vacío) o un texto → no', () => {
    expect(esComprobanteAutomatico({ ...base, type: 'image', mediaUrl: undefined, stage: 'start' })).toBe(false);
    expect(esComprobanteAutomatico({ ...base, type: 'text', mediaUrl: undefined, stage: 'start' })).toBe(false);
  });
});
