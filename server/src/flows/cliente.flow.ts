// Flujo de "cliente": menú y máquina de estados para quienes ya tienen un crédito con nosotros.
// Sin opción de asesor. Invocado desde webhookController para cualquier stage "CLIENTE:*".
import { env } from "../config/env.js";
import { sendButtons, sendText } from "../services/whatsapp.service.js";
import { saveOutgoingMessage, updateConversationState } from "../services/context.service.js";
import { normalizeText } from "../services/router.service.js";
import { findCreditByNumber } from "../services/credit.service.js";
import { createPaymentProof } from "../services/paymentProof.service.js";

export const CLIENTE_STAGE_MENU = "CLIENTE:menu";
export const CLIENTE_STAGE_ESPERA_NUM_CREDITO = "CLIENTE:espera_num_credito";
export const CLIENTE_STAGE_CONFIRMA_NOMBRE = "CLIENTE:confirma_nombre";
export const CLIENTE_STAGE_ESPERA_COMPROBANTE = "CLIENTE:espera_comprobante";

export const CLIENTE_MENU_BODY_TEXT = "👤 *Menú de cliente*\n\n¿Qué necesitas?";

export const CLIENTE_MENU_BUTTONS: Array<{ id: string; title: string }> = [
  { id: "CLIENTE_DATOS_PAGO", title: "💳 Datos para pagar" },
  { id: "CLIENTE_COMPROBANTE", title: "🧾 Ya pagué" },
  { id: "CLIENTE_MENU_PRINCIPAL", title: "↩️ Menú principal" }
];

const ASK_NUMERO_CREDITO_TEXT = "Escribe tu número de crédito";

const ASK_COMPROBANTE_TEXT = "Envíame la foto o el PDF de tu comprobante de pago.";

const COMPROBANTE_RECIBIDO_TEXT = "✅ Recibimos tu comprobante. En breve lo validaremos.";

const PAGO_MICRO_INSTRUCCION =
  "📋 Copia la CLABE y la referencia para tu transferencia. Con estas tu puedes realizar tu transferencia.";

// A partir de este número de intentos fallidos (número no encontrado o nombre rechazado) se sugiere contactar por teléfono.
const MAX_ATTEMPTS_BEFORE_CONTACT = 2;

type SendOpts = { senderPhoneNumberId?: string | undefined };

type ClienteSlots = {
  attempts?: number;
  numeroCredito?: string;
  nombre?: string;
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

async function enterEsperaNumeroCredito(waId: string, baseSlots: any, opts?: SendOpts) {
  await updateConversationState(waId, {
    stage: CLIENTE_STAGE_ESPERA_NUM_CREDITO,
    slots: { ...baseSlots, cliente: { attempts: 0 } }
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
      await enterEsperaNumeroCredito(waId, baseSlots, opts);
      return { handled: true };
    }
    if (interactiveBtnId === "CLIENTE_COMPROBANTE") {
      await enterEsperaComprobante(waId, opts);
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
      await updateConversationState(waId, { slots: { ...baseSlots, cliente: { attempts } } });
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
        cliente: { attempts: clienteSlots.attempts || 0, numeroCredito: credit.numeroCredito, nombre: credit.nombre }
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
          slots: { ...baseSlots, cliente: { attempts: 0 } }
        });
        const reply = buildNotFoundMessage(0);
        await sendText(waId, reply, opts);
        await saveOutgoingMessage({ waId, text: reply });
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
        slots: { ...baseSlots, cliente: { attempts } }
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

    await sendText(waId, COMPROBANTE_RECIBIDO_TEXT, opts);
    await saveOutgoingMessage({ waId, text: COMPROBANTE_RECIBIDO_TEXT });

    const { cliente: _cliente, ...restSlots } = baseSlots;
    await updateConversationState(waId, { stage: "start", lastIntent: "SALUDO", slots: restSlots });
    return { handled: true };
  }

  return { handled: false };
}
