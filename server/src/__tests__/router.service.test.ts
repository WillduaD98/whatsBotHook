// Tests de caracterización: fijan el comportamiento ACTUAL de router.service.ts.
// No corrigen bugs; si algo se ve raro, se congela con un comentario // FIXME.
import { describe, it, expect } from 'vitest';
import { detectIntent, buildReply, normalizeText, isClienteText, type Intent } from '../services/router.service';

describe('normalizeText', () => {
  it('normalizeText: "holá" -> "hola" (quita acentos)', () => {
    // Arrange
    const input = 'holá';
    // Act
    const result = normalizeText(input);
    // Assert
    expect(result).toBe('hola');
  });

  it('normalizeText: "holaaaa" -> "holaa" (reduce repetición de letras a máximo 2)', () => {
    const input = 'holaaaa';
    const result = normalizeText(input);
    expect(result).toBe('holaa');
  });

  it('normalizeText: "  Hola   Mundo  " -> "hola mundo" (colapsa espacios y hace trim)', () => {
    const input = '  Hola   Mundo  ';
    const result = normalizeText(input);
    expect(result).toBe('hola mundo');
  });

  it('normalizeText: "HOLA!!" -> "hola" (minúsculas y quita signos)', () => {
    const input = 'HOLA!!';
    const result = normalizeText(input);
    expect(result).toBe('hola');
  });

  it('normalizeText: cadena vacía -> cadena vacía', () => {
    const input = '';
    const result = normalizeText(input);
    expect(result).toBe('');
  });
});

describe('isClienteText', () => {
  const casos: Array<[string, boolean]> = [
    ['cliente', true],
    ['Soy cliente', true],
    ['SOY CLIENTE!!', true],
    ['  cliente  ', true],
    ['quiero un credito', false],
    ['clientela', false], // "clientela" no matchea el límite de palabra \bcliente\b
    ['hola', false],
    ['Soy CLIENTA', false] // "clienta" no es "cliente"
  ];

  it.each(casos)('isClienteText(%s) -> %s', (input, expected) => {
    expect(isClienteText(input)).toBe(expected);
  });
});

describe('detectIntent: casos principales', () => {
  const casos: Array<[string, Intent]> = [
    // Saludo
    ['hola', 'SALUDO'],
    ['Buenas tardes', 'SALUDO'],
    ['que onda', 'SALUDO'],
    ['hey', 'SALUDO'],
    // Gracias
    ['gracias', 'GRACIAS'],
    ['muchas gracias', 'GRACIAS'],
    ['perfecto', 'GRACIAS'],
    // Humano / asesor
    ['quiero hablar con un asesor', 'ASESOR'],
    ['necesito un humano', 'ASESOR'],
    ['quiero hablar con una persona', 'ASESOR'],
    // Requisitos
    ['requisitos', 'REQUISITOS'],
    ['que necesito', 'REQUISITOS'],
    // Quiero crédito
    ['quiero un credito', 'QUIERO_CREDITO'],
    ['necesito un prestamo', 'QUIERO_CREDITO'],
    ['me prestan algo', 'QUIERO_CREDITO'],
    // Montos (números tipo 8000). Los casos con "$" van aparte como it() individuales
    // porque el título auto-generado de it.each ("%s") corrompe valores con "$" (ver abajo).
    ['monto', 'MONTOS_PLAZOS'],
    ['8000', 'MONTOS_PLAZOS'],
    ['12.000', 'MONTOS_PLAZOS'],
    ['8 000', 'MONTOS_PLAZOS'],
    // Explicación (cómo funciona / plazos)
    ['como funciona', 'EXPLICACION'],
    ['cuales son los plazos', 'EXPLICACION'],
    ['semanal', 'EXPLICACION'],
    // Horarios
    ['horarios', 'HORARIOS'],
    ['a que hora abren', 'HORARIOS'],
    // Sucursal
    ['sucursal', 'SUCURSAL'],
    ['donde estan ubicados', 'SUCURSAL'],
    // Confianza
    ['confianza', 'CONFIANZA'],
    ['es una estafa', 'CONFIANZA'],
    // Pre-verificación
    ['pre solicitud', 'PRE_SOLICITUD'],
    ['verificacion', 'PRE_SOLICITUD'],
    // Pagos
    ['pago', 'PAGOS'],
    ['cuando pago', 'PAGOS'],
    ['saldo', 'PAGOS'],
    // Fallback
    ['asdkjaslkdj sin sentido', 'UNKNOWN']
  ];

  it.each(casos)('detectIntent(%s) -> %s', (input, expected) => {
    expect(detectIntent(input)).toBe(expected);
  });

  // Fuera de la tabla porque el título auto-generado de it.each ("%s") corrompe
  // valores que contienen "$" (ej. "$8,000" se mostraba como "undefined,000" en el
  // nombre del test, aunque la aserción en sí corría bien). Se escriben aparte con
  // título manual para tener nombres de test legibles.
  it('detectIntent("$8,000") -> MONTOS_PLAZOS (monto con símbolo $ y separador de miles)', () => {
    expect(detectIntent('$8,000')).toBe('MONTOS_PLAZOS');
  });

  it('detectIntent("$ 10000") -> MONTOS_PLAZOS (monto con símbolo $ y espacio)', () => {
    expect(detectIntent('$ 10000')).toBe('MONTOS_PLAZOS');
  });
});

describe('detectIntent: atajos de menú por número ("1".."6")', () => {
  // FIXME: posible bug / gap de diseño. detectIntent NO tiene ningún mapeo de dígitos
  // sueltos ("1".."6") a una intención concreta: ninguna de sus regex matchea un solo
  // dígito (MONTOS_PLAZOS requiere 4+ dígitos o separador de miles). Hoy, escribir
  // literalmente "1", "2", "3", "4", "5" o "6" SIEMPRE cae en "UNKNOWN" vía esta función.
  // El manejo real de "atajos numéricos de menú" vive fuera de router.service.ts, en
  // webhookController.ts, donde simplemente se le pide al usuario que use los botones.
  // Se congela el comportamiento actual tal cual, incluyendo las opciones 5 y 6.
  const casos: Array<[string, Intent]> = [
    ['1', 'UNKNOWN'],
    ['2', 'UNKNOWN'],
    ['3', 'UNKNOWN'],
    ['4', 'UNKNOWN'],
    ['5', 'UNKNOWN'], // FIXME: opción 5 del menú no tiene mapeo -> UNKNOWN, congelado tal cual
    ['6', 'UNKNOWN'] // FIXME: opción 6 del menú no tiene mapeo -> UNKNOWN, congelado tal cual
  ];

  it.each(casos)('detectIntent(%s) -> %s (sin mapeo numérico, ver FIXME arriba)', (input, expected) => {
    expect(detectIntent(input)).toBe(expected);
  });
});

describe('detectIntent: regex sospechosa (QUIERO_CREDITO opaca a PRE_SOLICITUD)', () => {
  // FIXME: posible bug de regex. La rama QUIERO_CREDITO usa:
  //   /\b(aplicar|solicitar|tramitar|iniciar|registrarme)\b.*\b(credito|prestamo)?\b/
  // El grupo (credito|prestamo) termina en "?", es decir es OPCIONAL. Por lo tanto,
  // CUALQUIER texto que contenga "aplicar"/"solicitar"/"tramitar"/"iniciar"/"registrarme"
  // cae en QUIERO_CREDITO aunque NO mencione "crédito" ni "préstamo" en ningún lado.
  // Como esa rama (#6) se evalúa ANTES que PRE_SOLICITUD (rama final), palabras como
  // "solicitar" o "aplicar" JAMÁS llegan a activar PRE_SOLICITUD, aunque PRE_SOLICITUD
  // también las tiene en su propia lista de patrones (aplicar|solicitud|solicitar|...).
  // Se congela el comportamiento actual tal cual, sin corregirlo.
  const casos: Array<[string, Intent]> = [
    ['quiero solicitar', 'QUIERO_CREDITO'],
    ['aplicar', 'QUIERO_CREDITO'],
    ['solicitar', 'QUIERO_CREDITO'],
    ['tramitar mi credito', 'QUIERO_CREDITO'],
    ['registrarme', 'QUIERO_CREDITO']
  ];

  it.each(casos)('detectIntent(%s) -> %s (no PRE_SOLICITUD, ver FIXME arriba)', (input, expected) => {
    expect(detectIntent(input)).toBe(expected);
  });
});

describe('buildReply', () => {
  it('buildReply(SALUDO) contiene el saludo de TandaYa y la instrucción de MENÚ', () => {
    const reply = buildReply('SALUDO');
    expect(reply).toContain('TandaYa');
    expect(reply).toContain('MENÚ');
  });

  it('buildReply(REQUISITOS) contiene los requisitos básicos', () => {
    const reply = buildReply('REQUISITOS');
    expect(reply).toContain('Requisitos básicos');
    expect(reply).toContain('INE vigente');
  });

  it('buildReply(PAGOS) cae en el mensaje genérico por defecto', () => {
    // FIXME: posible bug. detectIntent SÍ puede devolver "PAGOS" (ver describe de arriba),
    // pero el switch de buildReply no tiene un case "PAGOS" activo (está comentado en el
    // código fuente), así que siempre cae al "default" con el mensaje genérico de
    // "Te entendí a medias". Se congela el comportamiento actual tal cual.
    const reply = buildReply('PAGOS');
    expect(reply).toContain('Te entendí a medias');
  });

  it('buildReply(UNKNOWN) devuelve el mensaje genérico por defecto', () => {
    const reply = buildReply('UNKNOWN');
    expect(reply).toContain('Te entendí a medias');
  });
});
