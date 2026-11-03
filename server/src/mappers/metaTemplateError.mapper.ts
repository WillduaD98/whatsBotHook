// Traduce el rechazo de Meta al enviar una plantilla a un error del piloto que el operador entiende (puro).
import type { PilotoErrorCode } from "../errors/PilotoErrores.js";
import type { PilotoErrorDeMeta } from "../types/piloto.types.js";
import type { MetaErrorResponse } from "../types/whatsapp.types.js";

// Códigos de Graph conocidos para plantillas; cualquier otro rechazo de Meta sale como META_RECHAZO con su descripción.
const PILOTO_ERROR_POR_CODIGO_META = new Map<number, PilotoErrorCode>([
  [131008, "META_VARIABLES_NO_COINCIDEN"], // falta un parámetro requerido
  [132000, "META_VARIABLES_NO_COINCIDEN"], // el número de parámetros no coincide
  [132012, "META_VARIABLES_NO_COINCIDEN"], // el formato de un parámetro no coincide
  [132001, "META_PLANTILLA_NO_EXISTE"], // no existe con ese nombre/idioma
  [132005, "META_TEXTO_MUY_LARGO"], // ya con las variables, el texto excede el límite
  [132015, "META_PLANTILLA_PAUSADA"],
  [132016, "META_PLANTILLA_PAUSADA"] // deshabilitada
]);

// null = no hay respuesta de Meta (red, timeout): eso es falla nuestra y sigue saliendo como 500.
export function pilotoErrorDesdeMeta(respuesta: MetaErrorResponse | undefined): PilotoErrorDeMeta | null {
  const error = respuesta?.error;
  if (!error) return null;
  const descripcion = error.error_data?.details ?? error.message ?? "sin descripción";
  return {
    codigo: (error.code !== undefined && PILOTO_ERROR_POR_CODIGO_META.get(error.code)) || "META_RECHAZO",
    detalle: `#${error.code ?? "?"} ${descripcion}`
  };
}
