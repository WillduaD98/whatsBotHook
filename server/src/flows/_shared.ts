// Envío + registro en el historial del chat, compartido por los flujos nuevos (para no repetir el par
// "sendX + saveOutgoingMessage" en cada paso). Los flujos viejos conservan sus propias copias.
import { saveOutgoingMessage } from "../services/context.service.js";
import { sendButtons, sendList, sendText } from "../services/whatsapp.service.js";
import type { WhatsAppListInput } from "../types/whatsapp.types.js";

export type SendOpts = { senderPhoneNumberId?: string | undefined };

export async function sendTextAndLog(waId: string, text: string, opts?: SendOpts) {
  const apiRes = await sendText(waId, text, opts);
  const messageId: string | undefined = apiRes?.messages?.[0]?.id;
  await saveOutgoingMessage({ waId, text, ...(messageId && { messageId }) });
}

// En el historial se guarda el texto con las opciones, igual que los demás mensajes interactivos del panel.
export async function sendButtonsAndLog(
  waId: string,
  body: string,
  buttons: Array<{ id: string; title: string }>,
  opts?: SendOpts
) {
  const apiRes = await sendButtons(waId, body, buttons, opts);
  const messageId: string | undefined = apiRes?.messages?.[0]?.id;
  const text = `${body}\n\nOpciones: ${buttons.map((b) => b.title).join(" | ")}`;
  await saveOutgoingMessage({ waId, text, type: "interactive", ...(messageId && { messageId }) });
}

export async function sendListAndLog(waId: string, list: WhatsAppListInput, opts?: SendOpts) {
  const apiRes = await sendList(waId, list, opts);
  const messageId = apiRes.messages?.[0]?.id;
  const text = `${list.bodyText}\n\nOpciones: ${list.rows.map((row) => row.title).join(" | ")}`;
  await saveOutgoingMessage({ waId, text, type: "interactive", ...(messageId && { messageId }) });
}
