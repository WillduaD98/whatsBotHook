// Flujo de "asesor" (estado ASESOR/HUMANO): mientras la conversación está en este estado,
// el bot NO responde automáticamente salvo un puñado de escapes explícitos (menú, FAQ,
// pre-solicitud, (des)suscripción). Invocado desde webhookController cuando stage === "ASESOR".
import { CONSENT_BODY_TEXT, CONSENT_BUTTONS, sendConsentButtons, sendText } from "../services/whatsapp.service.js";
import { saveOutgoingMessage, updateConversationState } from "../services/context.service.js";
import { detectIntent } from "../services/router.service.js";

type SendOpts = { senderPhoneNumberId?: string | undefined };

export type AsesorFlowResult = { handled: boolean; goToMainMenu?: boolean; goToFaqMenu?: boolean };

function formatInteractiveForLog(body: string, buttons: Array<{ id: string; title: string }>): string {
  return `${body}\n\nOpciones: ${buttons.map((b) => b.title).join(" | ")}`;
}

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
    await updateConversationState(waId, { stage: "PRE_SOLICITUD:aviso_privacidad", lastIntent: "PRE_SOLICITUD" });
    const apiRes = await sendConsentButtons(waId, opts);
    const outId = apiRes?.messages?.[0]?.id;
    await saveOutgoingMessage({ waId, text: formatInteractiveForLog(CONSENT_BODY_TEXT, CONSENT_BUTTONS), messageId: outId, type: "interactive" });
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
