// Formas del envío de las plantillas del piloto desde el panel.
import type { GanchoImagenMimeType, PilotoTemplateName } from "../shared/pilotoTemplates.constants.js";

// Lo que captura el operador en el panel; monto y fecha solo aplican a las plantillas de pago (no están en BD).
export type PilotoTemplateInput = {
  plantilla: PilotoTemplateName;
  monto?: string;
  fecha?: string;
};

// Datos del cliente que salen de BD: nombre de Credit; racha, nivel y límite de ClienteCredito.
export type PilotoClienteDatos = {
  nombre: string;
  racha: number;
  nivel: number;
  limite: number;
};

// Plantilla lista para enviar: parámetros del body en el orden de Meta + texto que se guarda para el panel.
export type PilotoTemplateArmada = {
  bodyParams: string[];
  preview: string;
};

// Imagen fija del encabezado de prox_credito_gancho tal como está guardada en el server.
export type GanchoImagen = {
  path: string;
  filename: string;
  mimeType: GanchoImagenMimeType;
  // Ruta pública con ?v=<fecha de modificación> para que el panel no muestre una versión vieja en caché.
  url: string;
};
