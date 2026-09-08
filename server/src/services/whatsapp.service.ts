// Cliente HTTP para realizar llamadas a la API de WhatsApp (Graph)
import axios from "axios";
// Variables de entorno: versión de Graph, phone number id y token
import { env } from "../config/env.js";
// Normaliza el número de destino al formato esperado por la API
import { normalizeTo } from "./waid.service.js";

export function urlTemplate(senderId: string) {
  return `https://graph.facebook.com/${env.GRAPH_VERSION}/${senderId}/messages`;
}

function createMultipartFormData(parts: Array<{ headers: string; content: Buffer }>) {
  const boundary = `----whatsbot-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];

  for (const p of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n${p.headers}\r\n\r\n`, "utf8"));
    chunks.push(p.content);
    chunks.push(Buffer.from("\r\n", "utf8"));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));
  const body = Buffer.concat(chunks);
  return { body, boundary };
}

// Envía un mensaje de texto (type: text) vía WhatsApp Graph API
export async function sendText(
  to: string,
  text: string,
  opts?: { senderPhoneNumberId?: string | undefined }
) {
  // 1) Decide desde qué número enviar:
  //    - si viene desde el webhook (senderPhoneNumberId), úsalo
  //    - si no, usa el default del env (fallback)
  const senderId = opts?.senderPhoneNumberId ?? env.PHONE_NUMBER_ID;

  // 2) Construye la URL con el senderId correcto
  const url = `https://graph.facebook.com/${env.GRAPH_VERSION}/${senderId}/messages`;

  // 3) Normaliza el destino
  const normalized = normalizeTo(to);

  // 4) Envía
  const res = await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to: normalized,
      type: "text",
      text: { body: text }
    },
    {
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      timeout: 10000
    }
  );

  return res.data; // útil para debug (message id)
}

export async function sendButtons(
  to: string,
  bodyText: string,
  buttons: Array<{ id: string; title: string }>,
  opts?: { senderPhoneNumberId?: string | undefined }
) {
  if (!Array.isArray(buttons) || buttons.length < 1 || buttons.length > 3) {
    throw new Error("sendButtons requires 1..3 buttons");
  }

  const senderId = opts?.senderPhoneNumberId ?? env.PHONE_NUMBER_ID;
  const url = `https://graph.facebook.com/${env.GRAPH_VERSION}/${senderId}/messages`;
  const normalized = normalizeTo(to);

  const res = await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to: normalized,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: bodyText },
        action: {
          buttons: buttons.map((b) => ({ type: "reply", reply: { id: String(b.id), title: String(b.title) } }))
        }
      }
    },
    {
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      timeout: 10000
    }
  );

  return res.data;
}

export const CONSENT_BODY_TEXT =
  "🔒 *Protección de datos*\n\n" +
  "Al tocar *Acepto* confirmas que autorizas el tratamiento de tus datos conforme al Aviso de Privacidad.\n\n" +
  "Consulta el Aviso de Privacidad aquí:\n" +
  "https://tandayaoficial.mx/aviso-de-privacidad-clientes-prospectos\n\n" +
  "¿Deseas continuar?";

export const CONSENT_BUTTONS: Array<{ id: string; title: string }> = [
  { id: "PV_ACEPTO", title: "Acepto ✅" },
  { id: "PV_REGRESAR", title: "Regresar al menú" }
];

export async function sendConsentButtons(
  to: string,
  opts?: { senderPhoneNumberId?: string | undefined }
) {
  try {
    return await sendButtons(to, CONSENT_BODY_TEXT, CONSENT_BUTTONS, opts);
  } catch (error: any) {
    console.error("[whatsapp] sendConsentButtons error:", error?.response?.data || error);
    throw error;
  }
}

// Botón "Soy cliente" que se agrega al menú principal/bienvenida para entrar al flujo de cliente
export const CLIENTE_SOY_BUTTON: { id: string; title: string } = { id: "CLIENTE_SOY", title: "👤 Soy cliente" };

export async function sendTemplateWeeklyTip(
  to: string,
  mediaId: string,
  opts?: { senderPhoneNumberId?: string | undefined }
) {
  return sendTemplateConsejoSemanal(to, mediaId, opts);
}

export async function sendTemplateConsejoSemanal(
  to: string,
  mediaId: string,
  opts?: { senderPhoneNumberId?: string | undefined }
) {
  const senderId = opts?.senderPhoneNumberId ?? env.PHONE_NUMBER_ID;
  const url = `https://graph.facebook.com/${env.GRAPH_VERSION}/${senderId}/messages`;
  const toRaw = String(to || "").trim();
  const mediaIdRaw = String(mediaId || "").trim();

  console.log("[whatsapp] template consejo_semanal_v1 ->", { to: toRaw, senderId, mediaId: mediaIdRaw });

  const res = await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to: toRaw,
      type: "template",
      template: {
        name: "consejo_semanal_v1",
        language: { code: "es_MX" },
        components: [
          {
            type: "header",
            parameters: [{ type: "image", image: { id: mediaIdRaw } }]
          }
        ]
      }
    },
    {
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      timeout: 10000
    }
  );

  const data = res.data;
  try {
    const wamid = data?.messages?.[0]?.id;
    if (wamid) console.log("[whatsapp] sent template consejo_semanal_v1 wamid:", wamid);
  } catch (_) {}
  return data;
}

export async function uploadWhatsAppMediaImage(
  fileOrUrl:
    | { buffer: Buffer; filename: string; mimeType: string }
    | { url: string; filename?: string; mimeType?: string },
  opts?: { senderPhoneNumberId?: string | undefined }
) {
  if ((fileOrUrl as any)?.buffer && Buffer.isBuffer((fileOrUrl as any).buffer)) {
    const file = fileOrUrl as { buffer: Buffer; filename: string; mimeType: string };
    const res = await uploadImageMedia(file, opts);
    return res.id;
  }

  const url = String((fileOrUrl as any)?.url || "").trim();
  if (!url) throw new Error("uploadWhatsAppMediaImage requires buffer or url");

  const fetchRes = await axios.get(url, { responseType: "arraybuffer", timeout: 20000 });
  const contentType = String(fetchRes.headers?.["content-type"] || "").toLowerCase();
  const mimeType =
    String((fileOrUrl as any)?.mimeType || "").trim() ||
    (contentType.startsWith("image/") ? contentType : "image/jpeg");

  const filenameRaw = String((fileOrUrl as any)?.filename || "").trim();
  const fallbackName = (() => {
    const clean = url.split("?")[0].split("#")[0];
    const last = clean.split("/").filter(Boolean).pop() || "image";
    return last.length > 0 ? last : "image";
  })();
  const filename = filenameRaw || fallbackName;

  const buffer = Buffer.from(fetchRes.data);
  const res = await uploadImageMedia({ buffer, filename, mimeType }, opts);
  return res.id;
}

export async function uploadImageMedia(
  file: { buffer: Buffer; filename: string; mimeType: string },
  opts?: { senderPhoneNumberId?: string | undefined }
) {
  const senderId = opts?.senderPhoneNumberId ?? env.PHONE_NUMBER_ID;
  const url = `https://graph.facebook.com/${env.GRAPH_VERSION}/${senderId}/media`;

  const { body, boundary } = createMultipartFormData([
    {
      headers: `Content-Disposition: form-data; name="messaging_product"`,
      content: Buffer.from("whatsapp", "utf8")
    },
    {
      headers:
        `Content-Disposition: form-data; name="file"; filename="${file.filename.replace(/"/g, "")}"\r\n` +
        `Content-Type: ${file.mimeType}`,
      content: file.buffer
    }
  ]);

  const res = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": body.length
    },
    timeout: 20000,
    maxBodyLength: Infinity
  });

  const data = res.data as { id: string };
  if (data?.id) console.log("[whatsapp] uploaded media id:", data.id);
  return data;
}

export async function sendImage(
  to: string,
  mediaId: string,
  opts?: { senderPhoneNumberId?: string | undefined }
) {
  const senderId = opts?.senderPhoneNumberId ?? env.PHONE_NUMBER_ID;
  const url = `https://graph.facebook.com/${env.GRAPH_VERSION}/${senderId}/messages`;
  const normalized = normalizeTo(to);

  const res = await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to: normalized,
      type: "image",
      image: { id: mediaId }
    },
    {
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      timeout: 20000
    }
  );

  return res.data;
}

export async function sendTemplateRecordatorioPago(
  to: string,
  data: { nombre: string; fecha: string; monto: string; clabe: string; referencia: string },
  opts?: { senderPhoneNumberId?: string | undefined }
) {
  const senderId = opts?.senderPhoneNumberId ?? env.PHONE_NUMBER_ID;
  const url = `https://graph.facebook.com/${env.GRAPH_VERSION}/${senderId}/messages`;
  const toRaw = normalizeTo(String(to || "").trim());

  // El encabezado "Recordatorio de Pago" es texto fijo (no lleva parametro).
  // Cuerpo: {{1}} nombre, {{2}} fecha, {{3}} monto, {{4}} CLABE, {{5}} referencia
  const parameters = [
    { type: "text", text: String(data?.nombre ?? "").trim() },
    { type: "text", text: String(data?.fecha ?? "").trim() },
    { type: "text", text: String(data?.monto ?? "").trim() },
    { type: "text", text: String(data?.clabe ?? "").trim() },
    { type: "text", text: String(data?.referencia ?? "").trim() }
  ];

  console.log("[whatsapp] template recordatorio_de_pago1 ->", { to: toRaw, senderId });

  const res = await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to: toRaw,
      type: "template",
      template: {
        name: "recordatorio_de_pago1",
        language: { code: "es_MX" },
        components: [
          {
            type: "body",
            parameters
          }
        ]
      }
    },
    {
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      timeout: 10000
    }
  );

  const payload = res.data;
  try {
    const wamid = payload?.messages?.[0]?.id;
    if (wamid) console.log("[whatsapp] sent template recordatorio_de_pago1 wamid:", wamid);
  } catch (_) {}
  return payload;
}

export async function sendTemplateRecordatorioPagoHoy(
  to: string,
  data: { monto: string; clabe: string; referencia: string },
  opts?: { senderPhoneNumberId?: string | undefined }
) {
  const senderId = opts?.senderPhoneNumberId ?? env.PHONE_NUMBER_ID;
  const url = `https://graph.facebook.com/${env.GRAPH_VERSION}/${senderId}/messages`;
  const toRaw = normalizeTo(String(to || "").trim());

  // Plantilla del "dia de pago". Cuerpo: {{1}} monto, {{2}} CLABE, {{3}} referencia
  const parameters = [
    { type: "text", text: String(data?.monto ?? "").trim() },
    { type: "text", text: String(data?.clabe ?? "").trim() },
    { type: "text", text: String(data?.referencia ?? "").trim() }
  ];

  console.log("[whatsapp] template recordatorio_hoy_es_tu_pago ->", { to: toRaw, senderId });

  const res = await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to: toRaw,
      type: "template",
      template: {
        name: "recordatorio_hoy_es_tu_pago",
        language: { code: "es_MX" },
        components: [
          {
            type: "body",
            parameters
          }
        ]
      }
    },
    {
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      timeout: 10000
    }
  );

  const payload = res.data;
  try {
    const wamid = payload?.messages?.[0]?.id;
    if (wamid) console.log("[whatsapp] sent template recordatorio_hoy_es_tu_pago wamid:", wamid);
  } catch (_) {}
  return payload;
}


export async function sendTemplatePagoAtrasado(
  to: string,
  data: { clabe: string; referencia: string },
  opts?: { senderPhoneNumberId?: string | undefined }
) {
  const senderId = opts?.senderPhoneNumberId ?? env.PHONE_NUMBER_ID;
  const url = `https://graph.facebook.com/${env.GRAPH_VERSION}/${senderId}/messages`;
  const toRaw = normalizeTo(String(to || "").trim());

  // Plantilla de pago atrasado. Cuerpo: {{1}} CLABE, {{2}} referencia
  const parameters = [
    { type: "text", text: String(data?.clabe ?? "").trim() },
    { type: "text", text: String(data?.referencia ?? "").trim() }
  ];

  console.log("[whatsapp] template pago_atrasado ->", { to: toRaw, senderId });

  const res = await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to: toRaw,
      type: "template",
      template: {
        name: "pago_atrasado",
        language: { code: "es_MX" },
        components: [
          {
            type: "body",
            parameters
          }
        ]
      }
    },
    {
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      timeout: 10000
    }
  );

  const payload = res.data;
  try {
    const wamid = payload?.messages?.[0]?.id;
    if (wamid) console.log("[whatsapp] sent template pago_atrasado wamid:", wamid);
  } catch (_) {}
  return payload;
}


export async function sendTemplateRegularizaTuPago(
  to: string,
  data: { nombre: string; clabe: string; referencia: string },
  opts?: { senderPhoneNumberId?: string | undefined }
) {
  const senderId = opts?.senderPhoneNumberId ?? env.PHONE_NUMBER_ID;
  const url = `https://graph.facebook.com/${env.GRAPH_VERSION}/${senderId}/messages`;
  const toRaw = normalizeTo(String(to || "").trim());

  // Plantilla 2do dia de atraso. Cuerpo: {{1}} nombre, {{2}} CLABE, {{3}} referencia
  const parameters = [
    { type: "text", text: String(data?.nombre ?? "").trim() },
    { type: "text", text: String(data?.clabe ?? "").trim() },
    { type: "text", text: String(data?.referencia ?? "").trim() }
  ];

  console.log("[whatsapp] template regulariza_tu_pago ->", { to: toRaw, senderId });

  const res = await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to: toRaw,
      type: "template",
      template: {
        name: "regulariza_tu_pago",
        language: { code: "es_MX" },
        components: [
          { type: "body", parameters }
        ]
      }
    },
    {
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      timeout: 10000
    }
  );

  const payload = res.data;
  try {
    const wamid = payload?.messages?.[0]?.id;
    if (wamid) console.log("[whatsapp] sent template regulariza_tu_pago wamid:", wamid);
  } catch (_) {}
  return payload;
}


export async function sendTemplatePagoAtrasadoCobranza(
  to: string,
  data: { nombre: string; clabe: string; referencia: string },
  opts?: { senderPhoneNumberId?: string | undefined }
) {
  const senderId = opts?.senderPhoneNumberId ?? env.PHONE_NUMBER_ID;
  const url = urlTemplate(senderId);
  const toRaw = normalizeTo(String(to || "").trim());

  const parameters = [
    { type: "text", text: String(data?.nombre ?? "").trim() },
    { type: "text", text: String(data?.clabe ?? "").trim() },
    { type: "text", text: String(data?.referencia ?? "").trim() }
  ];

  console.log("[whatsapp] template pago_atrasado_cobranza ->", { to: toRaw, senderId });

  const res = await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to: toRaw,
      type: "template",
      template: {
        name: "pago_atrasado_cobranza",
        language: { code: "es_MX" },
        components: [
          { type: "body", parameters }
        ]
      }
    },
    {
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      timeout: 10000
    }
  );

  const payload = res.data;
  try {
    const wamid = payload?.messages?.[0]?.id;
    if (wamid) console.log("[whatsapp] sent template pago_atrasado_cobranza wamid:", wamid);
  } catch (error) {
    return payload;
  }
}
