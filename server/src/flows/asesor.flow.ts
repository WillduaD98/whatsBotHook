// Flujo de "asesor" (estado ASESOR/HUMANO): mientras la conversación está en este estado,
// el bot NO responde automáticamente salvo un puñado de escapes explícitos (menú, FAQ,
// pre-solicitud, (des)suscripción). Invocado desde webhookController cuando stage === "ASESOR".
import { sendText } from "../services/whatsapp.service.js";
import { saveOutgoingMessage, updateConversationState } from "../services/context.service.js";
import { detectIntent } from "../services/router.service.js";
import { enterPreSolicitud } from "./preSolicitud.flow.js";

type SendOpts = { senderPhoneNumberId?: string | undefined };

export type AsesorFlowResult = { handled: boolean; goToMainMenu?: boolean; goToFaqMenu?: boolean };

// Máquina de estados de ASESOR. Se invoca solo cuando stage === "ASESOR".
export async function handleAsesorFlow(params: {
  waId: string;
  text: string;
  interactiveBtnId?: string | undefined;
  wantsUnsubscribe: boolean;
  wantsSubscribe: boolean;
  unsubscribeReply: string;
  exitCandidate: string;
  senderPhoneNumberId?: string | undefined;
}): Promise<AsesorFlowResult> {
  const { waId, text, interactiveBtnId, wantsUnsubscribe, wantsSubscribe, unsubscribeReply, exitCandidate } = params;
  const opts: SendOpts = { senderPhoneNumberId: params.senderPhoneNumberId };

  if (interactiveBtnId === "NAV_MENU") {
    return { handled: true, goToMainMenu: true };
  }
  if (interactiveBtnId === "NAV_FAQ" || interactiveBtnId === "MENU_FAQ") {
    return { handled: true, goToFaqMenu: true };
  }
  if (interactiveBtnId === "MENU_PRE") {
    // Se usa la misma entrada que el resto del bot, para que aquí también aplique la bandera
    // PRE_SOLICITUD_ENABLED. No se pasan slots: los slots de la conversación se reinician a propósito
    // (decisión del usuario: entrar a pre-solicitud desde ASESOR es un reinicio intencional del cliente;
    // si hace falta, el estado se corrige desde el panel).
    await enterPreSolicitud(waId, opts);
    return { handled: true };
  }

  if (wantsUnsubscribe) {
    await updateConversationState(waId, { subscriptionStatus: "NO_SUSCRITO", subscriptionOfferPending: false });
    await sendText(waId, unsubscribeReply, opts);
    await saveOutgoingMessage({ waId, text: unsubscribeReply });
    return { handled: true };
  }
  if (wantsSubscribe) {
    await updateConversationState(waId, { subscriptionStatus: "SUSCRITO", subscriptionOfferPending: false });
    return { handled: true };
  }
  if (exitCandidate.includes("menu") || exitCandidate.includes("regres") || detectIntent(text) === "SALUDO") {
    return { handled: true, goToMainMenu: true };
  }

  console.log(`[ASESOR] Bot silenciado para waId: ${waId}. Esperando intervención humana.`);
  return { handled: true };
}
