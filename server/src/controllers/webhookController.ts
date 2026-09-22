// Controlador del webhook: encapsula la lógica de negocio y respuesta HTTP
// Mantiene separadas las preocupaciones respecto a las rutas (routing y middlewares)

// Importa tipos de Express para tipar objetos de request/response
import { Request, Response } from "express";
// Importa variables de entorno (token de verificación, etc.)
import { env } from "../config/env.js";
// Importaciones de middlewares solo como referencia del flujo; se aplican en las rutas

// Servicio de envío de mensajes de texto por WhatsApp (Graph API)
import { CLIENTE_SOY_BUTTON, sendButtons, sendText } from "../services/whatsapp.service.js";
// Servicios de enrutamiento semántico: detección de intención y construcción de respuestas
import { detectIntent, buildReply, isClienteText } from "../services/router.service.js";
// Flujo de cliente: máquina de estados del menú de cliente (datos para pagar / menú principal)
import { enterClienteMenu, handleClienteFlow } from "../flows/cliente.flow.js";
// Flujo de consejo semanal: detección de la acción y envío del consejo activo + imágenes
import { weeklyTipActionFromMessage, sendActiveWeeklyTipImages } from "../flows/weeklyTip.flow.js";
// Flujo de ubicación: procesa mensajes de tipo "location" y clasifica cobertura por coordenadas
import { handleLocationFlow } from "../flows/location.flow.js";
// Flujo de asesor: estado ASESOR/HUMANO donde el bot no responde automáticamente salvo escapes
import { handleAsesorFlow } from "../flows/asesor.flow.js";
// Flujo de FAQ: menú de preguntas frecuentes (2 páginas) y respuestas a cada opción
import { sendFaqMenu, handleFaqFlow } from "../flows/faq.flow.js";
// Flujo de engage: califica en 3 preguntas rápidas antes de mandar a Pre-Solicitud
import { enterEngageFlow, handleEngageFlow } from "../flows/engage.flow.js";
// Flujo de Pre-Solicitud: consentimiento, cobertura y captura secuencial de documentos
import { enterPreSolicitud, handlePreSolicitudFlow } from "../flows/preSolicitud.flow.js";
// Servicios de contexto/conversación: upsert de conversación y persistencia de mensajes
import { upsertConversation, saveIncomingMessage, saveOutgoingMessage, updateConversationState, updateMessageStatusByWamid } from "../services/context.service.js";
// Servicios de waId: normalización del número y extracción desde el cuerpo del webhook
import { normalizeTo } from "../services/waid.service.js";

import { getMediaUrl, downloadMedia } from "../services/media.service.js";

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
          for (const s of v.statuses) {
            try {
              await updateMessageStatusByWamid(String(s?.id || ""), String(s?.status || ""));
            } catch (err) {
              console.error("[whatsapp] status update error:", err);
            }
          }
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
      await handleLocationFlow({ waId, lat, lon, messageId, senderPhoneNumberId: inboundPhoneNumberId });
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
        { id: "MENU_FAQ", title: "Tengo dudas 📌" },
        CLIENTE_SOY_BUTTON
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
      const asesorResult = await handleAsesorFlow({
        waId,
        text,
        interactiveBtnId,
        wantsUnsubscribe,
        wantsSubscribe,
        unsubscribeReply,
        exitCandidate,
        senderPhoneNumberId: inboundPhoneNumberId
      });
      if (asesorResult.goToMainMenu) {
        await sendMainMenu();
        return res.sendStatus(200);
      }
      if (asesorResult.goToFaqMenu) {
        await sendFaqMenu(waId, 1, { senderPhoneNumberId: inboundPhoneNumberId });
        return res.sendStatus(200);
      }
      if (asesorResult.handled) {
        return res.sendStatus(200);
      }
    }

    if (interactiveBtnId === "NAV_MENU") {
      await sendMainMenu();
      return res.sendStatus(200);
    }
    if (interactiveBtnId === "NAV_FAQ") {
      await sendFaqMenu(waId, 1, { senderPhoneNumberId: inboundPhoneNumberId });
      return res.sendStatus(200);
    }

    // --- FLUJO CLIENTE (sin opción de asesor) ---
    if (interactiveBtnId === "CLIENTE_SOY") {
      await enterClienteMenu(waId, { senderPhoneNumberId: inboundPhoneNumberId });
      return res.sendStatus(200);
    }

    if (stage.startsWith("CLIENTE:")) {
      const clienteResult = await handleClienteFlow({
        waId,
        stage,
        type,
        text,
        interactiveBtnId,
        slots: conv?.slots,
        senderPhoneNumberId: inboundPhoneNumberId,
        mediaUrl,
        mimeType
      });
      if (clienteResult.goToMainMenu) {
        await sendMainMenu();
        return res.sendStatus(200);
      }
      if (clienteResult.handled) {
        return res.sendStatus(200);
      }
    }

    if (stage.startsWith("FAQ_MENU")) {
      const faqResult = await handleFaqFlow({
        waId,
        stage,
        type,
        interactiveBtnId,
        senderPhoneNumberId: inboundPhoneNumberId
      });
      if (faqResult.handled) {
        return res.sendStatus(200);
      }
    }

    if (!stage.startsWith("ENGAGE") && !stage.startsWith("PRE_SOLICITUD")) {
      if (type !== "interactive" && isClienteText(text)) {
        await enterClienteMenu(waId, { senderPhoneNumberId: inboundPhoneNumberId });
        return res.sendStatus(200);
      }
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
      await sendFaqMenu(waId, 1, { senderPhoneNumberId: inboundPhoneNumberId });
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
      await enterEngageFlow(waId, { slots: conv?.slots, senderPhoneNumberId: inboundPhoneNumberId });
      return res.sendStatus(200);
    }

    // Manejo del flujo ENGAGE
    if (stage.startsWith("ENGAGE")) {
      const engageResult = await handleEngageFlow({
        waId,
        stage,
        text,
        interactiveBtnId,
        slots: conv?.slots,
        senderPhoneNumberId: inboundPhoneNumberId
      });
      if (engageResult.goToMainMenu) {
        await sendMainMenu();
        return res.sendStatus(200);
      }
      if (engageResult.handled) {
        return res.sendStatus(200);
      }
    }

    const inPreVerifFlow = stage.startsWith("PRE_SOLICITUD") || lastIntent === "PRE_SOLICITUD";

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
        await enterPreSolicitud(waId, { slots: conv?.slots, senderPhoneNumberId: inboundPhoneNumberId });
        return res.sendStatus(200);
      }
      const preResult = await handlePreSolicitudFlow({
        waId,
        stage,
        text,
        interactiveBtnId,
        acceptedPrivacy,
        type,
        documentMimeType: (msg as any)?.document?.mime_type,
        slots: conv?.slots,
        senderPhoneNumberId: inboundPhoneNumberId
      });
      if (preResult.goToMainMenu) {
        await sendMainMenu();
        return res.sendStatus(200);
      }
      if (preResult.handled) {
        return res.sendStatus(200);
      }
    }

    // const intent = detectIntent(text); // Ya detectado arriba
    
    // IMPORTANTE: Solo la intención PRE_SOLICITUD (Opción 4) debe cambiar el stage de la conversación.
    // Otras intenciones informativas (como REQUISITOS - Opción 1) NO deben alterar el stage, solo responder.
    if (intent === "PRE_SOLICITUD" && !stage.startsWith("PRE_SOLICITUD")) {
      await enterPreSolicitud(waId, { slots: conv?.slots, senderPhoneNumberId: inboundPhoneNumberId });
      return res.sendStatus(200);
    }

    if (intent === "SALUDO") {
      await sendMainMenu();
      return res.sendStatus(200);
    }
    if (intent === "FAQ_MENU") {
      await sendFaqMenu(waId, 1, { senderPhoneNumberId: inboundPhoneNumberId });
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
