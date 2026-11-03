// Tests de la explicación de la racha (botón "¿Para qué sirve mi racha?"): 3 mensajes en orden y la racha del cliente.
import { describe, it, expect } from 'vitest';
import { buildExplicacionRacha } from '../mappers/rachaMensajes.mapper';

describe('buildExplicacionRacha', () => {
  it('son 3 mensajes: qué es, qué desbloqueas y lo que viene', () => {
    const [queEs, queDesbloqueas, loQueViene] = buildExplicacionRacha(7);
    expect(queEs).toContain('*¿Qué es tu racha?*');
    expect(queEs).toContain('indicador interno del *buen historial crediticio*');
    expect(queDesbloqueas).toContain('*¿Qué desbloqueas?*');
    expect(queDesbloqueas).toContain('*3 créditos seguidos*');
    expect(queDesbloqueas).toContain('*opciones de plazo*');
    expect(loQueViene).toContain('*más beneficios*');
  });

  it('el cierre trae la racha del cliente', () => {
    expect(buildExplicacionRacha(7)[2]).toContain('Hoy llevas *7 pagos* en tiempo y forma.');
  });

  it('sin perfil del piloto (racha null) el cierre no inventa una racha', () => {
    const cierre = buildExplicacionRacha(null)[2];
    expect(cierre).not.toContain('Hoy llevas');
    expect(cierre).toContain('¡Sigue así! 💪');
  });

  it('cada mensaje que habla de racha lleva 🔥', () => {
    for (const mensaje of buildExplicacionRacha(7)) {
      if (/racha/i.test(mensaje)) expect(mensaje).toContain('🔥');
    }
  });
});
