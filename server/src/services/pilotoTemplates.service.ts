// Envío de las plantillas del piloto a un cliente desde el panel: junta sus datos de BD, arma la
// plantilla, la manda por Meta y la guarda en el historial del chat.
import axios from "axios";
import fs from "fs/promises";
import { PilotoError } from "../errors/PilotoErrores.js";
import { pilotoErrorDesdeMeta } from "../mappers/metaTemplateError.mapper.js";
import { armarPlantillaPiloto } from "../mappers/pilotoTemplate.mapper.js";
import type { GanchoImagen, PilotoClienteDatos, PilotoTemplateInput } from "../types/piloto.types.js";
import type { MetaErrorResponse, WhatsAppTemplateInput } from "../types/whatsapp.types.js";
import { findClienteConCredito } from "./clienteCredito.service.js";
import { findGanchoImagen } from "./ganchoImagen.service.js";
import { saveOutgoingMessage } from "./context.service.js";
import { sendTemplate, uploadImageMedia } from "./whatsapp.service.js";

// Nombre (de Credit) + racha, nivel y límite (de ClienteCredito). Si falta alguno, el operador debe cargarlo por CSV.
async function cargarDatosCliente(waId: string): Promise<PilotoClienteDatos> {
  const { cliente, credit } = await findClienteConCredito(waId);
  if (!cliente) throw new PilotoError("CLIENTE_NO_EN_PILOTO");
  if (!credit) throw new PilotoError("CREDITO_NO_ENCONTRADO");

  return { nombre: credit.nombre, racha: cliente.racha, nivel: cliente.nivel, limite: cliente.limite };
}

// La imagen que subió el operador en el panel; sin ella no se puede mandar el gancho.
async function requireGanchoImagen(): Promise<GanchoImagen> {
  const imagen = await findGanchoImagen();
  if (!imagen) throw new PilotoError("FALTA_IMAGEN_GANCHO");
  return imagen;
}

// Meta pide un mediaId propio en cada envío (la imagen de muestra de la aprobación no se reutiliza).
async function subirImagenGancho(imagen: GanchoImagen): Promise<string> {
  const buffer = await fs.readFile(imagen.path);
  const { id } = await uploadImageMedia({ buffer, filename: imagen.filename, mimeType: imagen.mimeType });
  return id;
}

// Si Meta rechaza la plantilla, el operador ve el motivo en el panel (PilotoError); sin respuesta de Meta sale 500.
async function enviarAMeta(waId: string, template: WhatsAppTemplateInput) {
  try {
    return await sendTemplate(waId, template);
  } catch (err) {
    const deMeta = axios.isAxiosError<MetaErrorResponse>(err) ? pilotoErrorDesdeMeta(err.response?.data) : null;
    if (!deMeta) throw err;
    console.error(`[piloto] Meta rechazó ${template.name}:`, deMeta.detalle);
    throw new PilotoError(deMeta.codigo, deMeta.detalle);
  }
}

// Valida y arma antes de subir la imagen o enviar, para no gastar envíos con datos incompletos.
export async function enviarPlantillaPiloto(waId: string, input: PilotoTemplateInput) {
  const datos = await cargarDatosCliente(waId);
  const { bodyParams, headerText, preview } = armarPlantillaPiloto(datos, input);
  const imagen = input.plantilla === "prox_credito_gancho" ? await requireGanchoImagen() : null;
  const headerImageId = imagen ? await subirImagenGancho(imagen) : undefined;

  const apiRes = await enviarAMeta(waId, {
    name: input.plantilla,
    bodyParams,
    ...(headerImageId && { headerImageId }),
    ...(headerText && { headerText })
  });
  const messageId = apiRes.messages?.[0]?.id;

  return saveOutgoingMessage({
    waId,
    text: preview,
    type: "template",
    ...(messageId && { messageId }),
    ...(imagen && { mediaUrl: imagen.url, mimeType: imagen.mimeType }),
    metadata: { template: input.plantilla, variables: bodyParams }
  });
}
