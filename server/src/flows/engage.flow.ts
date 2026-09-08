// Flujo de "engage" (ENGAGE:q1/q2/q3): califica en 3 preguntas rápidas si el usuario puede
// aplicar al crédito, antes de mandarlo a Pre-Solicitud. Invocado desde webhookController
// para el trigger de entrada (APLICO/INFORMACIÓN) y para cualquier stage "ENGAGE:*".
import { sendText, sendButtons } from "../services/whatsapp.service.js";
import { saveOutgoingMessage, updateConversationState } from "../services/context.service.js";

export type EngageFlowResult = { handled: boolean; goToMainMenu?: boolean };

// Nota: consolidarlo en un util compartido queda para el Paso 5; por ahora una copia local,
// como hacen los demás flows autocontenidos.
function formatInteractive(body: string, buttons: Array<{ id: string; title: string }>) {
  const opts = buttons.map((b) => b.title).join(" | ");
  return `${body}\n\nOpciones: ${opts}`;
}

// Trigger de entrada al flujo ENGAGE ("APLICO" o mensajes de información). Manda el intro
// y los botones de la pregunta 1, y fija stage "ENGAGE:q1".
export async function enterEngageFlow(
  waId: string,
  opts?: { slots?: any; senderPhoneNumberId?: string | undefined }
): Promise<void> {
  const senderPhoneNumberId = opts?.senderPhoneNumberId;
  const initialSlots = { ...(opts?.slots || {}), engage: { q1: "", q2: "", q3: "" } };
  // Iniciamos en la pregunta 1
  await updateConversationState(waId, { stage: "ENGAGE:q1", lastIntent: "ENGAGE", slots: initialSlots });

  const intro =
    "¡Hola! 👋 Soy el asistente de *TandaYa*.\n\n" +
    "Te digo en *60 segundos* si puedes aplicar para el crédito para crecer tu negocio. ✅\n\n" +
    "*Solo para dueños de negocio* (no gastos personales).";
  await sendText(waId, intro, { senderPhoneNumberId });
  await saveOutgoingMessage({ waId, text: intro });

  const apiRes = await sendButtons(
    waId,
    "¿Listo para 3 preguntas rápidas? *(sin documentos)*",
    [
      { id: "ENG_Q1_YES", title: "Sí, va" },
      { id: "ENG_Q1_NO", title: "Solo viendo" },
      { id: "NAV_MENU", title: "Menú" }
    ],
    { senderPhoneNumberId }
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
}

// Máquina de estados de ENGAGE:*. Se invoca cuando stage.startsWith("ENGAGE").
export async function handleEngageFlow(params: {
  waId: string;
  stage: string;
  text: string;
  interactiveBtnId?: string | undefined;
  slots: any;
  senderPhoneNumberId?: string | undefined;
}): Promise<EngageFlowResult> {
  const { waId, stage, text, interactiveBtnId, slots } = params;
  const senderPhoneNumberId = params.senderPhoneNumberId;

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
      { senderPhoneNumberId }
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
      { senderPhoneNumberId }
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
      { senderPhoneNumberId }
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
      { senderPhoneNumberId }
    );
    const outId = apiRes?.messages?.[0]?.id;
    await saveOutgoingMessage({ waId, text: formatInteractive(body, buttons), messageId: outId, type: "interactive" });
  };

  const exitText = (text || "").trim().toLowerCase();
  if (exitText === "regresar" || exitText === "0") {
    await updateConversationState(waId, { stage: "start", lastIntent: "SALUDO", slots: {} });
    const exitMsg = "❌ Solicitud cancelada. Volvemos al menú principal.";
    await sendText(waId, exitMsg, { senderPhoneNumberId });
    await saveOutgoingMessage({ waId, text: exitMsg });
    return { handled: true, goToMainMenu: true };
  }

  const currentSlots = slots?.engage || {};

  if (stage === "ENGAGE:q1") {
    if (interactiveBtnId === "ENG_Q1_NO") {
      const rejectMsg = "Esto es solo para personas interesadas en crecer su negocio.";
      await sendText(waId, rejectMsg, { senderPhoneNumberId });
      await saveOutgoingMessage({ waId, text: rejectMsg });
      await updateConversationState(waId, { stage: "start", lastIntent: "SALUDO", slots: {} });
      return { handled: true, goToMainMenu: true };
    }
    if (interactiveBtnId !== "ENG_Q1_YES") {
      const errorMsg = "Por favor usa los botones para continuar.";
      await sendText(waId, errorMsg, { senderPhoneNumberId });
      await saveOutgoingMessage({ waId, text: errorMsg });
      await resendQ1();
      return { handled: true };
    }

    const nextSlots = { ...slots, engage: { ...currentSlots, q1: "Sí, va" } };
    await updateConversationState(waId, { stage: "ENGAGE:q2", slots: nextSlots });
    await resendQ2();
    return { handled: true };
  }

  if (stage === "ENGAGE:q2") {
    if (interactiveBtnId === "ENG_Q2_NO") {
      const rejectMsg = "Esto es solo para dueños de negocios.";
      await sendText(waId, rejectMsg, { senderPhoneNumberId });
      await saveOutgoingMessage({ waId, text: rejectMsg });
      await updateConversationState(waId, { stage: "start", lastIntent: "SALUDO", slots: {} });
      return { handled: true, goToMainMenu: true };
    }
    if (interactiveBtnId !== "ENG_Q2_YES") {
      const errorMsg = "Por favor usa los botones para continuar.";
      await sendText(waId, errorMsg, { senderPhoneNumberId });
      await saveOutgoingMessage({ waId, text: errorMsg });
      await resendQ2();
      return { handled: true };
    }

    const nextSlots = { ...slots, engage: { ...currentSlots, q2: "Sí" } };
    await updateConversationState(waId, { stage: "ENGAGE:q3:1", slots: nextSlots });
    await resendQ3Page1();
    return { handled: true };
  }

  const finishEngage = async (q3Value: string) => {
    const nextSlots = { ...slots, engage: { ...currentSlots, q3: q3Value } };
    await updateConversationState(waId, {
      stage: "start",
      lastIntent: "SALUDO",
      verificationStatus: "APLICACION_ENVIADA",
      slots: nextSlots
    });

    const finalMsg = "✅ *¡Gracias! Hemos recibido tu información.*\n\nAhora puedes iniciar tu pre-solicitud desde el menú.";
    await sendText(waId, finalMsg, { senderPhoneNumberId });
    await saveOutgoingMessage({ waId, text: finalMsg });
  };

  if (stage === "ENGAGE:q3:1") {
    if (interactiveBtnId === "ENG_Q3_MORE") {
      await updateConversationState(waId, { stage: "ENGAGE:q3:2" });
      await resendQ3Page2();
      return { handled: true };
    }
    if (interactiveBtnId === "ENG_Q3_LT6") {
      const rejectMsg = "Necesitas al menos 6 meses de operación.";
      await sendText(waId, rejectMsg, { senderPhoneNumberId });
      await saveOutgoingMessage({ waId, text: rejectMsg });
      await updateConversationState(waId, { stage: "start", lastIntent: "SALUDO", slots: {} });
      return { handled: true, goToMainMenu: true };
    }
    if (interactiveBtnId === "ENG_Q3_6_24") {
      await finishEngage("6 meses a 2 años");
      return { handled: true, goToMainMenu: true };
    }

    const errorMsg = "Por favor usa los botones para continuar.";
    await sendText(waId, errorMsg, { senderPhoneNumberId });
    await saveOutgoingMessage({ waId, text: errorMsg });
    await resendQ3Page1();
    return { handled: true };
  }

  if (stage === "ENGAGE:q3:2") {
    if (interactiveBtnId === "ENG_Q3_BACK") {
      await updateConversationState(waId, { stage: "ENGAGE:q3:1" });
      await resendQ3Page1();
      return { handled: true };
    }
    if (interactiveBtnId === "ENG_Q3_GT24") {
      await finishEngage("Más de 2 años");
      return { handled: true, goToMainMenu: true };
    }

    const errorMsg = "Por favor usa los botones para continuar.";
    await sendText(waId, errorMsg, { senderPhoneNumberId });
    await saveOutgoingMessage({ waId, text: errorMsg });
    await resendQ3Page2();
    return { handled: true };
  }

  const errorMsg = "Por favor usa los botones para continuar.";
  await sendText(waId, errorMsg, { senderPhoneNumberId });
  await saveOutgoingMessage({ waId, text: errorMsg });
  return { handled: true, goToMainMenu: true };
}
