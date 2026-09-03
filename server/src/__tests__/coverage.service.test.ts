// Tests de caracterización: fijan el comportamiento ACTUAL del emparejamiento difuso
// de cobertura (ciudades y colonias de Puebla).
import { describe, it, expect } from 'vitest';
import { tryMatchCoverageCity, tryMatchPueblaColonia } from '../services/coverage.service';

describe('tryMatchCoverageCity', () => {
  const casosCubiertos: Array<[string, string]> = [
    ['Leon', 'León'],
    ['Guanajuato', 'Guanajuato'],
    ['Celaya', 'Celaya'],
    ['vivo en Irapuato', 'Irapuato'],
    ['San Miguel de Allende', 'San Miguel de Allende']
  ];

  it.each(casosCubiertos)('tryMatchCoverageCity(%s) -> "%s" (ciudad cubierta)', (input, expected) => {
    expect(tryMatchCoverageCity(input)).toBe(expected);
  });

  const casosConAcentosYTypos: Array<[string, string]> = [
    ['león', 'León'], // acento + minúsculas
    ['Querétaro', 'Queretaro'], // acento -> coincide con el nombre sin acento del catálogo
    ['Irapuatoo', 'Irapuato'], // letra repetida de más
    ['Aguascalientez', 'Aguascalientes'], // typo (z por s)
    ['san migel de alende', 'San Miguel de Allende'] // typos en varias palabras (fuzzy score)
  ];

  it.each(casosConAcentosYTypos)('tryMatchCoverageCity(%s) -> "%s" (con acentos/typos)', (input, expected) => {
    expect(tryMatchCoverageCity(input)).toBe(expected);
  });

  const casosNoCubiertos: Array<[string, null]> = [
    ['Monterrey', null],
    ['Guadalajara', null],
    ['Ciudad de Mexico', null],
    ['', null]
  ];

  it.each(casosNoCubiertos)('tryMatchCoverageCity(%s) -> %s (ciudad NO cubierta)', (input, expected) => {
    expect(tryMatchCoverageCity(input)).toBe(expected);
  });
});

describe('tryMatchPueblaColonia', () => {
  const casosCubiertos: Array<[string, string]> = [
    ['La Carmelita', 'La Carmelita'],
    ['Bugambilias', 'Bugambilias'],
    ['Guadalupe Hidalgo', 'Guadalupe Hidalgo'],
    ['San Ramon', 'San Ramon']
  ];

  it.each(casosCubiertos)('tryMatchPueblaColonia(%s) -> "%s" (colonia cubierta)', (input, expected) => {
    expect(tryMatchPueblaColonia(input)).toBe(expected);
  });

  const casosConVariantes: Array<[string, string]> = [
    ['la carmelita', 'La Carmelita'], // minúsculas
    ['Bugambilias ', 'Bugambilias'], // espacio extra
    ['Bugambilia', 'Bugambilias'], // falta la "s" final (match por substring, no por Levenshtein)
    ['colonia La Carmelita', 'La Carmelita'] // texto adicional alrededor
  ];

  it.each(casosConVariantes)('tryMatchPueblaColonia(%s) -> "%s" (variantes)', (input, expected) => {
    expect(tryMatchPueblaColonia(input)).toBe(expected);
  });

  const casosNoCubiertos: Array<[string, null]> = [
    ['Polanco', null],
    ['Roma Norte', null],
    ['', null]
  ];

  it.each(casosNoCubiertos)('tryMatchPueblaColonia(%s) -> %s (colonia NO cubierta)', (input, expected) => {
    expect(tryMatchPueblaColonia(input)).toBe(expected);
  });

  it('tryMatchPueblaColonia: un typo con letra faltante en medio de la palabra NO matchea (sin fuzzy score para colonias)', () => {
    // FIXME: a diferencia de tryMatchCoverageCity (que usa distancia de Levenshtein como
    // último recurso), tryMatchPueblaColonia solo compara claves exactas, substrings (>=4
    // caracteres) y secuencias/subconjuntos de tokens — no tiene un score difuso. Por eso
    // "bugambilas" (le falta la "i") no encuentra "Bugambilias", aunque para el matcher de
    // ciudades un typo similar sí se resolvería. Se congela el comportamiento actual tal cual.
    expect(tryMatchPueblaColonia('bugambilas')).toBeNull();
  });
});
