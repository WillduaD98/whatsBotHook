// Textos, botones y lista que el bot manda en cada paso del flujo de renovación (puro, sin envío).
// Tono "de calle" del spec (PILOTO_DROGA_DEL_PAGO.md §1 y §3). Títulos de botón ≤ 20 caracteres (límite de Meta).
import type { PlazoSemanas } from "../shared/clienteCredito.constants.js";
import type { RenovacionCliente, RenovacionSolicitud } from "../types/renovacion.types.js";
import type { WhatsAppListInput } from "../types/whatsapp.types.js";
import { formatPesos } from "../utils/money.js";
import { calcularCuota } from "./cuota.mapper.js";
import { PLAZO_OPCION_PREFIX, plazosDelCliente } from "./renovacion.mapper.js";

export type RenovacionBoton = { id: string; title: string };

export const RENOVACION_BOTONES = {
  CALCULAR: { id: "RENOV_CALCULAR", title: "Calcular 🧮" },
  AHORITA_NO: { id: "RENOV_AHORITA_NO", title: "Ahorita no" },
  PROGRAMAR: { id: "RENOV_PROGRAMAR", title: "Sí, programar ✅" },
  LUEGO: { id: "RENOV_LUEGO", title: "Luego" },
  AGENDAR: { id: "RENOV_AGENDAR", title: "Sí, agéndala 📅" },
  OTRO_DIA: { id: "RENOV_OTRO_DIA", title: "Otro día" }
} as const satisfies Record<string, RenovacionBoton>;

export const OFERTA_BOTONES: RenovacionBoton[] = [RENOVACION_BOTONES.CALCULAR, RENOVACION_BOTONES.AHORITA_NO];
export const PROGRAMAR_BOTONES: RenovacionBoton[] = [RENOVACION_BOTONES.PROGRAMAR, RENOVACION_BOTONES.LUEGO];
export const CITA_BOTONES: RenovacionBoton[] = [RENOVACION_BOTONES.AGENDAR, RENOVACION_BOTONES.OTRO_DIA];

const GANCHO_NIVEL =
  "🔥 ¡Continúa creciendo tu racha! Con 2 créditos más con buenas rachas 🔥 subes al siguiente nivel y puedes desbloquear mejores opciones.";

export const SALIDA_TEXT = "Va, cuando quieras escribe *renovar* y lo retomamos 👌";

export const OTRO_DIA_TEXT =
  "Va 👌 Un asesor te va a contactar para agendar tu renovación otro día. Cuando quieras, también puedes escribir *renovar*.";

// Flujo de NO RENOVACIÓN (límite 0): sin oferta ni monto; se cierra el flujo sin pasar a asesor.
export const NO_RENOVACION_TEXT =
  "Debido a tu historial crediticio, no tienes opciones de renovación prontas. Vuelve a intentarlo un tiempo después.";

export const MONTO_NO_ES_NUMERO_TEXT = "Escríbeme solo el número, por ejemplo *8000*.";

export const CITA_PREGUNTA_TEXT =
  "Si hoy completas tu pago, mañana te agendamos la visita 📅\n¿Agendamos tu cita de renovación para mañana?";

// "4, 8 y 12 semanas".
function listarPlazos(plazos: PlazoSemanas[]): string {
  if (plazos.length <= 1) return `${plazos.join("")} semanas`;
  return `${plazos.slice(0, -1).join(", ")} y ${plazos[plazos.length - 1]} semanas`;
}

// Solo para quien entra escribiendo "renovar": no vio la plantilla, así que se le resume racha, nivel, límite y plazos.
export function buildOfertaText(cliente: RenovacionCliente, nombre: string | undefined): string {
  const saludo = nombre ? `🎉 ${nombre}, mira lo que has logrado:` : "🎉 Mira lo que has logrado:";
  return (
    `${saludo}\n\n` +
    `🔥 Racha: *${cliente.racha} pagos* en tiempo y forma\n` +
    `🏅 *Nivel ${cliente.nivel}* con TandaYa\n\n` +
    `Si llegas a 3 créditos bien pagados, al tercero subes de nivel y se te abren mejores opciones 🚀\n\n` +
    `💰 Tu límite: *${formatPesos(cliente.limite)}*\n` +
    `📆 Plazos: ${listarPlazos(plazosDelCliente(cliente))}\n\n` +
    `¿Calculamos tus cuotas?`
  );
}

export function buildPedirMontoText(limite: number): string {
  return `💰 ¿De cuánto te gustaría tu siguiente impulso?\nTu límite es *${formatPesos(limite)}*. Escríbeme el monto, por ejemplo *8000*.`;
}

export function buildMontoExcedeText(limite: number): string {
  return `Tu límite es *${formatPesos(limite)}*, dame uno igual o menor 🙏`;
}

// Lista con SOLO los plazos del cliente; cada opción trae su cuota estimada para que compare antes de elegir.
export function buildPlazoList(cliente: RenovacionCliente, monto: number): WhatsAppListInput {
  return {
    bodyText: `📆 Con *${formatPesos(monto)}*, ¿en cuántas semanas lo quieres pagar?`,
    buttonText: "Ver plazos",
    rows: plazosDelCliente(cliente).map((plazoSemanas) => ({
      id: `${PLAZO_OPCION_PREFIX}${plazoSemanas}`,
      title: `${plazoSemanas} semanas`,
      description: `~${formatPesos(calcularCuota({ monto, plazoSemanas, tasaSemanal: cliente.tasaSemanal }))}/semana`
    }))
  };
}

// Monto, plazo y cuota, un dato por línea para que se lea de un vistazo en WhatsApp.
function buildResumenSolicitud(solicitud: RenovacionSolicitud): string {
  return (
    `💰 Monto: *${formatPesos(solicitud.monto)}*\n` +
    `📆 Plazo: *${solicitud.plazoSemanas} semanas*\n` +
    `💵 Tu tanda: *~${formatPesos(solicitud.cuotaSemanal)}/semana*`
  );
}

export function buildCuotaText(solicitud: RenovacionSolicitud): string {
  return (
    `🧮 *Tu cálculo (estimado)*\n\n` +
    `${buildResumenSolicitud(solicitud)}\n\n` +
    `${GANCHO_NIVEL}\n\n` +
    `¿Quieres programar tu renovación?`
  );
}

export function buildCitaAgendadaText(solicitud: RenovacionSolicitud): string {
  return (
    `¡Listo! 🙌 En unos momentos un asesor confirmará tu cita de mañana con:\n\n` +
    `${buildResumenSolicitud(solicitud)}\n\n` +
    `Recuerda completar tu pago de hoy 💪\n` +
    `Si ya hiciste tu pago, haz caso omiso.`
  );
}
