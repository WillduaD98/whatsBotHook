// Flujo de "cliente": menú y máquina de estados para quienes ya tienen un crédito con nosotros.
// Sin opción de asesor. Invocado desde webhookController para cualquier stage "CLIENTE:*".
import { env } from "../config/env.js";
import { sendButtons, sendText } from "../services/whatsapp.service.js";
import { saveOutgoingMessage, updateConversationState } from "../services/context.service.js";
import { normalizeText } from "../services/router.service.js";
import { findCreditByNumber } from "../services/credit.service.js";
import { createPaymentProof } from "../services/paymentProof.service.js";
// Modelo usado directamente (decisión del usuario) para marcar un comprobante como regresado por el cliente
import { PaymentProof } from "../models/PaymentProof.js";

export const CLIENTE_STAGE_MENU = "CLIENTE:menu";
export const CLIENTE_STAGE_ESPERA_NUM_CREDITO = "CLIENTE:espera_num_credito";
export const CLIENTE_STAGE_CONFIRMA_NOMBRE = "CLIENTE:confirma_nombre";
export const CLIENTE_STAGE_ESPERA_COMPROBANTE = "CLIENTE:espera_comprobante";
// Comprobante recibido y en revisión: la conversación se queda aquí hasta que un asesor lo revise
// o el cliente pida reenviarlo
export const CLIENTE_STAGE_COMPROBANTE_PENDIENTE = "CLIENTE:comprobante_pendiente";

export const CLIENTE_MENU_BODY_TEXT = "👤 *Menú de cliente*\n\n¿Qué necesitas?";

export const CLIENTE_MENU_BUTTONS: Array<{ id: string; title: string }> = [
  { id: "CLIENTE_DATOS_PAGO", title: "💳 Datos para pagar" },
  { id: "CLIENTE_COMPROBANTE", title: "🧾 Ya pagué" },
  { id: "CLIENTE_MENU_PRINCIPAL", title: "↩️ Menú principal" }
];

const ASK_NUMERO_CREDITO_TEXT = "Escribe tu número de crédito";

const ASK_COMPROBANTE_TEXT = "Envíame la foto o el PDF de tu comprobante de pago.";

const COMPROBANTE_RECIBIDO_TEXT = "✅ Recibimos tu comprobante. En breve lo validaremos.";

const COMPROBANTE_EN_REVISION_TEXT = "⏳ Tu comprobante sigue en revisión. En breve lo validaremos.";

// Botón para descartar el comprobante en revisión y volver a empezar.
// WhatsApp limita el título de un botón a 20 caracteres; "Reenviar comprobante" tiene justo 20.
const REENVIAR_COMPROBANTE_BUTTON = { id: "CLIENTE_REENVIAR_COMPROBANTE", title: "Reenviar comprobante" };

const PAGO_MICRO_INSTRUCCION =
  "📋 Copia la CLABE y la referencia para tu transferencia. Con estas tu puedes realizar tu transferencia.";

// A partir de este número de intentos fallidos (número no encontrado o nombre rechazado) se sugiere contactar por teléfono.
const MAX_ATTEMPTS_BEFORE_CONTACT = 2;

type SendOpts = { senderPhoneNumberId?: string | undefined };

// Para qué se está verificando el número de crédito: "Datos para pagar" o "Ya pagué".
// Las dos opciones comparten la verificación y se separan al confirmar el nombre.
type ClientePurpose = "datos_pago" | "comprobante";

type ClienteSlots = {
  attempts?: number;
  numeroCredito?: string;
  nombre?: string;
  purpose?: ClientePurpose;
};

export type ClienteFlowResult = { handled: boolean; goToMainMenu?: boolean };

function formatInteractiveForLog(body: string, buttons: Array<{ id: string; title: string }>): string {
  return `${body}\n\nOpciones: ${buttons.map((b) => b.title).join(" | ")}`;
}

// Escapes válidos desde cualquier stage CLIENTE:* para volver al menú principal (solo por texto, no botón)
function isMenuEscapeText(text: string): boolean {
  const t = normalizeText(text);
  return t === "menu" || t === "0" || t === "regresar";
}

// Formato del nombre mostrado al confirmar identidad. Configurable: por defecto es "primer nombre + inicial".
export function formatClienteDisplayName(nombreCompleto: string): string {
  const parts = String(nombreCompleto || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const [first, second] = parts;
  return second ? `${first} ${second.charAt(0).toUpperCase()}.` : first;
}

function contactoSuffix(): string {
  const tel = String(env.CONTACTO_TEL || "").trim();
  return tel ? ` o comunícate al ${tel}` : "";
}

function buildNotFoundMessage(attempts: number): string {
  const suffix = attempts >= MAX_ATTEMPTS_BEFORE_CONTACT ? contactoSuffix() : "";
  return `No encontramos ese número, verifícalo${suffix}.`;
}

function buildMismatchMessage(attempts: number): string {
  const suffix = attempts >= MAX_ATTEMPTS_BEFORE_CONTACT ? contactoSuffix() : "";
  return `Ese número no corresponde, verifícalo${suffix}.`;
}

function buildClabeMessage(clabe: string): string {
  return `Cuenta CLABE a depositar: ${clabe}`;
}

function buildReferenciaMessage(referencia: string): string {
  return `Número de referencia (concepto): ${referencia}`;
}

export async function sendClienteMenu(to: string, opts?: SendOpts) {
  try {
    return await sendButtons(to, CLIENTE_MENU_BODY_TEXT, CLIENTE_MENU_BUTTONS, opts);
  } catch (error: any) {
    console.error("[cliente.flow] sendClienteMenu error:", error?.response?.data || error);
    throw error;
  }
}

async function sendClienteMenuAndLog(waId: string, opts?: SendOpts) {
  const apiRes = await sendClienteMenu(waId, opts);
  const outId = apiRes?.messages?.[0]?.id;
  await saveOutgoingMessage({
    waId,
    text: formatInteractiveForLog(CLIENTE_MENU_BODY_TEXT, CLIENTE_MENU_BUTTONS),
    messageId: outId,
    type: "interactive"
  });
}

// Entra al menú de cliente: fija stage "CLIENTE:menu" y envía el menú. Punto de entrada (botón "Soy cliente" o texto "cliente").
export async function enterClienteMenu(waId: string, opts?: SendOpts) {
  await updateConversationState(waId, { stage: CLIENTE_STAGE_MENU, lastIntent: "CLIENTE" });
  await sendClienteMenuAndLog(waId, opts);
}

async function askNumeroCredito(waId: string, opts?: SendOpts) {
  await sendText(waId, ASK_NUMERO_CREDITO_TEXT, opts);
  await saveOutgoingMessage({ waId, text: ASK_NUMERO_CREDITO_TEXT });
}

// purpose se guarda en slots.cliente para saber, al confirmar el nombre, si hay que mandar
// los datos de pago o pedir el comprobante
async function enterEsperaNumeroCredito(waId: string, baseSlots: any, purpose: ClientePurpose, opts?: SendOpts) {
  await updateConversationState(waId, {
    stage: CLIENTE_STAGE_ESPERA_NUM_CREDITO,
    slots: { ...baseSlots, cliente: { attempts: 0, purpose } }
  });
  await askNumeroCredito(waId, opts);
}

async function askComprobante(waId: string, opts?: SendOpts) {
  await sendText(waId, ASK_COMPROBANTE_TEXT, opts);
  await saveOutgoingMessage({ waId, text: ASK_COMPROBANTE_TEXT });
}

// Conserva los slots existentes (p.ej. numeroCredito ya confirmado) al entrar a esperar el comprobante.
async function enterEsperaComprobante(waId: string, opts?: SendOpts) {
  await updateConversationState(waId, { stage: CLIENTE_STAGE_ESPERA_COMPROBANTE });
  await askComprobante(waId, opts);
}

async function sendConfirmaNombreButtons(waId: string, display: string, opts?: SendOpts) {
  const body = `¿Tu nombre es ${display}?`;
  const buttons = [
    { id: "CLIENTE_NOMBRE_SI", title: "Sí" },
    { id: "CLIENTE_NOMBRE_NO", title: "No" }
  ];
  const apiRes = await sendButtons(waId, body, buttons, opts);
  const outId = apiRes?.messages?.[0]?.id;
  await saveOutgoingMessage({
    waId,
    text: formatInteractiveForLog(body, buttons),
    messageId: outId,
    type: "interactive"
  });
}

// Manda un mensaje con el botón "Reenviar comprobante" y lo guarda en el historial de la conversación
async function sendReenviarComprobanteButton(waId: string, body: string, opts?: SendOpts) {
  const buttons = [REENVIAR_COMPROBANTE_BUTTON];
  const apiRes = await sendButtons(waId, body, buttons, opts);
  const outId = apiRes?.messages?.[0]?.id;
  await saveOutgoingMessage({
    waId,
    text: formatInteractiveForLog(body, buttons),
    messageId: outId,
    type: "interactive"
  });
}

// Máquina de estados de CLIENTE:*. Devuelve { handled: false } si el stage no pertenece a este flujo.
export async function handleClienteFlow(params: {
  waId: string;
  stage: string;
  type: string;
  text: string;
  interactiveBtnId?: string | undefined;
  slots: any;
  senderPhoneNumberId?: string | undefined;
  mediaUrl?: string | undefined;
  mimeType?: string | undefined;
}): Promise<ClienteFlowResult> {
  const { waId, stage, type, text, interactiveBtnId, mediaUrl, mimeType } = params;
  const opts: SendOpts = { senderPhoneNumberId: params.senderPhoneNumberId };
  const baseSlots = params.slots && typeof params.slots === "object" ? params.slots : {};
  const clienteSlots: ClienteSlots =
    baseSlots.cliente && typeof baseSlots.cliente === "object" ? baseSlots.cliente : {};

  // Escapes "menú"/"0"/"regresar" (solo texto, no botón) válidos en cualquier stage CLIENTE:*
  if (type !== "interactive" && isMenuEscapeText(text)) {
    return { handled: true, goToMainMenu: true };
  }

  if (stage === CLIENTE_STAGE_MENU) {
    if (interactiveBtnId === "CLIENTE_MENU_PRINCIPAL") {
      return { handled: true, goToMainMenu: true };
    }
    if (interactiveBtnId === "CLIENTE_DATOS_PAGO") {
      await enterEsperaNumeroCredito(waId, baseSlots, "datos_pago", opts);
      return { handled: true };
    }
    // "Ya pagué" primero verifica número y nombre (igual que "Datos para pagar") y después pide el comprobante
    if (interactiveBtnId === "CLIENTE_COMPROBANTE") {
      await enterEsperaNumeroCredito(waId, baseSlots, "comprobante", opts);
      return { handled: true };
    }
    await sendClienteMenuAndLog(waId, opts);
    return { handled: true };
  }

  if (stage === CLIENTE_STAGE_ESPERA_NUM_CREDITO) {
    const numero = String(text || "").trim();
    if (!numero) {
      await askNumeroCredito(waId, opts);
      return { handled: true };
    }

    const credit = await findCreditByNumber(numero);
    if (!credit) {
      const attempts = Number(clienteSlots.attempts || 0) + 1;
      // Se conserva purpose para no perder a qué opción entró el cliente ("Datos para pagar" o "Ya pagué")
      await updateConversationState(waId, { slots: { ...baseSlots, cliente: { attempts, purpose: clienteSlots.purpose } } });
      const reply = buildNotFoundMessage(attempts);
      await sendText(waId, reply, opts);
      await saveOutgoingMessage({ waId, text: reply });
      return { handled: true };
    }

    const display = formatClienteDisplayName(credit.nombre);
    await updateConversationState(waId, {
      stage: CLIENTE_STAGE_CONFIRMA_NOMBRE,
      slots: {
        ...baseSlots,
        cliente: {
          attempts: clienteSlots.attempts || 0,
          numeroCredito: credit.numeroCredito,
          nombre: credit.nombre,
          purpose: clienteSlots.purpose
        }
      }
    });
    await sendConfirmaNombreButtons(waId, display, opts);
    return { handled: true };
  }

  if (stage === CLIENTE_STAGE_CONFIRMA_NOMBRE) {
    if (interactiveBtnId === "CLIENTE_NOMBRE_SI") {
      const numeroCredito = String(clienteSlots.numeroCredito || "");
      const credit = numeroCredito ? await findCreditByNumber(numeroCredito) : null;

      if (!credit) {
        // Caso borde: el crédito fue desactivado/eliminado entre la búsqueda y la confirmación
        await updateConversationState(waId, {
          stage: CLIENTE_STAGE_ESPERA_NUM_CREDITO,
          slots: { ...baseSlots, cliente: { attempts: 0, purpose: clienteSlots.purpose } }
        });
        const reply = buildNotFoundMessage(0);
        await sendText(waId, reply, opts);
        await saveOutgoingMessage({ waId, text: reply });
        return { handled: true };
      }

      // Aquí el cliente ya confirmó su número de crédito (existe y sigue activo) y su nombre, así que se
      // marca como verificado. Se hace antes de separar "Datos para pagar" y "Ya pagué" para que quede
      // marcado en los dos caminos, y antes de mandar cualquier mensaje por si el envío falla.
      // Es permanente: salir al menú o la revisión del asesor no lo borran (se muestra en el panel).
      await updateConversationState(waId, { clienteVerificado: true });

      // Las conversaciones que ya iban a medio flujo antes de este cambio no traen purpose:
      // se tratan como "datos_pago", que era el único camino que existía.
      const purpose: ClientePurpose = clienteSlots.purpose ?? "datos_pago";
      if (purpose === "comprobante") {
        // Número y nombre verificados: ahora sí se pide el comprobante. slots.cliente se conserva
        // (enterEsperaComprobante solo cambia el stage) para guardar el numeroCredito en el PaymentProof.
        await enterEsperaComprobante(waId, opts);
        return { handled: true };
      }

      // CLABE y referencia en mensajes separados para que se puedan copiar fácilmente
      const clabeMessage = buildClabeMessage(credit.clabe);
      await sendText(waId, clabeMessage, opts);
      await saveOutgoingMessage({ waId, text: clabeMessage });
      const referenciaMessage = buildReferenciaMessage(credit.referencia);
      await sendText(waId, referenciaMessage, opts);
      await saveOutgoingMessage({ waId, text: referenciaMessage });
      await sendText(waId, PAGO_MICRO_INSTRUCCION, opts);
      await saveOutgoingMessage({ waId, text: PAGO_MICRO_INSTRUCCION });

      const { cliente: _cliente, ...restSlots } = baseSlots;
      await updateConversationState(waId, { stage: "start", lastIntent: "SALUDO", slots: restSlots });
      return { handled: true };
    }

    if (interactiveBtnId === "CLIENTE_NOMBRE_NO") {
      const attempts = Number(clienteSlots.attempts || 0) + 1;
      await updateConversationState(waId, {
        stage: CLIENTE_STAGE_ESPERA_NUM_CREDITO,
        slots: { ...baseSlots, cliente: { attempts, purpose: clienteSlots.purpose } }
      });
      const reply = buildMismatchMessage(attempts);
      await sendText(waId, reply, opts);
      await saveOutgoingMessage({ waId, text: reply });
      await askNumeroCredito(waId, opts);
      return { handled: true };
    }

    const display = formatClienteDisplayName(clienteSlots.nombre || "");
    await sendConfirmaNombreButtons(waId, display, opts);
    return { handled: true };
  }

  if (stage === CLIENTE_STAGE_ESPERA_COMPROBANTE) {
    const isMedia = (type === "image" || type === "document") && Boolean(mediaUrl);
    if (!isMedia) {
      await askComprobante(waId, opts);
      return { handled: true };
    }

    await createPaymentProof({
      waId,
      numeroCredito: clienteSlots.numeroCredito,
      mediaUrl: mediaUrl as string,
      mimeType
    });

    // Ya no vuelve a "start": la conversación se queda esperando a que un asesor revise el comprobante
    // o a que el cliente pida reenviarlo. El stage se cambia antes de mandar el mensaje para que, si el
    // envío falla y el mensaje se reintenta, no se cree un segundo comprobante con la misma foto.
    await updateConversationState(waId, { stage: CLIENTE_STAGE_COMPROBANTE_PENDIENTE });
    await sendReenviarComprobanteButton(waId, COMPROBANTE_RECIBIDO_TEXT, opts);
    return { handled: true };
  }

  if (stage === CLIENTE_STAGE_COMPROBANTE_PENDIENTE) {
    if (interactiveBtnId === REENVIAR_COMPROBANTE_BUTTON.id) {
      // El cliente quiere mandar otro comprobante: el que estaba en revisión (el más reciente en
      // 'pendiente' de este WhatsApp) se marca 'regresado_por_cliente' para que el asesor ya no lo revise.
      // findOneAndUpdate busca y actualiza en una sola operación.
      await PaymentProof.findOneAndUpdate(
        { waId, status: "pendiente" },
        { $set: { status: "regresado_por_cliente" } },
        { sort: { createdAt: -1 } }
      );
      // Mismo patrón que otras salidas del flujo: el controller manda el menú principal y limpia stage y slots
      return { handled: true, goToMainMenu: true };
    }

    // Cualquier otro mensaje (texto, otra foto...): no avanza, solo recuerda que sigue en revisión
    await sendReenviarComprobanteButton(waId, COMPROBANTE_EN_REVISION_TEXT, opts);
    return { handled: true };
  }

  return { handled: false };
}
