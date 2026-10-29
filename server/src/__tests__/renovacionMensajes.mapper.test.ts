// Tests de los mensajes del flujo de renovación: la lista de plazos y los textos con montos/cuotas (con centavos).
import { describe, it, expect } from 'vitest';
import {
  buildCitaAgendadaText,
  buildCuotaText,
  buildMontoExcedeText,
  buildOfertaText,
  buildPlazoList,
  RENOVACION_BOTONES
} from '../mappers/renovacionMensajes.mapper';
import type { RenovacionCliente } from '../types/renovacion.types';

const maria: RenovacionCliente = {
  numeroCredito: '10483',
  limite: 10000,
  plazos: [4, 8, 12, 16],
  tasaSemanal: 0.025,
  racha: 7,
  nivel: 2
};

describe('buildPlazoList', () => {
  it('una opción por plazo del cliente, con su cuota estimada (tabla del negocio con $5,000)', () => {
    const list = buildPlazoList(maria, 5000);
    expect(list.rows).toEqual([
      { id: 'RENOV_PLAZO_4', title: '4 semanas', description: '~$1,375/semana' },
      { id: 'RENOV_PLAZO_8', title: '8 semanas', description: '~$750/semana' },
      { id: 'RENOV_PLAZO_12', title: '12 semanas', description: '~$541.67/semana' },
      { id: 'RENOV_PLAZO_16', title: '16 semanas', description: '~$437.50/semana' }
    ]);
  });

  it('quien solo tiene 4/8/12 no ve el de 16', () => {
    const list = buildPlazoList({ ...maria, plazos: [4, 8, 12] }, 5000);
    expect(list.rows.map((row) => row.id)).toEqual(['RENOV_PLAZO_4', 'RENOV_PLAZO_8', 'RENOV_PLAZO_12']);
  });
});

describe('textos', () => {
  it('cuota con centavos cuando los hay y el gancho de nivel acordado', () => {
    const text = buildCuotaText({ monto: 5000, plazoSemanas: 12, cuotaSemanal: 541.67 });
    expect(text).toContain('Con *$5,000* a *12 semanas*, tu tanda quedaría en *~$541.67/semana* (estimado).');
    expect(text).toContain('¡Continúa creciendo tu racha! Con 2 créditos más con buenas rachas subes al siguiente nivel');
  });

  it('el rebote por límite le dice cuál es su límite', () => {
    expect(buildMontoExcedeText(10000)).toBe('Tu límite es *$10,000*, dame uno igual o menor 🙏');
  });

  it('la confirmación repite exactamente lo que se agendó', () => {
    expect(buildCitaAgendadaText({ monto: 8000, plazoSemanas: 8, cuotaSemanal: 1200 })).toContain(
      'con *$8,000* a *8 semanas* (cuota ~$1,200)'
    );
  });

  it('la oferta (entrada por "renovar") resume racha en pagos, nivel, límite y plazos', () => {
    const text = buildOfertaText(maria, 'María López');
    expect(text).toContain('🎉 María López, mira lo que has logrado:');
    expect(text).toContain('*7 pagos* en tiempo y forma');
    expect(text).toContain('*Nivel 2*');
    expect(text).toContain('Tu límite: *$10,000*');
    expect(text).toContain('Plazos: 4, 8, 12 y 16 semanas');
  });
});

describe('RENOVACION_BOTONES', () => {
  it('todos los títulos caben en el límite de 20 caracteres de Meta', () => {
    for (const boton of Object.values(RENOVACION_BOTONES)) {
      expect([...boton.title].length).toBeLessThanOrEqual(20);
    }
  });
});
