// Flujo de ubicación: procesa un mensaje de tipo "location" (lat/lon), clasifica cobertura
// por coordenadas y avanza el stage si el usuario está en Pre-Solicitud esperando ubicación.
import { classifyCoords, isValidCoords } from "../services/geo.service.js";
import { upsertConversation, saveIncomingMessage, saveOutgoingMessage, updateConversationState } from "../services/context.service.js";
import { sendText } from "../services/whatsapp.service.js";

export type LocationFlowResult = { handled: boolean };

export async function handleLocationFlow(params: {
  waId: string;
  lat: number;
  lon: number;
  messageId?: string | undefined;
  senderPhoneNumberId?: string | undefined;
}): Promise<LocationFlowResult> {
  const { waId, lat, lon, messageId, senderPhoneNumberId } = params;
  const opts = { senderPhoneNumberId };

  if (!isValidCoords(lat, lon)) {
    await sendText(waId, "Ubicación inválida. Verifica latitud/longitud.", opts);
    return { handled: true };
  }

  const conv = await upsertConversation(waId);
  try {
    await saveIncomingMessage({ waId, text: `ubicacion: lat=${lat}, lon=${lon}`, ...(messageId ? { messageId } : {}) });
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
      await sendText(waId, reply, opts);
      await saveOutgoingMessage({ waId, text: reply });
      return { handled: true };
    } else {
      // SI_COBERTURA o REVISAR_ASESOR -> Avanzamos
      const reply = "✅ Cobertura validada.\n\nAhora envíame 3 fotos de tu negocio (por fuera y adentro).";
      await updateConversationState(waId, { stage: "PRE_SOLICITUD:espera_fotos_negocio" });
      await sendText(waId, reply, opts);
      await saveOutgoingMessage({ waId, text: reply });
      return { handled: true };
    }
  }

  // Respuesta genérica si envía ubicación fuera de flujo
  const reply = `Ubicación recibida. Estado de cobertura: ${status}`;
  await sendText(waId, reply, opts);
  await saveOutgoingMessage({ waId, text: reply });
  return { handled: true };
}
