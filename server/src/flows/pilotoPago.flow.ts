// Pagos del piloto ligados por waId (ClienteCredito → Credit): botones de due_date_action ("Ya pagué" /
// "Pásame los datos de pago" / "Necesito ayuda"), el botón "🧾 Mandar comprobante" y el comprobante automático.
// No se le pide al cliente su número de crédito. Si el waId no está en el piloto, sigue el flujo de cliente de siempre.
import { PILOTO_MANDAR_COMPROBANTE_BOTON, type PilotoPagoBoton } from "../shared/pilotoTemplates.constants.js";
import { findClienteConCredito } from "../services/clienteCredito.service.js";
import { sleep } from "../utils/sleep.js";
import { sendButtonsAndLog, type SendOpts } from "./_shared.js";
import { enterAsesor } from "./asesor.flow.js";
import {
  CLIENTE_STAGE_ESPERA_COMPROBANTE,
  enterClienteMenu,
  enterComprobanteConCredito,
  handleClienteFlow,
  sendDatosPago
} from "./cliente.flow.js";

// Pausa entre los datos de pago y el botón del comprobante, para que el cliente alcance a copiar CLABE y referencia.
const PAUSA_ANTES_DE_COMPROBANTE_MS = 4000;

const MANDAR_COMPROBANTE_TEXT = "¿Ya hiciste tu pago? 🙌\nToca el botón y mándanos la foto o el PDF de tu comprobante 🧾";

// Lo que el webhook le pasa al flujo cuando reconoce un botón de pago del piloto.
export type PilotoPagoBotonParams = {
  waId: string;
  boton: PilotoPagoBoton;
  slots: Record<string, unknown> | undefined;
  senderPhoneNumberId?: string | undefined;
};

// Foto o PDF que mandó un cliente, para tomarlo como comprobante.
export type ComprobanteLigadoParams = {
  waId: string;
  type: string;
  mediaUrl: string;
  mimeType: string | undefined;
  slots: Record<string, unknown> | undefined;
  senderPhoneNumberId?: string | undefined;
};

// CLABE, referencia e instrucción; unos segundos después, el botón para mandar el comprobante.
async function sendDatosPagoYBotonComprobante(waId: string, credit: { clabe: string; referencia: string }, opts: SendOpts) {
  await sendDatosPago(waId, credit, opts);
  await sleep(PAUSA_ANTES_DE_COMPROBANTE_MS);
  await sendButtonsAndLog(waId, MANDAR_COMPROBANTE_TEXT, [PILOTO_MANDAR_COMPROBANTE_BOTON], opts);
}

// Atiende el botón tocado; siempre responde algo, así que el webhook termina ahí.
export async function handlePilotoPagoBoton({ waId, boton, slots, senderPhoneNumberId }: PilotoPagoBotonParams) {
  const opts: SendOpts = { senderPhoneNumberId };

  if (boton === "AYUDA") {
    await enterAsesor(waId, opts);
    return;
  }

  const { credit } = await findClienteConCredito(waId);
  if (!credit) {
    await enterClienteMenu(waId, opts);
    return;
  }

  if (boton === "DATOS_PAGO") {
    await sendDatosPagoYBotonComprobante(waId, credit, opts);
    return;
  }

  await enterComprobanteConCredito(waId, slots ?? {}, credit.numeroCredito, opts);
}

// Comprobante automático: si el waId es de un cliente ligado, su foto/PDF se registra como comprobante con su crédito
// y recibe la respuesta de siempre ("Recibimos tu comprobante…"). Reusa el paso "espera de comprobante" del flujo de
// cliente tal cual. false = el waId no está ligado → el webhook sigue con el flujo normal.
export async function recibirComprobanteLigado(params: ComprobanteLigadoParams): Promise<boolean> {
  const { credit } = await findClienteConCredito(params.waId);
  if (!credit) return false;

  const cliente = { attempts: 0, numeroCredito: credit.numeroCredito, purpose: "comprobante" };
  await handleClienteFlow({
    waId: params.waId,
    stage: CLIENTE_STAGE_ESPERA_COMPROBANTE,
    type: params.type,
    text: "",
    slots: { ...(params.slots ?? {}), cliente },
    senderPhoneNumberId: params.senderPhoneNumberId,
    mediaUrl: params.mediaUrl,
    mimeType: params.mimeType
  });
  return true;
}
