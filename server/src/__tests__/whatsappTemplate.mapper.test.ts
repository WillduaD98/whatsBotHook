// Tests del armado de `components` de una plantilla de Meta (formato de Graph API).
import { describe, it, expect } from 'vitest';
import { toTemplateComponents } from '../mappers/whatsappTemplate.mapper';

describe('toTemplateComponents', () => {
  it('con imagen de encabezado: header (image) primero y luego body con los textos en orden', () => {
    expect(toTemplateComponents({ name: 'prox_credito_gancho', bodyParams: ['María', '7'], headerImageId: 'MEDIA_1' })).toEqual([
      { type: 'header', parameters: [{ type: 'image', image: { id: 'MEDIA_1' } }] },
      { type: 'body', parameters: [{ type: 'text', text: 'María' }, { type: 'text', text: '7' }] }
    ]);
  });

  it('sin imagen no manda header', () => {
    expect(toTemplateComponents({ name: 'streak_alert', bodyParams: ['María'] })).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: 'María' }] }
    ]);
  });

  it('sin variables no manda body (Meta rechaza parámetros de más: #132000)', () => {
    expect(toTemplateComponents({ name: 'sin_variables', bodyParams: [] })).toEqual([]);
  });
});
