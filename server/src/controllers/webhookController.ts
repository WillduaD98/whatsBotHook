// Controlador del webhook: encapsula la lógica de negocio y respuesta HTTP
// Mantiene separadas las preocupaciones respecto a las rutas (routing y middlewares)

// Importa tipos de Express para tipar objetos de request/response
import { Request, Response } from "express";
// Importa variables de entorno (token de verificación, etc.)
import { env } from "../config/env.js";
// Importaciones de middlewares solo como referencia del flujo; se aplican en las rutas

// Servicio de envío de mensajes de texto por WhatsApp (Graph API)
import { CONSENT_BODY_TEXT, CONSENT_BUTTONS, sendButtons, sendConsentButtons, sendImage, sendText, uploadImageMedia } from "../services/whatsapp.service.js";
// Servicios de enrutamiento semántico: detección de intención y construcción de respuestas
import { detectIntent, buildReply, normalizeText } from "../services/router.service.js";
// Servicios de contexto/conversación: upsert de conversación y persistencia de mensajes
import { upsertConversation, saveIncomingMessage, saveOutgoingMessage, updateConversationState } from "../services/context.service.js";
// Servicios de waId: normalización del número y extracción desde el cuerpo del webhook
import { normalizeTo } from "../services/waid.service.js";
// Servicios de geolocalización: validación y clasificación de coordenadas
import { classifyCoords, isValidCoords } from "../services/geo.service.js";

import { getMediaUrl, downloadMedia } from "../services/media.service.js";
import { WeeklyTip } from "../models/WeeklyTip.js";
import fs from "fs/promises";
import path from "path";

const COVERAGE_CITY_NAMES = [
  "León",
  "Guanajuato",
  "Irapuato",
  "Salamanca",
  "San Miguel de Allende",
  "Celaya",
  "Dolores Hidalgo",
  "San Francisco del Rincon",
  "Queretaro",
  "Aguascalientes",
  "Silao",
  "San Luis Potosi",
  "Puebla"
];

const PUEBLA_COVERAGE_COLONIAS: string[] = [
  'Guadalupe Hidalgo',
  'Ampliacion Guadalupe Hidalgo',
  'Infonavit San Miguel Mayorazgo',
  'La Carmelita',
  'Jardines de Santa Rosa',
  'Granjas Puebla',
  'Villa Albertina',
  'Geovillas del Sur',
  'Arboledas de Loma Bella',
  'Vicente Guerrero',
  'Los heroes Puebla 1 seccion',
  'Los heroes Puebla primera seccion',
  'Bosques de los heroes',
  'Los heroes de Puebla',
  'Los heroes 2da seccion',
  'Los heroes segunda seccion',
  'Arboledas de loma bella',
  'Granjas de San Isidro',
  'Granjas del sur',
  'Bugambilias',
  'San Ramon',
  'Castillotla',
  'Geovillas del Sur',
  'Minerales de Guadalupe Sur',
  'Bosques de la cañada',
  'Union Antorchista',
  'La Albertina'
];

function normalizeCityKey(input: string): string {
  return cityTokens(input).join("");
}

function normalizeColoniaKey(input: string): string {
  return normalizeText(input).replace(/\s+/g, "");
}

function normalizeActionKey(input: string): string {
  return String(input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function weeklyTipActionFromMessage(msg: any): "RECEIVE_WEEKLY_TIP" | null {
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

async function sendActiveWeeklyTipImages(waId: string, inboundPhoneNumberId?: string) {
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

      const fullPath = path.join(process.cwd(), "public", rel);
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

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const alen = a.length;
  const blen = b.length;
  if (alen === 0) return blen;
  if (blen === 0) return alen;

  const dp = new Array<number>(blen + 1);
  for (let j = 0; j <= blen; j++) dp[j] = j;

  for (let i = 1; i <= alen; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= blen; j++) {
      const tmp = dp[j];
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[blen];
}

function cityTokens(input: string): string[] {
  const t = normalizeText(input);
  const raw = t.split(" ").filter(Boolean);
  const drop = new Set([
    "de",
    "del",
    "la",
    "el",
    "los",
    "las",
    "y",
    "en",
    "soy",
    "estoy",
    "vivo",
    "vivimos",
    "mi",
    "mis",
    "negocio",
    "ciudad",
    "municipio",
    "estado",
    "gto",
    "mx",
    "mexico",
    "calle",
    "col",
    "colonia",
    "fracc",
    "fraccionamiento",
    "av",
    "avenida",
    "blvd",
    "bulevar",
    "boulevard",
    "cp",
    "codigo",
    "postal",
    "no",
    "num",
    "numero",
    "interior",
    "exterior"
  ]);
  return raw.filter((x) => !drop.has(x) && !/^\d+$/.test(x));
}

function scoreSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  const dist = levenshtein(a, b);
  return 1 - dist / maxLen;
}

function containsSequenceTokens(input: string[], seq: string[]): boolean {
  if (seq.length === 0 || input.length < seq.length) return false;
  for (let i = 0; i <= input.length - seq.length; i++) {
    let ok = true;
    for (let j = 0; j < seq.length; j++) {
      if (input[i + j] !== seq[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

function tryMatchPueblaColonia(input: string): string | null {
  const inputKey = normalizeColoniaKey(input);
  if (!inputKey) return null;

  const normalized = PUEBLA_COVERAGE_COLONIAS.map((name) => {
    const key = normalizeColoniaKey(name);
    const tokens = normalizeText(name).split(" ").filter(Boolean);
    return { name, key, tokens };
  }).filter((x) => x.key.length >= 3);

  for (const c of normalized) {
    if (c.key === inputKey) return c.name;
  }

  for (const c of normalized) {
    if (c.key.length >= 4 && (inputKey.includes(c.key) || c.key.includes(inputKey))) return c.name;
  }

  const inputTokens = normalizeText(input).split(" ").filter(Boolean);
  for (const c of normalized) {
    if (containsSequenceTokens(inputTokens, c.tokens)) return c.name;
    if (inputTokens.length > 0 && inputTokens.every((t) => c.tokens.includes(t))) return c.name;
  }

  return null;
}

function tryMatchCoverageCity(input: string): string | null {
  const inputTokens = cityTokens(input);
  if (inputTokens.length === 0) return null;
  const inputJoined = normalizeCityKey(input);
  if (inputJoined.length < 3) return null;

  const normalized = COVERAGE_CITY_NAMES.map((name) => {
    const tokens = cityTokens(name);
    return { name, tokens, key: normalizeCityKey(name) };
  }).filter((x) => x.key.length >= 3);

  for (const c of normalized) {
    if (containsSequenceTokens(inputTokens, c.tokens)) return c.name;
  }

  for (const c of normalized) {
    if (inputJoined.includes(c.key)) return c.name;
  }

  let best: { name: string; score: number } | null = null;
  let secondBestScore = -1;

  for (const c of normalized) {
    const minW = Math.max(1, c.tokens.length - 1);
    const maxW = Math.min(6, c.tokens.length + 2, inputTokens.length);
    let bestCityScore = 0;
    for (let w = minW; w <= maxW; w++) {
      for (let i = 0; i <= inputTokens.length - w; i++) {
        const windowKey = inputTokens.slice(i, i + w).join("");
        const s = scoreSimilarity(windowKey, c.key);
        if (s > bestCityScore) bestCityScore = s;
      }
    }
    const score = bestCityScore;
    if (!best || score > best.score) {
      secondBestScore = best ? best.score : secondBestScore;
      best = { name: c.name, score };
    } else if (score > secondBestScore) {
      secondBestScore = score;
    }
  }

  if (!best) return null;
  if (best.score < 0.82) return null;
  if (secondBestScore >= 0 && best.score - secondBestScore < 0.06) return null;
  return best.name;
}

// Handler GET /webhook: verificación de suscripción (challenge)
export async function handleWebhookGet(req: Request, res: Response) {
  if (process.env.NODE_ENV !== "production") console.log("GET / webhook HIT");
  // Extrae el modo de la verificación enviado por Meta (debe ser "subscribe")
  const mode = (req.query["hub.mode"] as string) || undefined;
  // Extrae el token de verificación que debe coincidir con env.VERIFY_TOKEN
  const token = (req.query["hub.verify_token"] as string) || undefined;
  // Extrae el challenge que se debe devolver si las comprobaciones son correctas
  const challenge = (req.query["hub.challenge"] as string) || undefined;
  // Valida modo y token; si coinciden, devuelve el challenge con 200 OK
  if (mode === "subscribe" && token === env.VERIFY_TOKEN) return res.status(200).send(challenge);
  // Si no coincide, responde 403 Forbidden para indicar verificación fallida
  return res.sendStatus(403);
}

// Handler POST /webhook: procesamiento principal de mensajes entrantes
// Handler POST /webhook: procesamiento principal de mensajes entrantes
export async function handleWebhookPost(req: Request, res: Response) {
  try {
    const entries = Array.isArray((req as any)?.body?.entry) ? ((req as any).body.entry as any[]) : [];
    for (const e of entries) {
      const changes = Array.isArray(e?.changes) ? e.changes : [];
      for (const c of changes) {
        const v = c?.value;
        if (v?.statuses?.length) {
          if (process.env.NODE_ENV !== "production") console.log("[whatsapp] STATUSES:", JSON.stringify(v.statuses, null, 2));
        }
      }
    }

    // Navega el payload estándar de WhatsApp para encontrar datos relevantes
    const value = (req.body?.entry?.[0]?.changes?.[0]?.value) as any;
    if (process.env.NODE_ENV !== "production") {
      console.log("WEBHOOK HIT, metadata:", value?.metadata);
      console.log("WEBHOOK HIT, has messages:", Array.isArray(value?.messages), "has statuses:", Array.isArray(value?.statuses));
    }

    // ✅ NUEVO: phone_number_id del número que RECIBIÓ el mensaje (test o prod)
    const inboundPhoneNumberId = value?.metadata?.phone_number_id as string | undefined;

    // Obtiene el primer mensaje del arreglo de mensajes (normalmente hay uno por evento)
    const msg = value?.messages?.[0];
    if (process.env.NODE_ENV !== "production") console.log("value HIT", msg);
    // Si no hay mensaje, devolvemos 200 para evitar reintentos del proveedor
    if (!msg) return res.sendStatus(200);

    // Normaliza el número del remitente (waId) a un formato consistente
    const waId = normalizeTo(msg.from as string);
    // Toma el id del mensaje (si existe) para asegurar idempotencia de persistencia
    const messageId = msg.id as string | undefined;

    // Rama: manejo de mensajes de ubicación (latitud y longitud)
    if (msg?.type === "location" && msg?.location) {
      const lat = Number(msg.location.latitude);
      const lon = Number(msg.location.longitude);

      if (!isValidCoords(lat, lon)) {
        await sendText(waId, "Ubicación inválida. Verifica latitud/longitud.", { senderPhoneNumberId: inboundPhoneNumberId });
        return res.sendStatus(200);
      }

      const conv = await upsertConversation(waId);
      try {
        await saveIncomingMessage({ waId, text: `ubicacion: lat=${lat}, lon=${lon}` , ...(messageId ? { messageId } : {}) });
      } catch (e: any) {
        console.log("duplicado messageId:", messageId, e);
      }

      const stage = conv?.stage || "start";
      const status = classifyCoords(lat, lon);

      // Si estamos en Pre-Solicitud esperando ubicación (PASO 1)
      if (stage === "PRE_SOLICITUD:espera_ubicacion") {
        if (status === "NO_COBERTURA") {
          const reply =
              "🙋‍♂️ Por ahora todavía no tenemos cobertura en tu zona.\n\n" +
              "Te voy a dejar *suscrito* para enviarte *consejos prácticos para tu negocio* cada semana 📈\n" +
              "y avisarte en cuanto tengamos servicio en tu ciudad. 🏪\n\n" +
              "Si prefieres regresar al menú principal:\n" +
              "↩️ escribe *MENÚ*";
          await updateConversationState(waId, {
            stage: "start",
            lastIntent: "SALUDO",
            slots: {},
            subscriptionStatus: "SUSCRITO",
            subscriptionOfferPending: false,
            noCoverageLocation: { lat, lon, at: new Date() }
          });
          await sendText(waId, reply, { senderPhoneNumberId: inboundPhoneNumberId });
          await saveOutgoingMessage({ waId, text: reply });
          return res.sendStatus(200);
        } else {
          // SI_COBERTURA o REVISAR_ASESOR -> Avanzamos
          const reply = "✅ Cobertura validada.\n\nAhora envíame 3 fotos de tu negocio (por fuera y adentro).";
          await updateConversationState(waId, { stage: "PRE_SOLICITUD:espera_fotos_negocio" });
          await sendText(waId, reply, { senderPhoneNumberId: inboundPhoneNumberId });
          await saveOutgoingMessage({ waId, text: reply });
          return res.sendStatus(200);
        }
      }

      // Respuesta genérica si envía ubicación fuera de flujo
      const reply = `Ubicación recibida. Estado de cobertura: ${status}`;
      await sendText(waId, reply, { senderPhoneNumberId: inboundPhoneNumberId });
      await saveOutgoingMessage({ waId, text: reply });
      return res.sendStatus(200);
    }

    // Rama: manejo de mensajes de texto (otros tipos no ubicacionales)
    let text = (msg?.text?.body || "").trim();
    let mediaUrl: string | undefined;
    let mimeType: string | undefined;
    let caption: string | undefined;
    const type = msg?.type || 'text';
    let interactiveBtnId: string | undefined;
    let interactiveBtnTitle: string | undefined;

    if (!text && type === "button") {
        text = String(msg?.button?.payload || msg?.button?.text || "").trim();
        interactiveBtnId = text || undefined;
        interactiveBtnTitle = String(msg?.button?.text || "").trim() || undefined;
    }
    if (!text && type === "interactive") {
        const reply = msg?.interactive?.button_reply || msg?.interactive?.list_reply;
        interactiveBtnId = String(reply?.id || "").trim() || undefined;
        interactiveBtnTitle = String(reply?.title || "").trim() || undefined;
        text = String(interactiveBtnTitle || reply?.id || "").trim();
    }

    if (type === 'image' && msg?.image) {
        const imageId = msg.image.id;
        mimeType = msg.image.mime_type;
        caption = msg.image.caption;
        if (caption) text = caption; // Usar caption como texto si existe

        try {
            console.log(`Procesando imagen ID: ${imageId}, Mime: ${mimeType}`);
            const url = await getMediaUrl(imageId);
            console.log(`URL de descarga obtenida: ${url}`);
            
            if (url) {
                const ext = mimeType?.split('/')[1] || 'jpg';
                const filename = `${normalizeTo(waId)}-${Date.now()}-${imageId}.${ext}`;
                const localPath = await downloadMedia(url, filename);
                console.log(`Imagen descargada en: ${localPath}`);
                
                if (localPath) {
                    mediaUrl = localPath;
                }
            } else {
                console.error(`No se pudo obtener URL para media ID: ${imageId}`);
            }
        } catch (error) {
            console.error("Error procesando imagen:", error);
        }
    }
    
    if (type === 'document' && (msg as any)?.document) {
        const docId = (msg as any).document.id as string | undefined;
        const originalFilename = (msg as any).document.filename as string | undefined;
        mimeType = (msg as any).document.mime_type as string | undefined;
        caption = originalFilename;
        if (!text && originalFilename) text = originalFilename;

        if (docId) {
            try {
                console.log(`Procesando documento ID: ${docId}, Mime: ${mimeType}`);
                const url = await getMediaUrl(docId);
                console.log(`URL de descarga obtenida: ${url}`);

                if (url) {
                    const extFromName = typeof originalFilename === "string" && originalFilename.includes(".")
                      ? originalFilename.split(".").pop()
                      : undefined;
                    const extFromMime = mimeType?.split("/")[1];
                    const extRaw = (extFromName || extFromMime || "bin").toString().toLowerCase();
                    const ext = extRaw.replace(/[^a-z0-9]/g, "") || "bin";
                    const filename = `${normalizeTo(waId)}-${Date.now()}-${docId}.${ext}`;
                    const localPath = await downloadMedia(url, filename);
                    console.log(`Documento descargado en: ${localPath}`);

                    if (localPath) {
                        mediaUrl = localPath;
                    }
                } else {
                    console.error(`No se pudo obtener URL para media ID: ${docId}`);
                }
            } catch (error) {
                console.error("Error procesando documento:", error);
            }
        }
    }

    // Log del texto para depurar entradas del usuario
    console.log("text HIT", text, "type:", type);

    // Asegura una conversación existente: crea o actualiza según sea necesario
    const conv = await upsertConversation(waId);

    // Intenta persistir el mensaje entrante para mantener trazabilidad
    try {
      const savedText =
        (type === "interactive" || type === "button") && interactiveBtnId
          ? `Botón: ${interactiveBtnTitle || interactiveBtnId}${interactiveBtnTitle && interactiveBtnTitle !== interactiveBtnId ? ` (${interactiveBtnId})` : ""}`
          : text;
      const msgParams: any = { waId, text: savedText, type };
      if (messageId) msgParams.messageId = messageId;
      if (mediaUrl) msgParams.mediaUrl = mediaUrl;
      if (mimeType) msgParams.mimeType = mimeType;
      if (caption) msgParams.caption = caption;

      await saveIncomingMessage(msgParams);
    } catch (e: any) {
      // Si el messageId ya existía, no detenemos el flujo: continuamos para no perder cambios de estado
      console.log("duplicado messageId:", messageId, e);
      // Nota: Continuamos sin return para permitir actualización de etapa y respuestas
    }

    // Determina la etapa actual de la conversación o usa "start" por defecto
    const stage = conv?.stage || "start";
    const lastIntent = conv?.lastIntent || "";
    const acceptedPrivacy = type === "interactive" && interactiveBtnId === "PV_ACEPTO";

    const formatInteractive = (body: string, buttons: Array<{ id: string; title: string }>) => {
      const opts = buttons.map((b) => b.title).join(" | ");
      return `${body}\n\nOpciones: ${opts}`;
    };

    const sendMainMenu = async () => {
      await updateConversationState(waId, { stage: "start", lastIntent: "SALUDO", slots: {}, subscriptionOfferPending: false });
      const body =
        "Hola 👋 Soy el asistente de *TandaYa*.\n\n" +
        "¿Qué necesitas el día de hoy?";
      const buttons = [
        { id: "MENU_PRE", title: "Pre-solicitud ✅" },
        { id: "MENU_FAQ", title: "Tengo dudas 📌" }
      ];
      const apiRes = await sendButtons(
        waId,
        body,
        buttons,
        { senderPhoneNumberId: inboundPhoneNumberId }
      );
      const outId = apiRes?.messages?.[0]?.id;
      await saveOutgoingMessage({ waId, text: formatInteractive(body, buttons), messageId: outId, type: "interactive" });
    };

    const sendFaqMenu = async (page: 1 | 2) => {
      const body = "*📌 Preguntas frecuentes*\n\nSobre que tema tienes dudas, elige:";
      const buttons =
        page === 1
          ? [
              { id: "FAQ_REQ", title: "Requisitos ✅" },
              { id: "FAQ_MONTOS", title: "Montos 💰" },
              { id: "FAQ_MAS", title: "Más ➜" }
            ]
          : [
              { id: "FAQ_FUNC", title: "¿Cómo funciona?" },
              { id: "FAQ_QUIEN", title: "¿Quiénes somos?" },
              { id: "FAQ_ATRAS", title: "⬅ Atrás" }
            ];
      const apiRes = await sendButtons(
        waId,
        body,
        buttons,
        { senderPhoneNumberId: inboundPhoneNumberId }
      );
      const outId = apiRes?.messages?.[0]?.id;
      await saveOutgoingMessage({ waId, text: formatInteractive(body, buttons), messageId: outId, type: "interactive" });
      await updateConversationState(waId, { stage: `FAQ_MENU:${page}`, lastIntent: "FAQ_MENU" });
    };

    if (type === "interactive" && interactiveBtnId === "PV_REGRESAR") {
      const exitMsg = "Has salido de Pre-Solicitud. Volvemos al menú principal.";
      await sendText(waId, exitMsg, { senderPhoneNumberId: inboundPhoneNumberId });
      await saveOutgoingMessage({ waId, text: exitMsg });
      await sendMainMenu();
      return res.sendStatus(200);
    }

    const weeklyTipAction = weeklyTipActionFromMessage(msg);
    if (weeklyTipAction === "RECEIVE_WEEKLY_TIP") {
      await sendActiveWeeklyTipImages(waId, inboundPhoneNumberId);
      return res.sendStatus(200);
    }
    
    const menuCandidate = (text || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const exitCandidate = menuCandidate
      .replace(/[^a-z0-9]/g, "")
      .replace(/z/g, "s")
      .replace(/v/g, "b")
      .replace(/(.)\1+/g, "$1");

    const menuCandidateCompact = menuCandidate.replace(/[^a-z0-9]/g, "");
    const wantsUnsubscribe =
      exitCandidate.includes("baja") ||
      exitCandidate.includes("nosuscrib") ||
      exitCandidate.includes("nosuscrip") ||
      exitCandidate.includes("desuscrib") ||
      exitCandidate.includes("desuscrip") ||
      exitCandidate.includes("sinsuscrib") ||
      exitCandidate.includes("sinsuscrip");

    const wantsSubscribe =
      !wantsUnsubscribe &&
      (exitCandidate.includes("suscrib") || exitCandidate.includes("suscrip") || exitCandidate.includes("subscrib"));

    const unsubscribeReply =
      "✅ *Listo*\n\n" +
      "Tu estatus ahora es *NO SUSCRITO*. Te daremos de baja de estos *consejos GRATIS*.\n\n" +
      "Si cambias de opinión, escribe:\n" +
      "*SUSCRIBIR* para activarte nuevamente.\n\n" +
      "🤝 Comunidad *Tanda Ya*";

    // --- ESTADO ASESOR (HUMANO) ---
    // Si el usuario ya está en estado ASESOR, el bot NO responde automáticamente.
    // Solo un humano debería intervenir.
    // Regla estricta: NO detectar menú, NO detectar nada, NO salir automáticamente.
    if (stage === "ASESOR") {
      if (interactiveBtnId === "NAV_MENU") {
        await sendMainMenu();
        return res.sendStatus(200);
      }
      if (interactiveBtnId === "NAV_FAQ" || interactiveBtnId === "MENU_FAQ") {
        await sendFaqMenu(1);
        return res.sendStatus(200);
      }
      if (interactiveBtnId === "MENU_PRE") {
        await updateConversationState(waId, { stage: "PRE_SOLICITUD:aviso_privacidad", lastIntent: "PRE_SOLICITUD" });
        const apiRes = await sendConsentButtons(waId, { senderPhoneNumberId: inboundPhoneNumberId });
        const outId = apiRes?.messages?.[0]?.id;
        await saveOutgoingMessage({ waId, text: formatInteractive(CONSENT_BODY_TEXT, CONSENT_BUTTONS), messageId: outId, type: "interactive" });
        return res.sendStatus(200);
      }

      if (wantsUnsubscribe) {
        await updateConversationState(waId, { subscriptionStatus: "NO_SUSCRITO", subscriptionOfferPending: false });
        await sendText(waId, unsubscribeReply, { senderPhoneNumberId: inboundPhoneNumberId });
        await saveOutgoingMessage({ waId, text: unsubscribeReply });
        return res.sendStatus(200);
      }
      if (wantsSubscribe) {
        await updateConversationState(waId, { subscriptionStatus: "SUSCRITO", subscriptionOfferPending: false });
        return res.sendStatus(200);
      }
      if (exitCandidate.includes("menu") || exitCandidate.includes("regres") || detectIntent(text) === "SALUDO") {
        await sendMainMenu();
        return res.sendStatus(200);
      }

      console.log(`[ASESOR] Bot silenciado para waId: ${waId}. Esperando intervención humana.`);
      return res.sendStatus(200);
    }

    if (interactiveBtnId === "NAV_MENU") {
      await sendMainMenu();
      return res.sendStatus(200);
    }
    if (interactiveBtnId === "NAV_FAQ") {
      await sendFaqMenu(1);
      return res.sendStatus(200);
    }

    if (stage.startsWith("FAQ_MENU")) {
      if (interactiveBtnId === "FAQ_MAS") {
        await sendFaqMenu(2);
        return res.sendStatus(200);
      }
      if (interactiveBtnId === "FAQ_ATRAS") {
        await sendFaqMenu(1);
        return res.sendStatus(200);
      }

      const intentFromFaq =
        interactiveBtnId === "FAQ_REQ"
          ? ("REQUISITOS" as const)
          : interactiveBtnId === "FAQ_MONTOS"
            ? ("MONTOS_PLAZOS" as const)
            : interactiveBtnId === "FAQ_FUNC"
              ? ("EXPLICACION" as const)
              : interactiveBtnId === "FAQ_QUIEN"
                ? ("CONFIANZA" as const)
                : null;

      if (intentFromFaq) {
        await updateConversationState(waId, { lastIntent: intentFromFaq });
        const reply = buildReply(intentFromFaq);
        await sendText(waId, reply, { senderPhoneNumberId: inboundPhoneNumberId });
        await saveOutgoingMessage({ waId, text: reply });

        const apiRes = await sendButtons(
          waId,
          "¿Qué quieres hacer ahora?",
          [
            { id: "NAV_FAQ", title: "Tengo dudas 📌" },
            { id: "NAV_MENU", title: "Menú Inicial" }
          ],
          { senderPhoneNumberId: inboundPhoneNumberId }
        );
        const outId = apiRes?.messages?.[0]?.id;
        await saveOutgoingMessage({
          waId,
          text: formatInteractive("¿Qué quieres hacer ahora?", [
            { id: "NAV_FAQ", title: "Tengo dudas 📌" },
            { id: "NAV_MENU", title: "Menú Inicial" }
          ]),
          messageId: outId,
          type: "interactive"
        });
        return res.sendStatus(200);
      }

      if (type !== "interactive") {
        await sendFaqMenu(stage === "FAQ_MENU:2" ? 2 : 1);
        return res.sendStatus(200);
      }
    }

    if (!stage.startsWith("ENGAGE") && !stage.startsWith("PRE_SOLICITUD")) {
      if (exitCandidate.includes("retomar")) {
        const reply = "🙌 ¡Claro! Vamos a retomarlo.\n\nElige una opción:";
        await sendText(waId, reply, { senderPhoneNumberId: inboundPhoneNumberId });
        await saveOutgoingMessage({ waId, text: reply });
        const apiRes = await sendButtons(
          waId,
          "Selecciona:",
          [
            { id: "NAV_MENU", title: "Menú" },
            { id: "MENU_PRE", title: "Pre-solicitud ✅" }
          ],
          { senderPhoneNumberId: inboundPhoneNumberId }
        );
        const outId = apiRes?.messages?.[0]?.id;
        await saveOutgoingMessage({
          waId,
          text: formatInteractive("Selecciona:", [
            { id: "NAV_MENU", title: "Menú" },
            { id: "MENU_PRE", title: "Pre-solicitud ✅" }
          ]),
          messageId: outId,
          type: "interactive"
        });
        return res.sendStatus(200);
      }
      if (exitCandidate === "0" || exitCandidate.includes("regres")) {
        await sendMainMenu();
        return res.sendStatus(200);
      }
      if (menuCandidate === "menu") {
        await sendMainMenu();
        return res.sendStatus(200);
      }
    }

    if (wantsUnsubscribe) {
      await updateConversationState(waId, { subscriptionStatus: "NO_SUSCRITO", subscriptionOfferPending: false });
      await sendText(waId, unsubscribeReply, { senderPhoneNumberId: inboundPhoneNumberId });
      await saveOutgoingMessage({ waId, text: unsubscribeReply });
      return res.sendStatus(200);
    }
    if (conv?.subscriptionOfferPending) {
      if (wantsSubscribe) {
        await updateConversationState(waId, { subscriptionStatus: "SUSCRITO", subscriptionOfferPending: false, stage: "start", lastIntent: "SALUDO" });
        const reply = "✅ Listo. Quedaste suscrito para recibir consejos semanales por WhatsApp y te avisaremos cuando tengamos cobertura.";
        await sendText(waId, reply, { senderPhoneNumberId: inboundPhoneNumberId });
        await saveOutgoingMessage({ waId, text: reply });
        await sendMainMenu();
        return res.sendStatus(200);
      }

      if (menuCandidateCompact === "no") {
        await updateConversationState(waId, { subscriptionOfferPending: false, stage: "start", lastIntent: "SALUDO" });
        await sendMainMenu();
        return res.sendStatus(200);
      }
    } else if (wantsSubscribe) {
      await updateConversationState(waId, { subscriptionStatus: "SUSCRITO", subscriptionOfferPending: false });
      const reply = "✅ Listo. Quedaste suscrito para recibir consejos semanales por WhatsApp.";
      await sendText(waId, reply, { senderPhoneNumberId: inboundPhoneNumberId });
      await saveOutgoingMessage({ waId, text: reply });
      return res.sendStatus(200);
    }

    let forcedIntent: ReturnType<typeof detectIntent> | null = null;
    if (interactiveBtnId === "MENU_FAQ") {
      await sendFaqMenu(1);
      return res.sendStatus(200);
    }
    if (interactiveBtnId === "MENU_PRE") {
      forcedIntent = "PRE_SOLICITUD";
    }

    const isInBotFlow = stage.startsWith("ENGAGE") || stage.startsWith("PRE_SOLICITUD");
    if (!isInBotFlow && type !== "interactive" && /^\d+$/.test(menuCandidateCompact)) {
      const reply = "Para avanzar, usa los botones del menú.";
      await sendText(waId, reply, { senderPhoneNumberId: inboundPhoneNumberId });
      await saveOutgoingMessage({ waId, text: reply });
      await sendMainMenu();
      return res.sendStatus(200);
    }
    if (!isInBotFlow && /^solo\b/.test(menuCandidate) && menuCandidate.length > 4) {
      const reply = "Para avanzar, usa los botones del menú.";
      await sendText(waId, reply, { senderPhoneNumberId: inboundPhoneNumberId });
      await saveOutgoingMessage({ waId, text: reply });
      await sendMainMenu();
      return res.sendStatus(200);
    }

    // --- NUEVO ESTADO: ENGAGE (APLICO) ---
    // Trigger directo: "APLICO" o mensajes de información
    const textUpper = text.toUpperCase();
    if ((textUpper === "APLICO" || textUpper.includes("INFORMACIÓN") || textUpper.includes("INFORMACION")) && !stage.startsWith("ENGAGE")) {
      const initialSlots = { ...(conv?.slots || {}), engage: { q1: "", q2: "", q3: "" } };
      // Iniciamos en la pregunta 1
      await updateConversationState(waId, { stage: "ENGAGE:q1", lastIntent: "ENGAGE", slots: initialSlots });

      const intro =
        "¡Hola! 👋 Soy el asistente de *TandaYa*.\n\n" +
        "Te digo en *60 segundos* si puedes aplicar para el crédito para crecer tu negocio. ✅\n\n" +
        "*Solo para dueños de negocio* (no gastos personales).";
      await sendText(waId, intro, { senderPhoneNumberId: inboundPhoneNumberId });
      await saveOutgoingMessage({ waId, text: intro });

      const apiRes = await sendButtons(
        waId,
        "¿Listo para 3 preguntas rápidas? *(sin documentos)*",
        [
          { id: "ENG_Q1_YES", title: "Sí, va" },
          { id: "ENG_Q1_NO", title: "Solo viendo" },
          { id: "NAV_MENU", title: "Menú" }
        ],
        { senderPhoneNumberId: inboundPhoneNumberId }
      );
      const outId = apiRes?.messages?.[0]?.id;
      await saveOutgoingMessage({
        waId,
        text: formatInteractive("¿Listo para 3 preguntas rápidas? *(sin documentos)*", [
          { id: "ENG_Q1_YES", title: "Sí, va" },
          { id: "ENG_Q1_NO", title: "Solo viendo" },
          { id: "NAV_MENU", title: "Menú" }
        ]),
        messageId: outId,
        type: "interactive"
      });
      return res.sendStatus(200);
    }

    // Manejo del flujo ENGAGE
    if (stage.startsWith("ENGAGE")) {
      const resendQ1 = async () => {
        const body = "¿Listo para 3 preguntas rápidas? *(sin documentos)*";
        const buttons = [
          { id: "ENG_Q1_YES", title: "Sí, va" },
          { id: "ENG_Q1_NO", title: "Solo viendo" },
          { id: "NAV_MENU", title: "Menú" }
        ];
        const apiRes = await sendButtons(
          waId,
          body,
          buttons,
          { senderPhoneNumberId: inboundPhoneNumberId }
        );
        const outId = apiRes?.messages?.[0]?.id;
        await saveOutgoingMessage({ waId, text: formatInteractive(body, buttons), messageId: outId, type: "interactive" });
      };

      const resendQ2 = async () => {
        const body = "2️⃣ ¿Eres dueño de un negocio que ya está operando?";
        const buttons = [
          { id: "ENG_Q2_YES", title: "Sí" },
          { id: "ENG_Q2_NO", title: "Aún no" },
          { id: "NAV_MENU", title: "Menú" }
        ];
        const apiRes = await sendButtons(
          waId,
          body,
          buttons,
          { senderPhoneNumberId: inboundPhoneNumberId }
        );
        const outId = apiRes?.messages?.[0]?.id;
        await saveOutgoingMessage({ waId, text: formatInteractive(body, buttons), messageId: outId, type: "interactive" });
      };

      const resendQ3Page1 = async () => {
        const body = "3️⃣ ¿Cuánto tiempo tienes operando?";
        const buttons = [
          { id: "ENG_Q3_LT6", title: "Menos 6m" },
          { id: "ENG_Q3_6_24", title: "6m a 2a" },
          { id: "ENG_Q3_MORE", title: "Más ➜" }
        ];
        const apiRes = await sendButtons(
          waId,
          body,
          buttons,
          { senderPhoneNumberId: inboundPhoneNumberId }
        );
        const outId = apiRes?.messages?.[0]?.id;
        await saveOutgoingMessage({ waId, text: formatInteractive(body, buttons), messageId: outId, type: "interactive" });
      };

      const resendQ3Page2 = async () => {
        const body = "3️⃣ ¿Cuánto tiempo tienes operando?";
        const buttons = [
          { id: "ENG_Q3_GT24", title: "Más de 2a" },
          { id: "ENG_Q3_BACK", title: "⬅ Atrás" },
          { id: "NAV_MENU", title: "Menú" }
        ];
        const apiRes = await sendButtons(
          waId,
          body,
          buttons,
          { senderPhoneNumberId: inboundPhoneNumberId }
        );
        const outId = apiRes?.messages?.[0]?.id;
        await saveOutgoingMessage({ waId, text: formatInteractive(body, buttons), messageId: outId, type: "interactive" });
      };

      const exitText = (text || "").trim().toLowerCase();
      if (exitText === "regresar" || exitText === "0") {
        await updateConversationState(waId, { stage: "start", lastIntent: "SALUDO", slots: {} });
        const exitMsg = "❌ Solicitud cancelada. Volvemos al menú principal.";
        await sendText(waId, exitMsg, { senderPhoneNumberId: inboundPhoneNumberId });
        await saveOutgoingMessage({ waId, text: exitMsg });
        await sendMainMenu();
        return res.sendStatus(200);
      }

      const currentSlots = conv?.slots?.engage || {};

      if (stage === "ENGAGE:q1") {
        if (interactiveBtnId === "ENG_Q1_NO") {
          const rejectMsg = "Esto es solo para personas interesadas en crecer su negocio.";
          await sendText(waId, rejectMsg, { senderPhoneNumberId: inboundPhoneNumberId });
          await saveOutgoingMessage({ waId, text: rejectMsg });
          await updateConversationState(waId, { stage: "start", lastIntent: "SALUDO", slots: {} });
          await sendMainMenu();
          return res.sendStatus(200);
        }
        if (interactiveBtnId !== "ENG_Q1_YES") {
          const errorMsg = "Por favor usa los botones para continuar.";
          await sendText(waId, errorMsg, { senderPhoneNumberId: inboundPhoneNumberId });
          await saveOutgoingMessage({ waId, text: errorMsg });
          await resendQ1();
          return res.sendStatus(200);
        }

        const nextSlots = { ...conv?.slots, engage: { ...currentSlots, q1: "Sí, va" } };
        await updateConversationState(waId, { stage: "ENGAGE:q2", slots: nextSlots });
        await resendQ2();
        return res.sendStatus(200);
      }

      if (stage === "ENGAGE:q2") {
        if (interactiveBtnId === "ENG_Q2_NO") {
          const rejectMsg = "Esto es solo para dueños de negocios.";
          await sendText(waId, rejectMsg, { senderPhoneNumberId: inboundPhoneNumberId });
          await saveOutgoingMessage({ waId, text: rejectMsg });
          await updateConversationState(waId, { stage: "start", lastIntent: "SALUDO", slots: {} });
          await sendMainMenu();
          return res.sendStatus(200);
        }
        if (interactiveBtnId !== "ENG_Q2_YES") {
          const errorMsg = "Por favor usa los botones para continuar.";
          await sendText(waId, errorMsg, { senderPhoneNumberId: inboundPhoneNumberId });
          await saveOutgoingMessage({ waId, text: errorMsg });
          await resendQ2();
          return res.sendStatus(200);
        }

        const nextSlots = { ...conv?.slots, engage: { ...currentSlots, q2: "Sí" } };
        await updateConversationState(waId, { stage: "ENGAGE:q3:1", slots: nextSlots });
        await resendQ3Page1();
        return res.sendStatus(200);
      }

      const finishEngage = async (q3Value: string) => {
        const nextSlots = { ...conv?.slots, engage: { ...currentSlots, q3: q3Value } };
        await updateConversationState(waId, {
          stage: "start",
          lastIntent: "SALUDO",
          verificationStatus: "APLICACION_ENVIADA",
          slots: nextSlots
        });

        const finalMsg = "✅ *¡Gracias! Hemos recibido tu información.*\n\nAhora puedes iniciar tu pre-solicitud desde el menú.";
        await sendText(waId, finalMsg, { senderPhoneNumberId: inboundPhoneNumberId });
        await saveOutgoingMessage({ waId, text: finalMsg });
        await sendMainMenu();
      };

      if (stage === "ENGAGE:q3:1") {
        if (interactiveBtnId === "ENG_Q3_MORE") {
          await updateConversationState(waId, { stage: "ENGAGE:q3:2" });
          await resendQ3Page2();
          return res.sendStatus(200);
        }
        if (interactiveBtnId === "ENG_Q3_LT6") {
          const rejectMsg = "Necesitas al menos 6 meses de operación.";
          await sendText(waId, rejectMsg, { senderPhoneNumberId: inboundPhoneNumberId });
          await saveOutgoingMessage({ waId, text: rejectMsg });
          await updateConversationState(waId, { stage: "start", lastIntent: "SALUDO", slots: {} });
          await sendMainMenu();
          return res.sendStatus(200);
        }
        if (interactiveBtnId === "ENG_Q3_6_24") {
          await finishEngage("6 meses a 2 años");
          return res.sendStatus(200);
        }

        const errorMsg = "Por favor usa los botones para continuar.";
        await sendText(waId, errorMsg, { senderPhoneNumberId: inboundPhoneNumberId });
        await saveOutgoingMessage({ waId, text: errorMsg });
        await resendQ3Page1();
        return res.sendStatus(200);
      }

      if (stage === "ENGAGE:q3:2") {
        if (interactiveBtnId === "ENG_Q3_BACK") {
          await updateConversationState(waId, { stage: "ENGAGE:q3:1" });
          await resendQ3Page1();
          return res.sendStatus(200);
        }
        if (interactiveBtnId === "ENG_Q3_GT24") {
          await finishEngage("Más de 2 años");
          return res.sendStatus(200);
        }

        const errorMsg = "Por favor usa los botones para continuar.";
        await sendText(waId, errorMsg, { senderPhoneNumberId: inboundPhoneNumberId });
        await saveOutgoingMessage({ waId, text: errorMsg });
        await resendQ3Page2();
        return res.sendStatus(200);
      }

      const errorMsg = "Por favor usa los botones para continuar.";
      await sendText(waId, errorMsg, { senderPhoneNumberId: inboundPhoneNumberId });
      await saveOutgoingMessage({ waId, text: errorMsg });
      await sendMainMenu();
      return res.sendStatus(200);
    }

    const inPreVerifFlow = stage.startsWith("PRE_SOLICITUD") || lastIntent === "PRE_SOLICITUD";

    // Helper para anexar recordatorio de salida al menú principal durante Pre-Solicitud
    const withExit = (msg: string) => `${msg}\n\nEscribe 'Regresar' o 'MENÚ' para volver al menú principal.`;


    // Detectamos intención general primero para ver si es PRE_SOLICITUD o HUMANO (Asesor)
    const intent = forcedIntent ?? detectIntent(text);

    // Si el usuario pide hablar con humano (ASESOR) y NO está en pre-solicitud (o incluso si lo está, prioridad alta)
    if (intent === "ASESOR" && !stage.startsWith("PRE_SOLICITUD")) {
      await updateConversationState(waId, { stage: "ASESOR", lastIntent: "ASESOR" });
      const reply = buildReply("ASESOR");
      await sendText(waId, reply, { senderPhoneNumberId: inboundPhoneNumberId });
      await saveOutgoingMessage({ waId, text: reply });
      return res.sendStatus(200);
    }

    // Si el usuario está dentro del flujo de Pre-Solicitud, gestiona sus etapas
    if (inPreVerifFlow || stage.startsWith("PRE_SOLICITUD")) {
      if (!stage.startsWith("PRE_SOLICITUD")) {
        const initialSlots = { ...(conv?.slots || {}), prev: { negocioFotos: 0, ineFrente: false, ineAtras: false, comprobante: false, ubicacion: false } };
        await updateConversationState(waId, { stage: "PRE_SOLICITUD:aviso_privacidad", lastIntent: "PRE_SOLICITUD", slots: initialSlots });
        const apiRes = await sendConsentButtons(waId, { senderPhoneNumberId: inboundPhoneNumberId });
        const outId = apiRes?.messages?.[0]?.id;
        await saveOutgoingMessage({ waId, text: formatInteractive(CONSENT_BODY_TEXT, CONSENT_BUTTONS), messageId: outId, type: "interactive" });
        return res.sendStatus(200);
      }

      // Salida rápida del flujo con palabra clave "Regresar" o "MENÚ"
      const exitText = (text || "").trim().toLowerCase();
      const exitTextNormalized = exitText
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "")
        .replace(/z/g, "s")
        .replace(/v/g, "b")
        .replace(/(.)\1+/g, "$1");
      // Si se solicita salir, resetea estado y regresa al menú principal
      if (exitText === "regresar" || exitTextNormalized.includes("regres") || exitTextNormalized === "menu") {
        // Resetea la etapa, el último intent y limpia slots
        await updateConversationState(waId, { stage: "start", lastIntent: "SALUDO", slots: {} });
        // Envía confirmación de salida del flujo
        const exitMsg = "Has salido de Pre-Solicitud. Volvemos al menú principal.";
        await sendText(waId, exitMsg, { senderPhoneNumberId: inboundPhoneNumberId });
        // Persiste el mensaje saliente
        await saveOutgoingMessage({ waId, text: exitMsg });
        await sendMainMenu();
        // Finaliza el ciclo HTTP
        return res.sendStatus(200);
      }

      // Relee la conversación actual por si se inicializó arriba; usa sus slots actualizados
      const currentConv = await upsertConversation(waId);
      const current = currentConv?.stage || stage;
      const convSlots = currentConv?.slots || conv?.slots || {};

      if (current === "PRE_SOLICITUD:aviso_privacidad") {
        if (acceptedPrivacy) {
          const intro = withExit(
            "🔎 *Pre-Solicitud*\n\n" +
              "💰 *Recordatorio de montos*\n" +
              "Los montos iniciales a autorizar normalmente van de *$2,000 a $15,000*.\n" +
              "Conforme vayas haciendo *historial* con nosotros, tu monto puede *aumentar sin problema* ✅\n\n" +
              "Para comenzar, necesito validar si tenemos cobertura en tu zona."
          );
          const initialSlots = { ...(currentConv?.slots || {}), prev: { negocioFotos: 0, ineFrente: false, ineAtras: false, comprobante: false, ubicacion: false } };
          await updateConversationState(waId, { stage: "PRE_SOLICITUD:espera_ubicacion", lastIntent: "PRE_SOLICITUD", slots: initialSlots });
          await sendText(waId, intro, { senderPhoneNumberId: inboundPhoneNumberId });
          await saveOutgoingMessage({ waId, text: intro });
          const apiRes = await sendButtons(
            waId,
            "¿Cómo quieres validar tu cobertura?",
            [
              { id: "PRE_CIUDAD", title: "Escribir ciudad" },
              { id: "PRE_UBI", title: "Enviar ubicación" },
              { id: "NAV_MENU", title: "Menú" }
            ],
            { senderPhoneNumberId: inboundPhoneNumberId }
          );
          const outId = apiRes?.messages?.[0]?.id;
          await saveOutgoingMessage({
            waId,
            text: formatInteractive("¿Cómo quieres validar tu cobertura?", [
              { id: "PRE_CIUDAD", title: "Escribir ciudad" },
              { id: "PRE_UBI", title: "Enviar ubicación" },
              { id: "NAV_MENU", title: "Menú" }
            ]),
            messageId: outId,
            type: "interactive"
          });
          return res.sendStatus(200);
        }

        const apiRes = await sendConsentButtons(waId, { senderPhoneNumberId: inboundPhoneNumberId });
        const outId = apiRes?.messages?.[0]?.id;
        await saveOutgoingMessage({ waId, text: formatInteractive(CONSENT_BODY_TEXT, CONSENT_BUTTONS), messageId: outId, type: "interactive" });
        return res.sendStatus(200);
      }

      // Etapa: espera ubicación (fallback JSON si no envía attachment)
      if (current === "PRE_SOLICITUD:espera_ubicacion") {
        if (interactiveBtnId === "PRE_CIUDAD") {
          const reply = withExit("Perfecto. Escribe *SOLO* el nombre de tu ciudad (sin calle/colonia ni Estado).");
          await sendText(waId, reply, { senderPhoneNumberId: inboundPhoneNumberId });
          await saveOutgoingMessage({ waId, text: reply });
          return res.sendStatus(200);
        }
        if (interactiveBtnId === "PRE_UBI") {
          const reply = withExit(
            "Perfecto. Envía tu ubicación actual:\n\n" + "(Clip 📎 o '+' -> Ubicación -> Enviar mi ubicación actual)"
          );
          await sendText(waId, reply, { senderPhoneNumberId: inboundPhoneNumberId });
          await saveOutgoingMessage({ waId, text: reply });
          return res.sendStatus(200);
        }

        try {
          const obj = JSON.parse(text || "");
          const latCandidate = (obj?.lat ?? obj?.latitude ?? obj?.Latitud ?? obj?.latitud);
          const lonCandidate = (obj?.lon ?? obj?.longitude ?? obj?.Longitud ?? obj?.longitud);
          
          if (latCandidate != null && lonCandidate != null) {
            const lat = Number(latCandidate);
            const lon = Number(lonCandidate);
            
            if (!isNaN(lat) && !isNaN(lon) && isValidCoords(lat, lon)) {
               const status = classifyCoords(lat, lon);
               if (status === "NO_COBERTURA") {
                  const reply =
                    "Actualmente no tenemos cobertura en tu zona.\n\n" +
                    "Te voy a dejar *suscrito* para recibir consejos semanales para tu negocio por WhatsApp y avisarte cuando tengamos cobertura.\n\n" +
                    "Si prefieres regresar al menú principal, escribe: *MENÚ*";
                  await updateConversationState(waId, {
                    stage: "start",
                    lastIntent: "SALUDO",
                    slots: {},
                    subscriptionStatus: "SUSCRITO",
                    subscriptionOfferPending: false,
                    noCoverageLocation: { lat, lon, at: new Date() }
                  });
                  await sendText(waId, reply, { senderPhoneNumberId: inboundPhoneNumberId });
                  await saveOutgoingMessage({ waId, text: reply });
                  return res.sendStatus(200);
               } else {
                  // SI_COBERTURA
                  const reply = "✅ Cobertura validada.\n\nAhora envíame 3 fotos de tu negocio (por fuera y adentro).";
                  await updateConversationState(waId, { stage: "PRE_SOLICITUD:espera_fotos_negocio" });
                  await sendText(waId, reply, { senderPhoneNumberId: inboundPhoneNumberId });
                  await saveOutgoingMessage({ waId, text: reply });
                  return res.sendStatus(200);
               }
            } else {
               const invalidMsg = withExit("Ubicación inválida. Verifica latitud/longitud.");
               await sendText(waId, invalidMsg, { senderPhoneNumberId: inboundPhoneNumberId });
               await saveOutgoingMessage({ waId, text: invalidMsg });
               return res.sendStatus(200);
            }
          }
        } catch (_) { }

        const matchedCity = tryMatchCoverageCity(text || "");
        if (matchedCity) {
          if (matchedCity === "Puebla") {
            const nextSlots = { ...(convSlots || {}), preSolicitud: { ...((convSlots as any)?.preSolicitud || {}), ciudad: "Puebla" } };
            const reply = withExit(
              "✅ Cobertura validada en *Puebla*.\n\n" +
              "Para continuar, escribe tu *colonia* TAL CUAL aparece en tu comprobante de domicilio."
            );
            await updateConversationState(waId, { stage: "PRE_SOLICITUD:espera_colonia_puebla", slots: nextSlots });
            await sendText(waId, reply, { senderPhoneNumberId: inboundPhoneNumberId });
            await saveOutgoingMessage({ waId, text: reply });
            return res.sendStatus(200);
          }

          const reply = withExit(`✅ Cobertura validada en *${matchedCity}*.\n\nAhora envíame 3 fotos de tu negocio (por fuera y adentro).`);
          await updateConversationState(waId, { stage: "PRE_SOLICITUD:espera_fotos_negocio" });
          await sendText(waId, reply, { senderPhoneNumberId: inboundPhoneNumberId });
          await saveOutgoingMessage({ waId, text: reply });
          return res.sendStatus(200);
        }

        const tokens = cityTokens(text || "");
        if (tokens.length > 0 && tokens.length <= 12) {
          const reply = withExit(
            "🙋‍♂️ Por ahora no tenemos cobertura en esa ciudad.\n\n" +
            "Si quieres verificarlo mejor, envíame tu ubicación actual (clip 📎 -> Ubicación -> Enviar mi ubicación actual) " +
            "o escribe SOLO el nombre de tu ciudad (sin calle/colonia)."
          );
          await sendText(waId, reply, { senderPhoneNumberId: inboundPhoneNumberId });
          await saveOutgoingMessage({ waId, text: reply });
          return res.sendStatus(200);
        }

        const reply = withExit("Para validar cobertura, envíame tu ubicación actual (clip 📎 -> Ubicación -> Enviar mi ubicación actual) o escribe SOLO el nombre de tu ciudad.");
        await sendText(waId, reply, { senderPhoneNumberId: inboundPhoneNumberId });
        await saveOutgoingMessage({ waId, text: reply });
        return res.sendStatus(200);
      }

      if (current === "PRE_SOLICITUD:espera_colonia_puebla") {
        const colonia = String(text || "").trim();
        if (!colonia) {
          const reply = withExit("Para continuar, escribe tu *colonia* TAL CUAL aparece en tu comprobante de domicilio.");
          await sendText(waId, reply, { senderPhoneNumberId: inboundPhoneNumberId });
          await saveOutgoingMessage({ waId, text: reply });
          return res.sendStatus(200);
        }

        const normalizedColonia = PUEBLA_COVERAGE_COLONIAS.length ? tryMatchPueblaColonia(colonia) : null;
        if (PUEBLA_COVERAGE_COLONIAS.length && !normalizedColonia) {
          const reply =
            "Actualmente no tenemos cobertura en esa colonia de *Puebla*.\n\n" +
            "Te voy a dejar *suscrito* para recibir consejos semanales para tu negocio por WhatsApp y avisarte cuando tengamos cobertura.\n\n" +
            "Si prefieres regresar al menú principal, escribe: *MENÚ*";
          await updateConversationState(waId, {
            stage: "start",
            lastIntent: "SALUDO",
            slots: {},
            subscriptionStatus: "SUSCRITO",
            subscriptionOfferPending: false
          });
          await sendText(waId, reply, { senderPhoneNumberId: inboundPhoneNumberId });
          await saveOutgoingMessage({ waId, text: reply });
          return res.sendStatus(200);
        }

        const nextSlots = {
          ...(convSlots || {}),
          preSolicitud: { ...((convSlots as any)?.preSolicitud || {}), ciudad: "Puebla", colonia: normalizedColonia || colonia }
        };
        const coloniaDisplay = normalizedColonia || colonia;
        const reply = withExit(
          `✅ Cobertura validada en la colonia *${coloniaDisplay}*.\n\n` +
          "Ahora envíame 3 fotos de tu negocio (por fuera y adentro)."
        );
        await updateConversationState(waId, { stage: "PRE_SOLICITUD:espera_fotos_negocio", slots: nextSlots });
        await sendText(waId, reply, { senderPhoneNumberId: inboundPhoneNumberId });
        await saveOutgoingMessage({ waId, text: reply });
        const apiRes = await sendButtons(
          waId,
          "Si la colonia no es correcta, puedes corregirla aquí:",
          [
            { id: "PUE_CORREGIR", title: "Corregir colonia" },
            { id: "PUE_FOTOS", title: "Enviar fotos" },
            { id: "NAV_MENU", title: "Menú" }
          ],
          { senderPhoneNumberId: inboundPhoneNumberId }
        );
        const outId = apiRes?.messages?.[0]?.id;
        await saveOutgoingMessage({
          waId,
          text: formatInteractive("Si la colonia no es correcta, puedes corregirla aquí:", [
            { id: "PUE_CORREGIR", title: "Corregir colonia" },
            { id: "PUE_FOTOS", title: "Enviar fotos" },
            { id: "NAV_MENU", title: "Menú" }
          ]),
          messageId: outId,
          type: "interactive"
        });
        return res.sendStatus(200);
      }

      // Etapa: espera 3 fotos del negocio
      if (current === "PRE_SOLICITUD:espera_fotos_negocio") {
        if (interactiveBtnId === "PUE_CORREGIR") {
          const preSolicitud = (convSlots as any)?.preSolicitud;
          const isPuebla = String(preSolicitud?.ciudad || "") === "Puebla";
          if (isPuebla) {
            await updateConversationState(waId, { stage: "PRE_SOLICITUD:espera_colonia_puebla" });
            const reply = withExit("Ok. Vuelve a escribir tu *colonia* TAL CUAL aparece en tu comprobante de domicilio.");
            await sendText(waId, reply, { senderPhoneNumberId: inboundPhoneNumberId });
            await saveOutgoingMessage({ waId, text: reply });
            return res.sendStatus(200);
          }
        }
        if (interactiveBtnId === "PUE_FOTOS") {
          const reply = withExit("Perfecto. Envía 3 fotos de tu negocio (por fuera y adentro).");
          await sendText(waId, reply, { senderPhoneNumberId: inboundPhoneNumberId });
          await saveOutgoingMessage({ waId, text: reply });
          return res.sendStatus(200);
        }

        if (msg.type === "image") {
          const currentCount = convSlots?.prev?.negocioFotos || 0;
          const nextCount = currentCount + 1;
          const nextSlots = { ...(convSlots || {}), prev: { ...(convSlots?.prev || {}), negocioFotos: nextCount } };

          if (nextCount >= 3) {
            await updateConversationState(waId, { stage: "PRE_SOLICITUD:espera_ine_frente", slots: nextSlots });
            const reply = withExit("Perfecto ✅. Ahora envíame foto de tu INE por delante.");
            await sendText(waId, reply, { senderPhoneNumberId: inboundPhoneNumberId });
            await saveOutgoingMessage({ waId, text: reply });
          } else {
            await updateConversationState(waId, { stage: "PRE_SOLICITUD:espera_fotos_negocio", slots: nextSlots });
            const reply = withExit(`Gracias. Llevas ${nextCount} de 3 fotos. Envía otra.`);
            await sendText(waId, reply, { senderPhoneNumberId: inboundPhoneNumberId });
            await saveOutgoingMessage({ waId, text: reply });
          }
          return res.sendStatus(200);
        } else {
          const reply = withExit("Para continuar, envía 3 fotos de tu negocio (por fuera y adentro).");
          await sendText(waId, reply, { senderPhoneNumberId: inboundPhoneNumberId });
          await saveOutgoingMessage({ waId, text: reply });
          return res.sendStatus(200);
        }
      }

      // Etapa: espera INE por delante
      if (current === "PRE_SOLICITUD:espera_ine_frente") {
        if (msg.type === "image") {
          const nextSlots = { ...(convSlots || {}), prev: { ...(convSlots?.prev || {}), ineFrente: true } };
          await updateConversationState(waId, { stage: "PRE_SOLICITUD:espera_ine_atras", slots: nextSlots });
          const reply = withExit("Gracias ✅. Ahora envíame foto de tu INE por atrás.");
          await sendText(waId, reply, { senderPhoneNumberId: inboundPhoneNumberId });
          await saveOutgoingMessage({ waId, text: reply });
          return res.sendStatus(200);
        } else {
          const reply = withExit("Por favor, envía la foto de tu INE por delante para continuar.");
          await sendText(waId, reply, { senderPhoneNumberId: inboundPhoneNumberId });
          await saveOutgoingMessage({ waId, text: reply });
          return res.sendStatus(200);
        }
      }

      // Etapa: espera INE por atrás
      if (current === "PRE_SOLICITUD:espera_ine_atras") {
        if (msg.type === "image") {
          const nextSlots = { ...(convSlots || {}), prev: { ...(convSlots?.prev || {}), ineAtras: true } };
          await updateConversationState(waId, { stage: "PRE_SOLICITUD:espera_comprobante", slots: nextSlots });
          const reply = withExit("Gracias ✅. Por último, envíame FOTO o PDF de tu Comprobante de Domicilio.");
          await sendText(waId, reply, { senderPhoneNumberId: inboundPhoneNumberId });
          await saveOutgoingMessage({ waId, text: reply });
          return res.sendStatus(200);
        } else {
          const reply = withExit("Falta la foto del INE por atrás para continuar.");
          await sendText(waId, reply, { senderPhoneNumberId: inboundPhoneNumberId });
          await saveOutgoingMessage({ waId, text: reply });
          return res.sendStatus(200);
        }
      }

      // Etapa: espera comprobante de domicilio (FINAL)
      if (current === "PRE_SOLICITUD:espera_comprobante") {
        const isImage = msg.type === "image";
        const isPdfDoc = msg.type === "document" && typeof (msg as any)?.document?.mime_type === "string" && (msg as any).document.mime_type.toLowerCase().includes("pdf");
        
        if (isImage || isPdfDoc) {
          const nextSlots = { ...(convSlots || {}), prev: { ...(convSlots?.prev || {}), comprobante: true } };
          
          // AQUÍ SE GUARDA EL ESTATUS PERMANENTE
          await updateConversationState(waId, { 
             stage: "ASESOR",
             lastIntent: "ASESOR",
             verificationStatus: "PRE_SOLICITUD_COMPLETA",
             slots: nextSlots 
          });

          const doneMsg = "✅ ¡Documentación completa! Tu estatus ahora es *PRE_SOLICITUD_COMPLETA*.\n\nUn asesor revisará tu información pronto.";
          await sendText(waId, doneMsg, { senderPhoneNumberId: inboundPhoneNumberId });
          await saveOutgoingMessage({ waId, text: doneMsg });
          return res.sendStatus(200);
        }

        const reply = withExit("Para finalizar, envía foto del comprobante de domicilio o un archivo PDF.");
        await sendText(waId, reply, { senderPhoneNumberId: inboundPhoneNumberId });
        await saveOutgoingMessage({ waId, text: reply });
        return res.sendStatus(200);
      }
    }

    // const intent = detectIntent(text); // Ya detectado arriba
    
    // IMPORTANTE: Solo la intención PRE_SOLICITUD (Opción 4) debe cambiar el stage de la conversación.
    // Otras intenciones informativas (como REQUISITOS - Opción 1) NO deben alterar el stage, solo responder.
    if (intent === "PRE_SOLICITUD" && !stage.startsWith("PRE_SOLICITUD")) {
      await updateConversationState(waId, { stage: "PRE_SOLICITUD:aviso_privacidad", lastIntent: intent });
      const apiRes = await sendConsentButtons(waId, { senderPhoneNumberId: inboundPhoneNumberId });
      const outId = apiRes?.messages?.[0]?.id;
      await saveOutgoingMessage({ waId, text: formatInteractive(CONSENT_BODY_TEXT, CONSENT_BUTTONS), messageId: outId, type: "interactive" });
      return res.sendStatus(200);
    }

    if (intent === "SALUDO") {
      await sendMainMenu();
      return res.sendStatus(200);
    }
    if (intent === "FAQ_MENU") {
      await sendFaqMenu(1);
      return res.sendStatus(200);
    }

    if (intent === "UNKNOWN" && !stage.startsWith("ENGAGE") && !stage.startsWith("PRE_SOLICITUD")) {
      const msg = "Ups, no te entendí del todo. Para ayudarte mejor, elige una opción aquí abajo 👇";
      await sendText(waId, msg, { senderPhoneNumberId: inboundPhoneNumberId });
      await saveOutgoingMessage({ waId, text: msg });
      await sendMainMenu();
      return res.sendStatus(200);
    }

    const reply = buildReply(intent);
    console.log("Intentando responder a:", waId, "con:", reply);
    await sendText(waId, reply, { senderPhoneNumberId: inboundPhoneNumberId });
    console.log("Mensaje enviado a WhatsApp API");
    await saveOutgoingMessage({ waId, text: reply });
    await updateConversationState(waId, { lastIntent: intent });

    if (!stage.startsWith("ENGAGE") && !stage.startsWith("PRE_SOLICITUD")) {
      const apiRes = await sendButtons(
        waId,
        "¿Qué quieres hacer ahora?",
        [
          { id: "MENU_PRE", title: "Pre-solicitud ✅" },
          { id: "MENU_FAQ", title: "Preguntas 📌" },
          { id: "NAV_MENU", title: "Menú" }
        ],
        { senderPhoneNumberId: inboundPhoneNumberId }
      );
      const outId = apiRes?.messages?.[0]?.id;
      await saveOutgoingMessage({
        waId,
        text: formatInteractive("¿Qué quieres hacer ahora?", [
          { id: "MENU_PRE", title: "Pre-solicitud ✅" },
          { id: "MENU_FAQ", title: "Preguntas 📌" },
          { id: "NAV_MENU", title: "Menú" }
        ]),
        messageId: outId,
        type: "interactive"
      });
    }

    return res.sendStatus(200);
  } catch (err: any) {
    console.error("webhook error:", err?.response?.data || err);
    return res.sendStatus(200);
  }
}
