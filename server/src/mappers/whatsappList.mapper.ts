// Arma el objeto `interactive` de una lista de WhatsApp a partir de lo que pide el flujo (puro, sin HTTP).
import type { WhatsAppListInput, WhatsAppListInteractive, WhatsAppListRow } from "../types/whatsapp.types.js";

// Copia la opción sin mandar `description` vacía: Meta rechaza campos vacíos.
function toListRow(row: WhatsAppListRow): WhatsAppListRow {
  const description = row.description?.trim();
  return { id: row.id, title: row.title, ...(description && { description }) };
}

// Una sola sección; el título de sección solo se manda si viene (Meta lo exige únicamente con 2+ secciones).
export function toListInteractive(list: WhatsAppListInput): WhatsAppListInteractive {
  const sectionTitle = list.sectionTitle?.trim();
  return {
    type: "list",
    body: { text: list.bodyText },
    action: {
      button: list.buttonText,
      sections: [{ ...(sectionTitle && { title: sectionTitle }), rows: list.rows.map(toListRow) }]
    }
  };
}
