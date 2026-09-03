// Flujo de "consejo semanal": detecta la acción de recibir consejo y envía el consejo activo + imágenes por WhatsApp.
import { WeeklyTip } from "../models/WeeklyTip.js";
import { sendText, sendImage, uploadImageMedia } from "../services/whatsapp.service.js";
import { saveOutgoingMessage } from "../services/context.service.js";
import fs from "fs/promises";
import path from "path";
import { resolvePublicPath } from "../config/paths.js";

function normalizeActionKey(input: string): string {
  return String(input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function weeklyTipActionFromMessage(msg: any): "RECEIVE_WEEKLY_TIP" | null {
  const type = String(msg?.type || "").trim();

  if (type === "button") {
    const key = normalizeActionKey(msg?.button?.payload || msg?.button?.text || "");
    if (key.includes("recibir consejo")) return "RECEIVE_WEEKLY_TIP";
  }

  if (type === "interactive") {
    const reply = msg?.interactive?.button_reply || msg?.interactive?.list_reply;
    const key = normalizeActionKey(reply?.id || reply?.title || "");
    if (key.includes("recibir consejo")) return "RECEIVE_WEEKLY_TIP";
  }

  return null;
}

export async function sendActiveWeeklyTipImages(waId: string, inboundPhoneNumberId?: string) {
  const active = await WeeklyTip.findOne({ active: true }).lean();
  const images = Array.isArray((active as any)?.images) ? ((active as any).images as any[]) : [];
  const tipText = String((active as any)?.tipText || "").trim();

  if (!active || images.length === 0) {
    const msg = "Aún no hay un *consejo activo* disponible. Si lo necesitas, pídeselo a un asesor.";
    await sendText(waId, msg, { senderPhoneNumberId: inboundPhoneNumberId });
    await saveOutgoingMessage({
      waId,
      text: msg,
      type: "text",
      metadata: { weekly_tip_action: "RECEIVE_WEEKLY_TIP", weekly_tip_active: false }
    });
    return;
  }

  if (tipText) {
    await sendText(waId, tipText, { senderPhoneNumberId: inboundPhoneNumberId });
    await saveOutgoingMessage({
      waId,
      text: tipText,
      type: "text",
      metadata: { weekly_tip_action: "RECEIVE_WEEKLY_TIP", weekly_tip_id: String((active as any)?._id || "") }
    });
  }

  const closing = "Listo ✅ aquí van tus imágenes.";
  await sendText(waId, closing, { senderPhoneNumberId: inboundPhoneNumberId });
  await saveOutgoingMessage({
    waId,
    text: closing,
    type: "text",
    metadata: { weekly_tip_action: "RECEIVE_WEEKLY_TIP", weekly_tip_id: String((active as any)?._id || "") }
  });

  for (const img of images) {
    try {
      const mediaUrl = String(img?.mediaUrl || "");
      const rel = mediaUrl.replace(/^\/+/, "");
      if (!rel.startsWith("uploads/weekly-tip/")) continue;

      const fullPath = resolvePublicPath(rel);
      const buffer = await fs.readFile(fullPath);
      const filename = String(img?.filename || path.basename(rel) || "weekly-tip.jpg");
      const mimeType = String(img?.mimeType || "image/jpeg");

      const uploaded = await uploadImageMedia({ buffer, filename, mimeType }, { senderPhoneNumberId: inboundPhoneNumberId });
      if (!uploaded?.id) continue;

      const apiRes = await sendImage(waId, uploaded.id, { senderPhoneNumberId: inboundPhoneNumberId });
      const messageId = apiRes?.messages?.[0]?.id;
      await saveOutgoingMessage({
        waId,
        text: "",
        messageId,
        type: "image",
        mediaUrl,
        mimeType,
        metadata: {
          weekly_tip_action: "RECEIVE_WEEKLY_TIP",
          weekly_tip_id: String((active as any)?._id || ""),
          source_media_url: mediaUrl
        }
      });
    } catch (e) {
      console.error("[weekly-tip] failed to send image:", e);
    }
  }
}
