// Tests de la traducción del rechazo de Meta a un error del piloto que se muestra en el panel.
import { describe, it, expect } from 'vitest';
import { pilotoErrorDesdeMeta } from '../mappers/metaTemplateError.mapper';

describe('pilotoErrorDesdeMeta', () => {
  it.each([
    [132000, 'META_VARIABLES_NO_COINCIDEN'],
    [131008, 'META_VARIABLES_NO_COINCIDEN'],
    [132012, 'META_VARIABLES_NO_COINCIDEN'],
    [132001, 'META_PLANTILLA_NO_EXISTE'],
    [132005, 'META_TEXTO_MUY_LARGO'],
    [132015, 'META_PLANTILLA_PAUSADA'],
    [132016, 'META_PLANTILLA_PAUSADA']
  ])('código de Meta %i → %s', (code, esperado) => {
    expect(pilotoErrorDesdeMeta({ error: { code, message: 'x' } })?.codigo).toBe(esperado);
  });

  it('el detalle trae el código y la descripción de Meta (details tiene prioridad sobre message)', () => {
    const traducido = pilotoErrorDesdeMeta({
      error: { code: 132000, message: '(#132000) Number of parameters does not match', error_data: { details: 'header: expected 1, got 0' } }
    });
    expect(traducido?.detalle).toBe('#132000 header: expected 1, got 0');
  });

  it('un código que no conocemos igual se muestra, como META_RECHAZO con la descripción de Meta', () => {
    expect(pilotoErrorDesdeMeta({ error: { code: 190, message: 'Invalid OAuth access token' } })).toEqual({
      codigo: 'META_RECHAZO',
      detalle: '#190 Invalid OAuth access token'
    });
  });

  it('sin respuesta de Meta (red, timeout) → null: sigue siendo un 500', () => {
    expect(pilotoErrorDesdeMeta(undefined)).toBeNull();
    expect(pilotoErrorDesdeMeta({})).toBeNull();
  });
});
