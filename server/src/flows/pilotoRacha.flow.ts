// Respuesta al botón "¿Para qué sirve mi racha?" de la plantilla del día −2: 3 mensajes con una pausa entre cada uno.
// La racha sale del perfil del piloto ligado por waId; no cambia el stage de la conversación.
import { buildExplicacionRacha } from "../mappers/rachaMensajes.mapper.js";
import { findClienteCreditoByWaId } from "../services/clienteCredito.service.js";
import { sleep } from "../utils/sleep.js";
import { sendTextAndLog, type SendOpts } from "./_shared.js";

// Pausa entre mensajes para que lleguen en orden y dé tiempo de leer cada uno.
const PAUSA_ENTRE_MENSAJES_MS = 2500;

// Manda la explicación completa; siempre responde, así que el webhook termina ahí.
export async function explicarRacha(waId: string, opts: SendOpts) {
  const cliente = await findClienteCreditoByWaId(waId);
  const mensajes = buildExplicacionRacha(cliente ? cliente.racha : null);

  for (const [indice, mensaje] of mensajes.entries()) {
    if (indice > 0) await sleep(PAUSA_ENTRE_MENSAJES_MS);
    await sendTextAndLog(waId, mensaje, opts);
  }
}
