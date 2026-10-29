// Arma las plantillas del piloto (parámetros en el orden de Meta + vista previa para el panel) a partir
// de los datos del cliente en BD y lo que captura el operador. Puro: sin BD ni HTTP.
// ⚠️ El orden de bodyParams y los textos deben coincidir con lo dado de alta en Meta (PILOTO_DROGA_DEL_PAGO.md §2).
import { PilotoError } from "../errors/PilotoErrores.js";
import { PILOTO_TEMPLATES, type PilotoTemplateName } from "../shared/pilotoTemplates.constants.js";
import type { PilotoClienteDatos, PilotoTemplateArmada, PilotoTemplateInput } from "../types/piloto.types.js";
import { formatMiles, formatPesos, parseMonto } from "../utils/money.js";

// Valida el nombre de plantilla que manda el panel.
export function parsePilotoTemplateName(raw: string): PilotoTemplateName {
  const plantilla = PILOTO_TEMPLATES.find((name) => name === raw.trim());
  if (!plantilla) throw new PilotoError("PLANTILLA_INVALIDA");
  return plantilla;
}

// Monto ("$750") y fecha de vencimiento, obligatorios en las dos plantillas de pago.
function requireMontoYFecha(input: PilotoTemplateInput): { monto: string; fecha: string } {
  const monto = parseMonto(input.monto);
  if (monto === null || monto <= 0) throw new PilotoError("MONTO_INVALIDO");
  const fecha = (input.fecha ?? "").trim();
  if (!fecha) throw new PilotoError("FALTA_FECHA");
  return { monto: formatPesos(monto), fecha };
}

// Día −1. Body: {{1}} nombre · {{2}} monto · {{3}} fecha · {{4}} racha (aparece 2 veces, se manda 1).
function armarStreakAlert(datos: PilotoClienteDatos, input: PilotoTemplateInput): PilotoTemplateArmada {
  const { monto, fecha } = requireMontoYFecha(input);
  const racha = String(datos.racha);
  return {
    bodyParams: [datos.nombre, monto, fecha, racha],
    preview:
      `*Mañana toca tu pago*\n\n` +
      `Hola ${datos.nombre}, mañana toca tu pago de *${monto}* (vence *${fecha}*).\n\n` +
      `🔥 Tu racha: ${racha}\n\n` +
      `¡Llevas una racha de *${racha} pagos en tiempo y forma*! 🔥 Así es como subes de nivel con TandaYa. No la sueltes 💪`
  };
}

// Día 0. Body: {{1}} nombre · {{2}} monto · {{3}} fecha · {{4}} racha (aparece 2 veces, se manda 1).
function armarDueDateAction(datos: PilotoClienteDatos, input: PilotoTemplateInput): PilotoTemplateArmada {
  const { monto, fecha } = requireMontoYFecha(input);
  const racha = String(datos.racha);
  return {
    bodyParams: [datos.nombre, monto, fecha, racha],
    preview:
      `*¡No rompas tu racha de pago!*\n\n` +
      `Hola ${datos.nombre}, hoy toca tu pago 💪\n\n` +
      `Monto del pago: ${monto}\n` +
      `Vence: ${fecha}\n\n` +
      `🔥 Tu racha: ${racha}\n\n` +
      `¡Llevas una racha de ${racha} pagos en tiempo y forma! 🔥 Así es como subes de nivel con TandaYa. ¡Sigue así!`
  };
}

// Gancho de renovación. Body: {{1}} nombre · {{2}} racha · {{3}} nivel · {{4}} límite sin "$" (el "$" está en el texto).
// Con límite 0 no hay impulso que ofrecer: mandarle el gancho sería prometerle un crédito que no tiene.
function armarProxCreditoGancho(datos: PilotoClienteDatos): PilotoTemplateArmada {
  if (datos.limite <= 0) throw new PilotoError("RENOVACION_NO_AUTORIZADA");
  const racha = String(datos.racha);
  const nivel = String(datos.nivel);
  const limite = formatMiles(datos.limite);
  return {
    bodyParams: [datos.nombre, racha, nivel, limite],
    preview:
      `🔥 ${datos.nombre}, *¡Tu siguiente impulso te espera!*\n\n` +
      `🔥 Por tu racha de *${racha} pagos* en tiempo y forma, obtuviste el *Nivel ${nivel}* con TandaYa y tu cofre digital está casi lleno. 🚀\n\n` +
      `Si renuevas y llegas a *3 créditos seguidos bien pagados*, al tercero *subes* de nivel por tu buen comportamiento y te pueden abrir *mejores condiciones*.\n\n` +
      `💰 Tu nuevo límite disponible: *$${limite}.*\n` +
      `¿Listo para cargar tu siguiente Tanda?`
  };
}

// Despacha a la plantilla elegida; lanza PilotoError si falta lo que captura el operador.
export function armarPlantillaPiloto(datos: PilotoClienteDatos, input: PilotoTemplateInput): PilotoTemplateArmada {
  switch (input.plantilla) {
    case "streak_alert":
      return armarStreakAlert(datos, input);
    case "due_date_action":
      return armarDueDateAction(datos, input);
    case "prox_credito_gancho":
      return armarProxCreditoGancho(datos);
  }
}
