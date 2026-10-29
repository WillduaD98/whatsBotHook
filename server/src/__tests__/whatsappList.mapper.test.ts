// Tests del armado del objeto `interactive` de una lista de WhatsApp (formato de Graph API).
import { describe, it, expect } from 'vitest';
import { toListInteractive } from '../mappers/whatsappList.mapper';

describe('toListInteractive', () => {
  it('arma una lista de una sección con el formato que pide Graph', () => {
    const result = toListInteractive({
      bodyText: '📆 ¿En cuántas semanas lo quieres pagar?',
      buttonText: 'Ver plazos',
      sectionTitle: 'Tus plazos',
      rows: [
        { id: 'PLAZO_4', title: '4 semanas', description: '~$1,375/semana' },
        { id: 'PLAZO_8', title: '8 semanas', description: '~$750/semana' }
      ]
    });

    expect(result).toEqual({
      type: 'list',
      body: { text: '📆 ¿En cuántas semanas lo quieres pagar?' },
      action: {
        button: 'Ver plazos',
        sections: [
          {
            title: 'Tus plazos',
            rows: [
              { id: 'PLAZO_4', title: '4 semanas', description: '~$1,375/semana' },
              { id: 'PLAZO_8', title: '8 semanas', description: '~$750/semana' }
            ]
          }
        ]
      }
    });
  });

  it('sin título de sección no manda `title` (Meta solo lo exige con 2+ secciones)', () => {
    const result = toListInteractive({ bodyText: 'Elige', buttonText: 'Ver', rows: [{ id: 'A', title: 'Opción A' }] });
    expect(result.action.sections[0]).toEqual({ rows: [{ id: 'A', title: 'Opción A' }] });
  });

  it('no manda `description` ni `title` vacíos o solo con espacios (Meta rechaza campos vacíos)', () => {
    const result = toListInteractive({
      bodyText: 'Elige',
      buttonText: 'Ver',
      sectionTitle: '   ',
      rows: [{ id: 'A', title: 'Opción A', description: '  ' }]
    });
    expect(result.action.sections[0]).toEqual({ rows: [{ id: 'A', title: 'Opción A' }] });
  });
});
