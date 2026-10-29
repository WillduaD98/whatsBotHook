// Formas de los mensajes interactivos de WhatsApp (Graph API) que arma el bot.

// Una opción de la lista. Límites de Meta: id ≤ 200, title ≤ 24, description ≤ 72 caracteres.
export type WhatsAppListRow = {
  id: string;
  title: string;
  description?: string;
};

// Lista interactiva de una sola sección (hasta 10 opciones; para más de 3, porque los botones solo dejan 3).
// Límites de Meta: bodyText ≤ 1024, buttonText ≤ 20, sectionTitle ≤ 24 caracteres.
export type WhatsAppListInput = {
  bodyText: string;
  buttonText: string;
  rows: WhatsAppListRow[];
  sectionTitle?: string;
};

// Plantilla de Meta a enviar: parámetros de texto del body (en orden {{1}}, {{2}}, …) y, si su encabezado es imagen, el mediaId.
export type WhatsAppTemplateInput = {
  name: string;
  bodyParams: string[];
  headerImageId?: string;
};

// Un componente de plantilla tal como lo espera Graph.
export type WhatsAppTemplateComponent =
  | { type: "header"; parameters: Array<{ type: "image"; image: { id: string } }> }
  | { type: "body"; parameters: Array<{ type: "text"; text: string }> };

// Objeto `interactive` de tipo list tal como lo espera Graph.
export type WhatsAppListInteractive = {
  type: "list";
  body: { text: string };
  action: {
    button: string;
    sections: Array<{ title?: string; rows: WhatsAppListRow[] }>;
  };
};
