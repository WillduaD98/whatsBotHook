// Botones de la plantilla due_date_action del piloto ("Ya pagué ✅" / "Pásame los datos" / "Necesito ayuda").
// Todo va ligado por waId (ClienteCredito → Credit): no se le pide al cliente su número de crédito.
// Si el waId no está en el piloto (o su crédito no existe), cae al menú de cliente, que sí verifica por número.
import type { PilotoPagoBoton } from "../shared/pilotoTemplates.constants.js";
import { findClienteConCredito } from "../services/clienteCredito.service.js";
import { enterAsesor } from "./asesor.flow.js";
import { enterClienteMenu, enterComprobanteConCredito, sendDatosPago } from "./cliente.flow.js";

type SendOpts = { senderPhoneNumberId?: string | undefined };

// Lo que el webhook le pasa al flujo cuando reconoce un botón de pago del piloto.
export type PilotoPagoBotonParams = {
  waId: string;
  boton: PilotoPagoBoton;
  slots: Record<string, unknown> | undefined;
  senderPhoneNumberId?: string | undefined;
};

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
    await sendDatosPago(waId, credit, opts);
    return;
  }

  await enterComprobanteConCredito(waId, slots ?? {}, credit.numeroCredito, opts);
}
