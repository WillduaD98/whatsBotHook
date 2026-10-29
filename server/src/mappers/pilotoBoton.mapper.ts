// Reconoce qué hizo el cliente del piloto: qué botón tocó, si pidió renovar por texto o si su foto/PDF es
// un comprobante de pago (puro, sin BD).
import {
  PILOTO_GANCHO_BOTON,
  PILOTO_MANDAR_COMPROBANTE_BOTON,
  PILOTO_PAGO_BOTONES,
  type PilotoPagoBoton
} from "../shared/pilotoTemplates.constants.js";
import type { ComprobanteAutomaticoInput } from "../types/piloto.types.js";
import type { RenovacionEntrada } from "../types/renovacion.types.js";
import { normalizeText } from "../services/router.service.js";

// Sin acentos, emojis, mayúsculas ni espacios: "Ya pagué ✅" y "ya pague" quedan iguales.
function compactar(texto: string): string {
  return normalizeText(texto).replace(/\s+/g, "");
}

const BOTON_POR_TEXTO = new Map<string, PilotoPagoBoton>(
  (Object.keys(PILOTO_PAGO_BOTONES) as PilotoPagoBoton[]).map((boton) => [compactar(PILOTO_PAGO_BOTONES[boton]), boton])
);

// Botones de plantilla (type "button") se reconocen por su texto. Del bot solo cuenta "🧾 Mandar comprobante"
// (type "interactive", por su id), que equivale a "Ya pagué".
export function pilotoPagoBotonFromMessage(
  type: string,
  buttonText: string | undefined,
  interactiveBtnId?: string | undefined
): PilotoPagoBoton | null {
  if (type === "interactive") return interactiveBtnId === PILOTO_MANDAR_COMPROBANTE_BOTON.id ? "YA_PAGUE" : null;
  if (type !== "button" || !buttonText) return null;
  return BOTON_POR_TEXTO.get(compactar(buttonText)) ?? null;
}

// Una foto o PDF se toma como comprobante en automático, salvo en dos casos donde ya significa otra cosa:
// en pre-solicitud son documentos de la solicitud, y con un comprobante en revisión se respeta el flujo actual
// ("sigue en revisión" + botón para reenviar) para no duplicar comprobantes.
export function esComprobanteAutomatico(params: ComprobanteAutomaticoInput): boolean {
  const esMedia = (params.type === "image" || params.type === "document") && Boolean(params.mediaUrl);
  return esMedia && !params.stage.startsWith("PRE_SOLICITUD") && params.stage !== params.stageComprobantePendiente;
}

const GANCHO_COMPACTO = compactar(PILOTO_GANCHO_BOTON);

// Entrada al flujo de renovación: botón del gancho (plantilla) o el cliente escribiendo solo "renovar".
export function renovacionEntradaFromMessage(type: string, buttonText: string | undefined, text: string): RenovacionEntrada | null {
  if (type === "button" && buttonText && compactar(buttonText) === GANCHO_COMPACTO) return "PLANTILLA";
  if (type === "text" && compactar(text) === "renovar") return "TEXTO";
  return null;
}
