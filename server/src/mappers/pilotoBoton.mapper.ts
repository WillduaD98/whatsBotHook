// Reconoce qué botón de una plantilla del piloto tocó el cliente, o si pidió renovar por texto (puro, sin BD).
import { PILOTO_GANCHO_BOTON, PILOTO_PAGO_BOTONES, type PilotoPagoBoton } from "../shared/pilotoTemplates.constants.js";
import type { RenovacionEntrada } from "../types/renovacion.types.js";
import { normalizeText } from "../services/router.service.js";

// Sin acentos, emojis, mayúsculas ni espacios: "Ya pagué ✅" y "ya pague" quedan iguales.
function compactar(texto: string): string {
  return normalizeText(texto).replace(/\s+/g, "");
}

const BOTON_POR_TEXTO = new Map<string, PilotoPagoBoton>(
  (Object.keys(PILOTO_PAGO_BOTONES) as PilotoPagoBoton[]).map((boton) => [compactar(PILOTO_PAGO_BOTONES[boton]), boton])
);

// Solo botones de plantilla (type "button"); los botones interactivos del bot traen su propio id y no pasan por aquí.
export function pilotoPagoBotonFromMessage(type: string, buttonText: string | undefined): PilotoPagoBoton | null {
  if (type !== "button" || !buttonText) return null;
  return BOTON_POR_TEXTO.get(compactar(buttonText)) ?? null;
}

const GANCHO_COMPACTO = compactar(PILOTO_GANCHO_BOTON);

// Entrada al flujo de renovación: botón del gancho (plantilla) o el cliente escribiendo solo "renovar".
export function renovacionEntradaFromMessage(type: string, buttonText: string | undefined, text: string): RenovacionEntrada | null {
  if (type === "button" && buttonText && compactar(buttonText) === GANCHO_COMPACTO) return "PLANTILLA";
  if (type === "text" && compactar(text) === "renovar") return "TEXTO";
  return null;
}
