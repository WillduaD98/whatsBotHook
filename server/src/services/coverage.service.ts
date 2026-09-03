// Servicio de cobertura: emparejamiento difuso de ciudades/colonias contra los catálogos de cobertura.
// Módulo PURO: no importa DB, WhatsApp ni ningún I/O.
import { normalizeText } from "./router.service.js";

const COVERAGE_CITY_NAMES = [
  "León",
  "Guanajuato",
  "Irapuato",
  "Salamanca",
  "San Miguel de Allende",
  "Celaya",
  "Dolores Hidalgo",
  "San Francisco del Rincon",
  "Queretaro",
  "Aguascalientes",
  "Silao",
  "San Luis Potosi",
  "Puebla"
];

export const PUEBLA_COVERAGE_COLONIAS: string[] = [
  'Guadalupe Hidalgo',
  'Ampliacion Guadalupe Hidalgo',
  'Infonavit San Miguel Mayorazgo',
  'La Carmelita',
  'Jardines de Santa Rosa',
  'Granjas Puebla',
  'Villa Albertina',
  'Geovillas del Sur',
  'Arboledas de Loma Bella',
  'Vicente Guerrero',
  'Los heroes Puebla 1 seccion',
  'Los heroes Puebla primera seccion',
  'Bosques de los heroes',
  'Los heroes de Puebla',
  'Los heroes 2da seccion',
  'Los heroes segunda seccion',
  'Arboledas de loma bella',
  'Granjas de San Isidro',
  'Granjas del sur',
  'Bugambilias',
  'San Ramon',
  'Castillotla',
  'Geovillas del Sur',
  'Minerales de Guadalupe Sur',
  'Bosques de la cañada',
  'Union Antorchista',
  'La Albertina'
];

function normalizeCityKey(input: string): string {
  return cityTokens(input).join("");
}

function normalizeColoniaKey(input: string): string {
  return normalizeText(input).replace(/\s+/g, "");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const alen = a.length;
  const blen = b.length;
  if (alen === 0) return blen;
  if (blen === 0) return alen;

  const dp = new Array<number>(blen + 1);
  for (let j = 0; j <= blen; j++) dp[j] = j;

  for (let i = 1; i <= alen; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= blen; j++) {
      const tmp = dp[j];
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[blen];
}

export function cityTokens(input: string): string[] {
  const t = normalizeText(input);
  const raw = t.split(" ").filter(Boolean);
  const drop = new Set([
    "de",
    "del",
    "la",
    "el",
    "los",
    "las",
    "y",
    "en",
    "soy",
    "estoy",
    "vivo",
    "vivimos",
    "mi",
    "mis",
    "negocio",
    "ciudad",
    "municipio",
    "estado",
    "gto",
    "mx",
    "mexico",
    "calle",
    "col",
    "colonia",
    "fracc",
    "fraccionamiento",
    "av",
    "avenida",
    "blvd",
    "bulevar",
    "boulevard",
    "cp",
    "codigo",
    "postal",
    "no",
    "num",
    "numero",
    "interior",
    "exterior"
  ]);
  return raw.filter((x) => !drop.has(x) && !/^\d+$/.test(x));
}

function scoreSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  const dist = levenshtein(a, b);
  return 1 - dist / maxLen;
}

function containsSequenceTokens(input: string[], seq: string[]): boolean {
  if (seq.length === 0 || input.length < seq.length) return false;
  for (let i = 0; i <= input.length - seq.length; i++) {
    let ok = true;
    for (let j = 0; j < seq.length; j++) {
      if (input[i + j] !== seq[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

export function tryMatchPueblaColonia(input: string): string | null {
  const inputKey = normalizeColoniaKey(input);
  if (!inputKey) return null;

  const normalized = PUEBLA_COVERAGE_COLONIAS.map((name) => {
    const key = normalizeColoniaKey(name);
    const tokens = normalizeText(name).split(" ").filter(Boolean);
    return { name, key, tokens };
  }).filter((x) => x.key.length >= 3);

  for (const c of normalized) {
    if (c.key === inputKey) return c.name;
  }

  for (const c of normalized) {
    if (c.key.length >= 4 && (inputKey.includes(c.key) || c.key.includes(inputKey))) return c.name;
  }

  const inputTokens = normalizeText(input).split(" ").filter(Boolean);
  for (const c of normalized) {
    if (containsSequenceTokens(inputTokens, c.tokens)) return c.name;
    if (inputTokens.length > 0 && inputTokens.every((t) => c.tokens.includes(t))) return c.name;
  }

  return null;
}

export function tryMatchCoverageCity(input: string): string | null {
  const inputTokens = cityTokens(input);
  if (inputTokens.length === 0) return null;
  const inputJoined = normalizeCityKey(input);
  if (inputJoined.length < 3) return null;

  const normalized = COVERAGE_CITY_NAMES.map((name) => {
    const tokens = cityTokens(name);
    return { name, tokens, key: normalizeCityKey(name) };
  }).filter((x) => x.key.length >= 3);

  for (const c of normalized) {
    if (containsSequenceTokens(inputTokens, c.tokens)) return c.name;
  }

  for (const c of normalized) {
    if (inputJoined.includes(c.key)) return c.name;
  }

  let best: { name: string; score: number } | null = null;
  let secondBestScore = -1;

  for (const c of normalized) {
    const minW = Math.max(1, c.tokens.length - 1);
    const maxW = Math.min(6, c.tokens.length + 2, inputTokens.length);
    let bestCityScore = 0;
    for (let w = minW; w <= maxW; w++) {
      for (let i = 0; i <= inputTokens.length - w; i++) {
        const windowKey = inputTokens.slice(i, i + w).join("");
        const s = scoreSimilarity(windowKey, c.key);
        if (s > bestCityScore) bestCityScore = s;
      }
    }
    const score = bestCityScore;
    if (!best || score > best.score) {
      secondBestScore = best ? best.score : secondBestScore;
      best = { name: c.name, score };
    } else if (score > secondBestScore) {
      secondBestScore = score;
    }
  }

  if (!best) return null;
  if (best.score < 0.82) return null;
  if (secondBestScore >= 0 && best.score - secondBestScore < 0.06) return null;
  return best.name;
}
