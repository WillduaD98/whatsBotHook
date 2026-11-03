// Arma los `components` de una plantilla de Meta a partir de sus parámetros (puro, sin HTTP).
import type { WhatsAppTemplateComponent, WhatsAppTemplateInput } from "../types/whatsapp.types.js";

// Header (imagen o texto) solo si la plantilla lo tiene con variable; body solo si lleva variables
// (Meta rechaza parámetros de más o de menos: #132000).
export function toTemplateComponents(template: WhatsAppTemplateInput): WhatsAppTemplateComponent[] {
  const components: WhatsAppTemplateComponent[] = [];
  if (template.headerImageId) {
    components.push({ type: "header", parameters: [{ type: "image", image: { id: template.headerImageId } }] });
  } else if (template.headerText) {
    components.push({ type: "header", parameters: [{ type: "text", text: template.headerText }] });
  }
  if (template.bodyParams.length > 0) {
    components.push({ type: "body", parameters: template.bodyParams.map((text) => ({ type: "text", text })) });
  }
  return components;
}
