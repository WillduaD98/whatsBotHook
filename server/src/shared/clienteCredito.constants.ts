// Valores permitidos del perfil de crédito del cliente (piloto de renovación).
// Única fuente: los enum del schema ClienteCredito y sus types se derivan de aquí.

// Plazos (en semanas) que se le pueden autorizar a un cliente; cada cliente tiene un subconjunto de estos.
export const PLAZOS_SEMANAS = [4, 8, 12, 16] as const;
export type PlazoSemanas = (typeof PLAZOS_SEMANAS)[number];

export function isPlazoSemanas(value: number): value is PlazoSemanas {
  return (PLAZOS_SEMANAS as readonly number[]).includes(value);
}

// Niveles de confianza: 1 Arranque → 2 Constante → 3 Confianza → 4 Socio (el 3 es la meta que se promete).
export const NIVELES_CONFIANZA = [1, 2, 3, 4] as const;
export type NivelConfianza = (typeof NIVELES_CONFIANZA)[number];

export function isNivelConfianza(value: number): value is NivelConfianza {
  return (NIVELES_CONFIANZA as readonly number[]).includes(value);
}

// Tasa real del método flat: 2.5% semanal = 10% por cada 4 semanas.
export const TASA_SEMANAL_DEFAULT = 0.025;
