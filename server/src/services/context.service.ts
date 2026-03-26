// Importa el modelo Conversation para leer/escribir estado de conversación en MongoDB
import { Conversation } from "../models/Conversation.js";
// Importa el modelo Message para persistir mensajes entrantes y salientes
import { Message } from "../models/Message.js";
// Utilidad para normalizar números/IDs de WhatsApp a un formato consistente
import { normalizeTo } from "./waid.service.js";

// Crea o actualiza (upsert) una conversación asociada a un waId
export async function upsertConversation(waId: string) {
  // Normaliza el identificador del remitente para consistencia y claves de índice
  const id = normalizeTo(waId);
  // Busca la conversación por waId y, si no existe, la inserta con ese waId
  return Conversation.findOneAndUpdate(
    // Filtro por waId normalizado
    { waId: id },
    // Actualizamos timestamp y reseteamos follow-up level
    { 
        $setOnInsert: { waId: id, subscriptionStatus: "SUSCRITO" },
        $set: { lastUserInteractionAt: new Date(), followUpLevel: 0 }
    },
    // new: true devuelve el documento actualizado; upsert: true crea si no existe
    { new: true, upsert: true }
  );
}

// Guarda un mensaje entrante, con idempotencia basada en (waId, messageId) si está disponible
export async function saveIncomingMessage(params: { 
  waId: string; 
  messageId?: string; 
  text: string;
  type?: string;
  mediaUrl?: string;
  mimeType?: string;
  caption?: string;
}) {
  // Nota: si llega duplicado (mismo waId + messageId) Mongo lanza error por índice unique, se captura en el webhook
  // Normaliza el waId para mantener consistencia y evitar duplicados por formato
  const id = normalizeTo(params.waId);
  // Construye el documento base con dirección entrante
  const doc: any = {
    waId: id,
    direction: "incoming",
    text: params.text,
    type: params.type || 'text',
    mediaUrl: params.mediaUrl,
    mimeType: params.mimeType,
    caption: params.caption
  };
  // Sólo asigna messageId si existe y es cadena no vacía; nunca guardar null/undefined
  if (typeof params.messageId === "string" && params.messageId.trim().length > 0) {
    doc.messageId = params.messageId.trim();
  }
  // Inserta el documento en la colección de mensajes
  return Message.create(doc);
}

// Guarda un mensaje saliente generado por el bot
export async function saveOutgoingMessage(params: { waId: string; text: string; messageId?: string; type?: string; mediaUrl?: string; mimeType?: string; caption?: string; metadata?: any }) {
  // Normaliza el waId para mantener consistencia en la clave
  const id = normalizeTo(params.waId);
  // Si no tenemos un id del Graph, generamos uno único para evitar colisiones en índices antiguos
  const outId = typeof params.messageId === "string" && params.messageId.trim().length > 0
    ? params.messageId.trim()
    : `out-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // Crea un documento con dirección saliente y el texto enviado
  return Message.create({
    waId: id,
    direction: "outgoing",
    messageId: outId,
    type: params.type || "text",
    mediaUrl: params.mediaUrl,
    mimeType: params.mimeType,
    caption: params.caption,
    metadata: params.metadata ?? null,
    text: params.text
  });
}

// Obtiene los mensajes recientes para un waId, ordenados por fecha de creación descendente
export async function getRecentMessages(waId: string, limit = 15) {
  // Normaliza el waId para el filtro
  const id = normalizeTo(waId);
  // Busca por waId, ordena por createdAt descendente y limita el número de resultados
  return Message.find({ waId: id }).sort({ createdAt: -1 }).limit(limit);
}

// Actualiza el estado de la conversación (etapa, último intent, slots) mediante un $set parcial
export async function updateConversationState(waId: string, patch: Partial<{ stage: string; lastIntent: string; slots: any; verificationStatus: string; subscriptionStatus: string; subscriptionOfferPending: boolean; noCoverageLocation: any }>) {
  // Normaliza el waId para localizar la conversación correcta
  const id = normalizeTo(waId);
  // Lee el estado previo para poder loguear el cambio
  const before = await Conversation.findOne({ waId: id }).select("stage lastIntent verificationStatus subscriptionStatus subscriptionOfferPending");
  // Aplica el parche al documento de conversación y devuelve la versión actualizada
  const updated = await Conversation.findOneAndUpdate({ waId: id }, { $set: patch }, { new: true });
  // Log del cambio de estado (etapa/intent) para depuración
  try {
    console.log("[conversation] state change", {
      waId: id,
      from: { stage: before?.stage ?? "(none)", lastIntent: before?.lastIntent ?? "(none)", status: before?.verificationStatus ?? "(none)", subscription: (before as any)?.subscriptionStatus ?? "(none)", subscriptionPending: (before as any)?.subscriptionOfferPending ?? "(none)" },
      to: { stage: updated?.stage ?? "(unchanged)", lastIntent: updated?.lastIntent ?? "(unchanged)", status: updated?.verificationStatus ?? "(unchanged)", subscription: (updated as any)?.subscriptionStatus ?? "(none)", subscriptionPending: (updated as any)?.subscriptionOfferPending ?? "(none)" },
      patch
    });
  } catch (_) {
    // Ignora errores de log para no afectar el flujo
  }
  return updated;
}
