// Flujo de renovación del piloto (stages RENOVACION:*): monto → plazo → cuota estimada → cita para mañana.
// Entra por el botón "Calcular mi próximo crédito" del gancho (directo a monto) o escribiendo "renovar" (pasa por la oferta).
// El perfil (límite, plazos, tasa) se relee de BD en cada mensaje; si algo no cuadra, pasa a asesor y no agenda.
import { buildCitaAgendadaText, buildCuotaText, buildMontoExcedeText, buildOfertaText, buildPedirMontoText, buildPlazoList,
  CITA_BOTONES, CITA_PREGUNTA_TEXT, MONTO_NO_ES_NUMERO_TEXT, NO_RENOVACION_TEXT, OFERTA_BOTONES, OTRO_DIA_TEXT,
  PROGRAMAR_BOTONES, RENOVACION_BOTONES, SALIDA_TEXT } from "../mappers/renovacionMensajes.mapper.js";
import { construirSolicitud, plazoDesdeOpcion, readRenovacionSlots, renovacionAutorizada,
  validarMonto } from "../mappers/renovacion.mapper.js";
import { findClienteConCredito, findClienteCreditoByWaId } from "../services/clienteCredito.service.js";
import { updateConversationState } from "../services/context.service.js";
import { guardarCitaRenovacion } from "../services/renovacionCita.service.js";
import { normalizeText } from "../services/router.service.js";
import type { RenovacionCitaStatus } from "../shared/renovacion.constants.js";
import type { RenovacionCliente, RenovacionEntrada, RenovacionFlowParams, RenovacionFlowResult,
  RenovacionSlots, RenovacionSolicitud } from "../types/renovacion.types.js";
import { fechaMananaMx } from "../utils/fecha.js";
import { sendButtonsAndLog, sendListAndLog, sendTextAndLog, type SendOpts } from "./_shared.js";
import { enterAsesor } from "./asesor.flow.js";

export const RENOVACION_STAGE_OFERTA = "RENOVACION:oferta";
export const RENOVACION_STAGE_MONTO = "RENOVACION:monto";
export const RENOVACION_STAGE_PLAZO = "RENOVACION:plazo";
export const RENOVACION_STAGE_PROGRAMAR = "RENOVACION:programar";
export const RENOVACION_STAGE_CITA = "RENOVACION:cita";

// Lo que cada paso necesita del mensaje actual y de la conversación.
type RenovacionContext = {
  waId: string;
  cliente: RenovacionCliente;
  slots: RenovacionSlots;
  baseSlots: Record<string, unknown>;
  text: string;
  interactiveBtnId: string | undefined;
  opts: SendOpts;
};

// Cambia de paso guardando monto/plazo en slots.renovacion sin pisar los demás slots de la conversación.
async function irAPaso(ctx: RenovacionContext, stage: string, renovacion: RenovacionSlots) {
  await updateConversationState(ctx.waId, { stage, lastIntent: "RENOVACION", slots: { ...ctx.baseSlots, renovacion } });
}

// Sale del flujo limpiando slots.renovacion; el siguiente mensaje del cliente lo atiende el bot normal.
async function salirDelFlujo(ctx: Pick<RenovacionContext, "waId" | "baseSlots">) {
  const { renovacion: _renovacion, ...restSlots } = ctx.baseSlots;
  await updateConversationState(ctx.waId, { stage: "start", lastIntent: "SALUDO", slots: restSlots });
}

// NO RENOVACIÓN (límite 0): se avisa y se cierra el flujo, sin oferta, sin monto y sin asesor.
async function cerrarSinRenovacion(ctx: Pick<RenovacionContext, "waId" | "baseSlots" | "opts">) {
  await salirDelFlujo(ctx);
  await sendTextAndLog(ctx.waId, NO_RENOVACION_TEXT, ctx.opts);
}

async function pedirMonto(ctx: RenovacionContext) {
  await irAPaso(ctx, RENOVACION_STAGE_MONTO, {});
  await sendTextAndLog(ctx.waId, buildPedirMontoText(ctx.cliente.limite), ctx.opts);
}

async function preguntarProgramar(ctx: RenovacionContext, solicitud: RenovacionSolicitud) {
  await sendButtonsAndLog(ctx.waId, buildCuotaText(solicitud), PROGRAMAR_BOTONES, ctx.opts);
}

// GUARDRAIL fallido: no se agenda nada con datos que el bot no ofreció; lo toma un humano.
async function pasarAAsesor(ctx: RenovacionContext) {
  await salirDelFlujo(ctx);
  await enterAsesor(ctx.waId, ctx.opts);
}

// Guarda la cita (o la solicitud de "otro día") con la solicitud ya revalidada y termina el flujo.
async function guardarCitaYSalir(ctx: RenovacionContext, solicitud: RenovacionSolicitud, status: RenovacionCitaStatus) {
  const { numeroCredito, tasaSemanal } = ctx.cliente;
  const fechaCita = status === "pendiente_confirmacion" ? fechaMananaMx(new Date()) : null;
  await guardarCitaRenovacion({ waId: ctx.waId, numeroCredito, tasaSemanal, ...solicitud, fechaCita, status });
  await salirDelFlujo(ctx);
  const reply = status === "pendiente_confirmacion" ? buildCitaAgendadaText(solicitud) : OTRO_DIA_TEXT;
  await sendTextAndLog(ctx.waId, reply, ctx.opts);
}

async function handleOferta(ctx: RenovacionContext) {
  if (ctx.interactiveBtnId === RENOVACION_BOTONES.CALCULAR.id) return pedirMonto(ctx);
  if (ctx.interactiveBtnId === RENOVACION_BOTONES.AHORITA_NO.id) {
    await salirDelFlujo(ctx);
    return sendTextAndLog(ctx.waId, SALIDA_TEXT, ctx.opts);
  }
  return sendButtonsAndLog(ctx.waId, buildOfertaText(ctx.cliente, undefined), OFERTA_BOTONES, ctx.opts);
}

async function handleMonto(ctx: RenovacionContext) {
  const validacion = validarMonto(ctx.text, ctx.cliente.limite);
  if (!validacion.ok) {
    const reply = validacion.motivo === "EXCEDE_LIMITE" ? buildMontoExcedeText(ctx.cliente.limite) : MONTO_NO_ES_NUMERO_TEXT;
    return sendTextAndLog(ctx.waId, reply, ctx.opts);
  }
  await irAPaso(ctx, RENOVACION_STAGE_PLAZO, { monto: validacion.monto });
  return sendListAndLog(ctx.waId, buildPlazoList(ctx.cliente, validacion.monto), ctx.opts);
}

async function handlePlazo(ctx: RenovacionContext) {
  const plazoSemanas = plazoDesdeOpcion(ctx.interactiveBtnId, ctx.cliente);
  const monto = ctx.slots.monto;
  if (monto === undefined) return pedirMonto(ctx);
  if (!plazoSemanas) return sendListAndLog(ctx.waId, buildPlazoList(ctx.cliente, monto), ctx.opts);

  const solicitud = construirSolicitud({ monto, plazoSemanas }, ctx.cliente);
  if (!solicitud) return pasarAAsesor(ctx);
  await irAPaso(ctx, RENOVACION_STAGE_PROGRAMAR, { monto, plazoSemanas });
  return preguntarProgramar(ctx, solicitud);
}

async function handleProgramar(ctx: RenovacionContext) {
  const solicitud = construirSolicitud(ctx.slots, ctx.cliente);
  if (!solicitud) return pasarAAsesor(ctx);
  if (ctx.interactiveBtnId === RENOVACION_BOTONES.LUEGO.id) {
    await salirDelFlujo(ctx);
    return sendTextAndLog(ctx.waId, SALIDA_TEXT, ctx.opts);
  }
  if (ctx.interactiveBtnId !== RENOVACION_BOTONES.PROGRAMAR.id) return preguntarProgramar(ctx, solicitud);

  await irAPaso(ctx, RENOVACION_STAGE_CITA, ctx.slots);
  return sendButtonsAndLog(ctx.waId, CITA_PREGUNTA_TEXT, CITA_BOTONES, ctx.opts);
}

async function handleCita(ctx: RenovacionContext) {
  const solicitud = construirSolicitud(ctx.slots, ctx.cliente);
  if (!solicitud) return pasarAAsesor(ctx);
  if (ctx.interactiveBtnId === RENOVACION_BOTONES.AGENDAR.id) return guardarCitaYSalir(ctx, solicitud, "pendiente_confirmacion");
  if (ctx.interactiveBtnId === RENOVACION_BOTONES.OTRO_DIA.id) return guardarCitaYSalir(ctx, solicitud, "pendiente_fecha");
  return sendButtonsAndLog(ctx.waId, CITA_PREGUNTA_TEXT, CITA_BOTONES, ctx.opts);
}

const HANDLERS_POR_STAGE: Record<string, (ctx: RenovacionContext) => Promise<void>> = {
  [RENOVACION_STAGE_OFERTA]: handleOferta,
  [RENOVACION_STAGE_MONTO]: handleMonto,
  [RENOVACION_STAGE_PLAZO]: handlePlazo,
  [RENOVACION_STAGE_PROGRAMAR]: handleProgramar,
  [RENOVACION_STAGE_CITA]: handleCita
};

// Entrada al flujo. Sin perfil en el piloto no hay límite ni plazos que ofrecer → lo atiende un asesor.
export async function enterRenovacion(
  waId: string,
  params: { entrada: RenovacionEntrada; slots: Record<string, unknown> | undefined; senderPhoneNumberId?: string | undefined }
) {
  const opts: SendOpts = { senderPhoneNumberId: params.senderPhoneNumberId };
  const { cliente, credit } = await findClienteConCredito(waId);
  if (!cliente) return enterAsesor(waId, opts);

  const ctx: RenovacionContext = { waId, cliente, slots: {}, baseSlots: params.slots ?? {}, text: "", interactiveBtnId: undefined, opts };
  if (!renovacionAutorizada(cliente)) return cerrarSinRenovacion(ctx);
  // Quien tocó el gancho ya vio racha, nivel y límite en la plantilla: se salta la oferta.
  if (params.entrada === "PLANTILLA") return pedirMonto(ctx);

  await irAPaso(ctx, RENOVACION_STAGE_OFERTA, {});
  return sendButtonsAndLog(waId, buildOfertaText(cliente, credit?.nombre), OFERTA_BOTONES, opts);
}

// Máquina de estados RENOVACION:*. "menu"/"0"/"regresar" por texto lo saca en cualquier paso.
export async function handleRenovacionFlow(params: RenovacionFlowParams): Promise<RenovacionFlowResult> {
  const handler = HANDLERS_POR_STAGE[params.stage];
  if (!handler) return { handled: false };

  const textoNormalizado = normalizeText(params.text);
  if (params.type !== "interactive" && ["menu", "0", "regresar"].includes(textoNormalizado)) {
    return { handled: true, goToMainMenu: true };
  }

  const opts: SendOpts = { senderPhoneNumberId: params.senderPhoneNumberId };
  const baseSlots = params.slots ?? {};
  const cliente = await findClienteCreditoByWaId(params.waId);
  if (!cliente) {
    await salirDelFlujo({ waId: params.waId, baseSlots });
    await enterAsesor(params.waId, opts);
    return { handled: true };
  }
  // El límite pudo pasar a 0 (CSV nuevo) mientras el cliente iba a medio flujo.
  if (!renovacionAutorizada(cliente)) {
    await cerrarSinRenovacion({ waId: params.waId, baseSlots, opts });
    return { handled: true };
  }

  const slots = readRenovacionSlots(params.slots);
  await handler({ waId: params.waId, cliente, slots, baseSlots, text: params.text, interactiveBtnId: params.interactiveBtnId, opts });
  return { handled: true };
}
