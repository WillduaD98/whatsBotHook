// Flujo de FAQ (preguntas frecuentes): menú de dos páginas y respuestas a cada opción.
import { sendButtons, sendText } from "../services/whatsapp.service.js";
import { saveOutgoingMessage, updateConversationState } from "../services/context.service.js";
import { buildReply } from "../services/router.service.js";

type SendOpts = { senderPhoneNumberId?: string | undefined };

export type FaqFlowResult = { handled: boolean };

function formatInteractiveForLog(body: string, buttons: Array<{ id: string; title: string }>): string {
  return `${body}\n\nOpciones: ${buttons.map((b) => b.title).join(" | ")}`;
}

export async function sendFaqMenu(waId: string, page: 1 | 2, opts?: SendOpts) {
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
  const apiRes = await sendButtons(waId, body, buttons, opts);
  const outId = apiRes?.messages?.[0]?.id;
  await saveOutgoingMessage({ waId, text: formatInteractiveForLog(body, buttons), messageId: outId, type: "interactive" });
  await updateConversationState(waId, { stage: `FAQ_MENU:${page}`, lastIntent: "FAQ_MENU" });
}

// Máquina de estados de FAQ_MENU:*. Devuelve { handled: false } si ninguna sub-rama aplica
// (el controller entonces continúa con el resto de su dispatch general).
export async function handleFaqFlow(params: {
  waId: string;
  stage: string;
  type: string;
  interactiveBtnId?: string | undefined;
  senderPhoneNumberId?: string | undefined;
}): Promise<FaqFlowResult> {
  const { waId, stage, type, interactiveBtnId } = params;
  const opts: SendOpts = { senderPhoneNumberId: params.senderPhoneNumberId };

  if (interactiveBtnId === "FAQ_MAS") {
    await sendFaqMenu(waId, 2, opts);
    return { handled: true };
  }
  if (interactiveBtnId === "FAQ_ATRAS") {
    await sendFaqMenu(waId, 1, opts);
    return { handled: true };
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
    await sendText(waId, reply, opts);
    await saveOutgoingMessage({ waId, text: reply });

    const apiRes = await sendButtons(
      waId,
      "¿Qué quieres hacer ahora?",
      [
        { id: "NAV_FAQ", title: "Tengo dudas 📌" },
        { id: "NAV_MENU", title: "Menú Inicial" }
      ],
      opts
    );
    const outId = apiRes?.messages?.[0]?.id;
    await saveOutgoingMessage({
      waId,
      text: formatInteractiveForLog("¿Qué quieres hacer ahora?", [
        { id: "NAV_FAQ", title: "Tengo dudas 📌" },
        { id: "NAV_MENU", title: "Menú Inicial" }
      ]),
      messageId: outId,
      type: "interactive"
    });
    return { handled: true };
  }

  if (type !== "interactive") {
    await sendFaqMenu(waId, stage === "FAQ_MENU:2" ? 2 : 1, opts);
    return { handled: true };
  }

  return { handled: false };
}
