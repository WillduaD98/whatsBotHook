// Flujo de "Pre-Solicitud": aviso de privacidad, validación de cobertura (ciudad/ubicación/
// colonia de Puebla), y captura secuencial de fotos del negocio, INE (frente/atrás) y
// comprobante de domicilio. Invocado desde webhookController para el entry de consentimiento
// y para cualquier stage "PRE_SOLICITUD:*".
import { sendText, sendButtons, sendConsentButtons, CONSENT_BODY_TEXT, CONSENT_BUTTONS } from "../services/whatsapp.service.js";
import { upsertConversation, saveOutgoingMessage, updateConversationState } from "../services/context.service.js";
import { cityTokens, tryMatchCoverageCity, tryMatchPueblaColonia, PUEBLA_COVERAGE_COLONIAS } from "../services/coverage.service.js";
import { classifyCoords, isValidCoords } from "../services/geo.service.js";
import { env } from "../config/env.js";

const PRE_SOLICITUD_NO_DISPONIBLE_TEXT = "La pre-solicitud no está disponible por el momento. Puedes elegir otra opción del menú.";

type SendOpts = { senderPhoneNumberId?: string | undefined };

export type PreSolicitudFlowResult = { handled: boolean; goToMainMenu?: boolean };

// Nota: consolidarlos en un util compartido queda para el Paso 5; por ahora una copia local,
// como hacen los demás flows autocontenidos.
function formatInteractive(body: string, buttons: Array<{ id: string; title: string }>) {
  const opts = buttons.map((b) => b.title).join(" | ");
  return `${body}\n\nOpciones: ${opts}`;
}

// Helper para anexar recordatorio de salida al menú principal durante Pre-Solicitud
function withExit(msg: string) {
  return `${msg}\n\nEscribe 'Regresar' o 'MENÚ' para volver al menú principal.`;
}

// Entry de consentimiento: manda el aviso de privacidad y fija stage "PRE_SOLICITUD:aviso_privacidad".
// Unifica los tres puntos de entrada de consentimiento del controller. Diferencia menor y segura:
// algún entry anterior no inicializaba slots.prev; ahora sí, pero prev se re-inicializa al aceptar
// privacidad, así que es inofensivo.
export async function enterPreSolicitud(
  waId: string,
  opts?: { slots?: any; senderPhoneNumberId?: string | undefined }
): Promise<void> {
  // Pre-solicitud apagada (PRE_SOLICITUD_ENABLED=0): no se deja entrar y el stage no cambia.
  // Aquí pasan todas las entradas nuevas (menú, texto e intent, y el botón desde ASESOR); los flujos
  // que ya iban a medias no pasan por aquí, así que terminan normal.
  if (!env.PRE_SOLICITUD_ENABLED) {
    await sendText(waId, PRE_SOLICITUD_NO_DISPONIBLE_TEXT, { senderPhoneNumberId: opts?.senderPhoneNumberId });
    await saveOutgoingMessage({ waId, text: PRE_SOLICITUD_NO_DISPONIBLE_TEXT });
    // lastIntent vuelve a 'SALUDO' (sin tocar el stage) porque el controller manda aquí toda conversación con
    // lastIntent 'PRE_SOLICITUD', y ese chequeo va antes del saludo y del menú. Sin este reinicio, cada mensaje,
    // incluso "hola", recibiría "no disponible" para siempre y el cliente nunca llegaría al menú.
    await updateConversationState(waId, { lastIntent: "SALUDO" });
    return;
  }

  await updateConversationState(waId, {
    stage: "PRE_SOLICITUD:aviso_privacidad",
    lastIntent: "PRE_SOLICITUD",
    slots: { ...(opts?.slots || {}), prev: { negocioFotos: 0, ineFrente: false, ineAtras: false, comprobante: false, ubicacion: false } }
  });
  const apiRes = await sendConsentButtons(waId, { senderPhoneNumberId: opts?.senderPhoneNumberId });
  const outId = apiRes?.messages?.[0]?.id;
  await saveOutgoingMessage({ waId, text: formatInteractive(CONSENT_BODY_TEXT, CONSENT_BUTTONS), messageId: outId, type: "interactive" });
}

// Máquina de estados de PRE_SOLICITUD:*. Se invoca cuando ya se aceptó/inició el flujo
// (stage.startsWith("PRE_SOLICITUD")). Devuelve { handled: false } si el stage actual no
// coincide con ninguna sub-etapa conocida (el controller entonces continúa con su dispatch
// general de intents).
export async function handlePreSolicitudFlow(params: {
  waId: string;
  stage: string;
  text: string;
  interactiveBtnId?: string | undefined;
  acceptedPrivacy: boolean;
  type: string;
  documentMimeType?: string | undefined;
  slots: any;
  senderPhoneNumberId?: string | undefined;
}): Promise<PreSolicitudFlowResult> {
  const { waId, stage, text, interactiveBtnId, acceptedPrivacy, type, documentMimeType, slots } = params;
  const opts: SendOpts = { senderPhoneNumberId: params.senderPhoneNumberId };

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
    await sendText(waId, exitMsg, opts);
    // Persiste el mensaje saliente
    await saveOutgoingMessage({ waId, text: exitMsg });
    return { handled: true, goToMainMenu: true };
  }

  // Relee la conversación actual por si se inicializó arriba; usa sus slots actualizados
  const currentConv = await upsertConversation(waId);
  const current = currentConv?.stage || stage;
  const convSlots = currentConv?.slots || slots || {};

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
      await sendText(waId, intro, opts);
      await saveOutgoingMessage({ waId, text: intro });
      const apiRes = await sendButtons(
        waId,
        "¿Cómo quieres validar tu cobertura?",
        [
          { id: "PRE_CIUDAD", title: "Escribir ciudad" },
          { id: "PRE_UBI", title: "Enviar ubicación" },
          { id: "NAV_MENU", title: "Menú" }
        ],
        opts
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
      return { handled: true };
    }

    const apiRes = await sendConsentButtons(waId, opts);
    const outId = apiRes?.messages?.[0]?.id;
    await saveOutgoingMessage({ waId, text: formatInteractive(CONSENT_BODY_TEXT, CONSENT_BUTTONS), messageId: outId, type: "interactive" });
    return { handled: true };
  }

  // Etapa: espera ubicación (fallback JSON si no envía attachment)
  if (current === "PRE_SOLICITUD:espera_ubicacion") {
    if (interactiveBtnId === "PRE_CIUDAD") {
      const reply = withExit("Perfecto. Escribe *SOLO* el nombre de tu ciudad (sin calle/colonia ni Estado).");
      await sendText(waId, reply, opts);
      await saveOutgoingMessage({ waId, text: reply });
      return { handled: true };
    }
    if (interactiveBtnId === "PRE_UBI") {
      const reply = withExit(
        "Perfecto. Envía tu ubicación actual:\n\n" + "(Clip 📎 o '+' -> Ubicación -> Enviar mi ubicación actual)"
      );
      await sendText(waId, reply, opts);
      await saveOutgoingMessage({ waId, text: reply });
      return { handled: true };
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
              await sendText(waId, reply, opts);
              await saveOutgoingMessage({ waId, text: reply });
              return { handled: true };
           } else {
              // SI_COBERTURA
              const reply = "✅ Cobertura validada.\n\nAhora envíame 3 fotos de tu negocio (por fuera y adentro).";
              await updateConversationState(waId, { stage: "PRE_SOLICITUD:espera_fotos_negocio" });
              await sendText(waId, reply, opts);
              await saveOutgoingMessage({ waId, text: reply });
              return { handled: true };
           }
        } else {
           const invalidMsg = withExit("Ubicación inválida. Verifica latitud/longitud.");
           await sendText(waId, invalidMsg, opts);
           await saveOutgoingMessage({ waId, text: invalidMsg });
           return { handled: true };
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
        await sendText(waId, reply, opts);
        await saveOutgoingMessage({ waId, text: reply });
        return { handled: true };
      }

      const reply = withExit(`✅ Cobertura validada en *${matchedCity}*.\n\nAhora envíame 3 fotos de tu negocio (por fuera y adentro).`);
      await updateConversationState(waId, { stage: "PRE_SOLICITUD:espera_fotos_negocio" });
      await sendText(waId, reply, opts);
      await saveOutgoingMessage({ waId, text: reply });
      return { handled: true };
    }

    const tokens = cityTokens(text || "");
    if (tokens.length > 0 && tokens.length <= 12) {
      const reply = withExit(
        "🙋‍♂️ Por ahora no tenemos cobertura en esa ciudad.\n\n" +
        "Si quieres verificarlo mejor, envíame tu ubicación actual (clip 📎 -> Ubicación -> Enviar mi ubicación actual) " +
        "o escribe SOLO el nombre de tu ciudad (sin calle/colonia)."
      );
      await sendText(waId, reply, opts);
      await saveOutgoingMessage({ waId, text: reply });
      return { handled: true };
    }

    const reply = withExit("Para validar cobertura, envíame tu ubicación actual (clip 📎 -> Ubicación -> Enviar mi ubicación actual) o escribe SOLO el nombre de tu ciudad.");
    await sendText(waId, reply, opts);
    await saveOutgoingMessage({ waId, text: reply });
    return { handled: true };
  }

  if (current === "PRE_SOLICITUD:espera_colonia_puebla") {
    const colonia = String(text || "").trim();
    if (!colonia) {
      const reply = withExit("Para continuar, escribe tu *colonia* TAL CUAL aparece en tu comprobante de domicilio.");
      await sendText(waId, reply, opts);
      await saveOutgoingMessage({ waId, text: reply });
      return { handled: true };
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
      await sendText(waId, reply, opts);
      await saveOutgoingMessage({ waId, text: reply });
      return { handled: true };
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
    await sendText(waId, reply, opts);
    await saveOutgoingMessage({ waId, text: reply });
    const apiRes = await sendButtons(
      waId,
      "Si la colonia no es correcta, puedes corregirla aquí:",
      [
        { id: "PUE_CORREGIR", title: "Corregir colonia" },
        { id: "PUE_FOTOS", title: "Enviar fotos" },
        { id: "NAV_MENU", title: "Menú" }
      ],
      opts
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
    return { handled: true };
  }

  // Etapa: espera 3 fotos del negocio
  if (current === "PRE_SOLICITUD:espera_fotos_negocio") {
    if (interactiveBtnId === "PUE_CORREGIR") {
      const preSolicitud = (convSlots as any)?.preSolicitud;
      const isPuebla = String(preSolicitud?.ciudad || "") === "Puebla";
      if (isPuebla) {
        await updateConversationState(waId, { stage: "PRE_SOLICITUD:espera_colonia_puebla" });
        const reply = withExit("Ok. Vuelve a escribir tu *colonia* TAL CUAL aparece en tu comprobante de domicilio.");
        await sendText(waId, reply, opts);
        await saveOutgoingMessage({ waId, text: reply });
        return { handled: true };
      }
    }
    if (interactiveBtnId === "PUE_FOTOS") {
      const reply = withExit("Perfecto. Envía 3 fotos de tu negocio (por fuera y adentro).");
      await sendText(waId, reply, opts);
      await saveOutgoingMessage({ waId, text: reply });
      return { handled: true };
    }

    if (type === "image") {
      const currentCount = convSlots?.prev?.negocioFotos || 0;
      const nextCount = currentCount + 1;
      const nextSlots = { ...(convSlots || {}), prev: { ...(convSlots?.prev || {}), negocioFotos: nextCount } };

      if (nextCount >= 3) {
        await updateConversationState(waId, { stage: "PRE_SOLICITUD:espera_ine_frente", slots: nextSlots });
        const reply = withExit("Perfecto ✅. Ahora envíame foto de tu INE por delante.");
        await sendText(waId, reply, opts);
        await saveOutgoingMessage({ waId, text: reply });
      } else {
        await updateConversationState(waId, { stage: "PRE_SOLICITUD:espera_fotos_negocio", slots: nextSlots });
        const reply = withExit(`Gracias. Llevas ${nextCount} de 3 fotos. Envía otra.`);
        await sendText(waId, reply, opts);
        await saveOutgoingMessage({ waId, text: reply });
      }
      return { handled: true };
    } else {
      const reply = withExit("Para continuar, envía 3 fotos de tu negocio (por fuera y adentro).");
      await sendText(waId, reply, opts);
      await saveOutgoingMessage({ waId, text: reply });
      return { handled: true };
    }
  }

  // Etapa: espera INE por delante
  if (current === "PRE_SOLICITUD:espera_ine_frente") {
    if (type === "image") {
      const nextSlots = { ...(convSlots || {}), prev: { ...(convSlots?.prev || {}), ineFrente: true } };
      await updateConversationState(waId, { stage: "PRE_SOLICITUD:espera_ine_atras", slots: nextSlots });
      const reply = withExit("Gracias ✅. Ahora envíame foto de tu INE por atrás.");
      await sendText(waId, reply, opts);
      await saveOutgoingMessage({ waId, text: reply });
      return { handled: true };
    } else {
      const reply = withExit("Por favor, envía la foto de tu INE por delante para continuar.");
      await sendText(waId, reply, opts);
      await saveOutgoingMessage({ waId, text: reply });
      return { handled: true };
    }
  }

  // Etapa: espera INE por atrás
  if (current === "PRE_SOLICITUD:espera_ine_atras") {
    if (type === "image") {
      const nextSlots = { ...(convSlots || {}), prev: { ...(convSlots?.prev || {}), ineAtras: true } };
      await updateConversationState(waId, { stage: "PRE_SOLICITUD:espera_comprobante", slots: nextSlots });
      const reply = withExit("Gracias ✅. Por último, envíame FOTO o PDF de tu Comprobante de Domicilio.");
      await sendText(waId, reply, opts);
      await saveOutgoingMessage({ waId, text: reply });
      return { handled: true };
    } else {
      const reply = withExit("Falta la foto del INE por atrás para continuar.");
      await sendText(waId, reply, opts);
      await saveOutgoingMessage({ waId, text: reply });
      return { handled: true };
    }
  }

  // Etapa: espera comprobante de domicilio (FINAL)
  if (current === "PRE_SOLICITUD:espera_comprobante") {
    const isImage = type === "image";
    const isPdfDoc = type === "document" && typeof documentMimeType === "string" && documentMimeType.toLowerCase().includes("pdf");

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
      await sendText(waId, doneMsg, opts);
      await saveOutgoingMessage({ waId, text: doneMsg });
      return { handled: true };
    }

    const reply = withExit("Para finalizar, envía foto del comprobante de domicilio o un archivo PDF.");
    await sendText(waId, reply, opts);
    await saveOutgoingMessage({ waId, text: reply });
    return { handled: true };
  }

  return { handled: false };
}
