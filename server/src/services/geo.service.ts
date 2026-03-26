// Clasificación de cobertura y utilidades de geolocalización.
// Este módulo valida coordenadas y determina si una ubicación está dentro de rangos de cobertura.

export type CoverageStatus = "SI_COBERTURA" | "NO_COBERTURA" | "REVISAR_ASESOR";

// Placeholder de rangos: cajas [minLat, minLon, maxLat, maxLon]
// Rellena estos arreglos con tus coordenadas reales
// Zonas con cobertura (PLACEHOLDER). Cada elemento es una caja:
// [minLat, minLon, maxLat, maxLon]. Sustituye con tus rangos reales.
type Box = [number, number, number, number]; // [minLat, minLon, maxLat, maxLon]

// Ajusta estos mínimos según tu precisión deseada.
// 0.003° ~ 300–350m aprox en Gto.
// 0.005° ~ 500–600m aprox.
const MIN_LAT_SPAN = 0.003;
const MIN_LON_SPAN = 0.003;

function normalizeBox(box: Box): Box {
  const [aLat, aLon, bLat, bLon] = box;
  let minLat = Math.min(aLat, bLat);
  let maxLat = Math.max(aLat, bLat);
  let minLon = Math.min(aLon, bLon);
  let maxLon = Math.max(aLon, bLon);

  // Ensancha si queda "línea"
  if (maxLat - minLat < MIN_LAT_SPAN) {
    const mid = (minLat + maxLat) / 2;
    minLat = mid - MIN_LAT_SPAN / 2;
    maxLat = mid + MIN_LAT_SPAN / 2;
  }
  if (maxLon - minLon < MIN_LON_SPAN) {
    const mid = (minLon + maxLon) / 2;
    minLon = mid - MIN_LON_SPAN / 2;
    maxLon = mid + MIN_LON_SPAN / 2;
  }

  return [minLat, minLon, maxLat, maxLon];
}
const RAW_COVERAGE_ZONES: Box[] = [
  // [minLat, minLon, maxLat, maxLon]
  //LEON COORDENADAS
 // 1) Normalizada (estaba invertida en lat)
  [21.08019, -101.63318, 21.17906, -101.62322],
  // 2) Normalizada (estaba invertida en lon)
  [21.08279, -101.72575, 21.17902, -101.71357],
  // 3) Era casi línea (lon casi igual). Le doy ancho mínimo alrededor de -101.5922
  [21.07920, -101.59470, 21.12863, -101.58970],
  // 4) Era casi línea (lon casi igual). Le doy ancho mínimo alrededor de -101.6230
  [21.08019, -101.62551, 21.13174, -101.62051],
  // 5) Ya era caja válida (solo normalizada por seguridad)
  [21.08279, -101.72124, 21.15440, -101.71357],
  // 6) Normalizada (lon invertida) + ancho mínimo para que no quede tirilla
  [21.08320, -101.77374, 21.15431, -101.76874],
  // 7) Normalizada (lat y lon invertidas)
  [20.98245, -101.81932, 21.05235, -101.81794],
  // 8) Normalizada (lon invertida)
  [20.97989, -101.89210, 21.05052, -101.88989],
  // 9) NUEVA: corregí el signo de lon (de 101.3925 a -101.3925) + normalizada
  [20.97571, -101.54459, 21.07185, -101.39250],
  // 10) NUEVA: corregí el signo de lon (de 101.41308 a -101.41308) + normalizada
  [20.95938, -101.58716, 21.05103, -101.41308],
  //GUANAJUATO
  [20.9709, -101.30882, 20.94774, -101.30891],
  [20.94902, -101.32676, 20.96954, -101.32659],
  [20.97121, -101.26512, 20.94684, -101.2652],
  [21.0154, -101.26261, 21.01284, -101.30861],
  [21.03221, -101.23384, 21, -101.2335],
  [20.99904, -101.26148, 21.03381, -101.26251],
  
  //GUANAJUATO PUENTECILLAS
  [20.94599, -101.27419, 20.9266, -101.27385],
  [20.92603, -101.28458, 20.94535, -101.28612],
  //IRAPUATO
  [20.72381, -101.30813, 20.63355, -101.30367],
  [20.6358, -101.38264, 20.72157, -101.38092],
  //SALAMANCA
  [20.61043, -101.16642, 20.53972, -101.16848],
  [20.54197, -101.22306, 20.61043, -101.22238],
  //SAN MIGUEL ALLENDE
  [20.94255, -100.7112, 20.88675, -100.71137],
  [20.88643, -100.76733, 20.94351, -100.76922],
  //CELAYA
  [20.55429, -100.77312, 20.48645, -100.77724],
  [20.48934, -100.8483, 20.55622, -100.85139],
  //DOLORES
  [21.16944, -100.89814, 21.1379, -100.89797],
  [21.13902, -100.94449, 21.16944, -100.94414],
  // PUEBLA QUICK BOX
  [18.85212, -98.40435, 19.20372, -97.97376],
  // PUEBLA CORE BOXES
  [19.02602, -98.40435, 19.11869, -98.26104], // San Pedro Cholula
  [18.97565, -98.35819, 19.06850, -98.22386], // San Andrés Cholula
  [18.99236, -98.36953, 19.03313, -98.32188], // San Gregorio Atzompa
  [19.09805, -98.38261, 19.14498, -98.30827], // Juan C. Bonilla
  [19.15437, -98.32379, 19.19040, -98.28788], // San Miguel Xoxtla
  [19.07803, -98.30018, 19.16075, -98.22440], // Cuautlancingo
  [19.09222, -98.32528, 19.17222, -98.24528], // Coronango / San Francisco Ocotlán
  [18.88372, -98.35815, 19.20372, -98.03815], // Puebla de Zaragoza
  [18.98203, -98.13710, 19.14579, -97.97376], // Amozoc
  [18.85212, -98.37090, 19.00795, -98.26855], // Ocoyucan
];
export const COVERAGE_ZONES: Box[] = RAW_COVERAGE_ZONES.map(normalizeBox);
// Zonas sin cobertura (PLACEHOLDER). Usa el mismo formato de caja:
// [minLat, minLon, maxLat, maxLon]. Añade tus rangos reales aquí.
const NO_COVERAGE_ZONES: Array<[number, number, number, number]> = [
  // [minLat, minLon, maxLat, maxLon]
    // [21.12902, -101.69199, 21.12386, -101.67958],
    // [21.12162, -101.69550, 21.12902, -101.69199],

];

// Zonas que requieren revisión por asesor (PLACEHOLDER).
// [minLat, minLon, maxLat, maxLon]. Completa con tus rangos.
const REVIEW_ZONES: Array<[number, number, number, number]> = [
  // [minLat, minLon, maxLat, maxLon]
];

// Determina si la coordenada (lat, lon) cae dentro de la caja dada.
// Parámetros:
// - lat: latitud en grados (-90 a 90)
// - lon: longitud en grados (-180 a 180)
// - box: [minLat, minLon, maxLat, maxLon]
// Regresa true si está dentro (incluye límites).
function inBox(lat: number, lon: number, box: [number, number, number, number]) {
  const [minLat, minLon, maxLat, maxLon] = box;
  return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
}

// Valida que las coordenadas sean números finitos y estén en rangos geográficos válidos.
// - lat debe estar entre [-90, 90]
// - lon debe estar entre [-180, 180]
// Regresa true si ambas condiciones se cumplen.
export function isValidCoords(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

// Clasifica la ubicación según los rangos definidos:
// - Primero verifica zonas con cobertura (SI_COBERTURA)
// - Luego zonas sin cobertura (NO_COBERTURA)
// - Luego zonas a revisar por asesor (REVISAR_ASESOR)
// Si no coincide con ninguna, devuelve REVISAR_ASESOR por defecto.
export function classifyCoords(lat: number, lon: number): CoverageStatus {
  if (!isValidCoords(lat, lon)) return "REVISAR_ASESOR";

  // 1) huecos dentro de cobertura
  for (const box of NO_COVERAGE_ZONES) if (inBox(lat, lon, normalizeBox(box))) return "NO_COBERTURA";

  // 2) revisión
  for (const box of REVIEW_ZONES) if (inBox(lat, lon, normalizeBox(box))) return "REVISAR_ASESOR";

  // 3) cobertura
  for (const box of COVERAGE_ZONES) if (inBox(lat, lon, box)) return "SI_COBERTURA";

  return "NO_COBERTURA";
}
