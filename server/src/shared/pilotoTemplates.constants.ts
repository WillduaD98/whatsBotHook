// Plantillas de Meta del piloto "droga del pago": una sola fuente para el endpoint, el mapper y sus types.
// El nombre debe ser idéntico al dado de alta en WhatsApp Manager.

// streak_alert = día −1 (recordatorio) · due_date_action = día 0 (paga hoy) · prox_credito_gancho = gancho de renovación.
export const PILOTO_TEMPLATES = ["streak_alert", "due_date_action", "prox_credito_gancho"] as const;
export type PilotoTemplateName = (typeof PILOTO_TEMPLATES)[number];

// Textos de los botones de respuesta rápida de due_date_action, tal como se dieron de alta en Meta.
// En plantillas, el webhook recibe el TEXTO del botón como payload (type "button"), por eso se reconocen por texto.
export const PILOTO_PAGO_BOTONES = {
  YA_PAGUE: "Ya pagué",
  DATOS_PAGO: "Pásame los datos de pago",
  AYUDA: "Necesito ayuda"
} as const;
export type PilotoPagoBoton = keyof typeof PILOTO_PAGO_BOTONES;

// Botón de prox_credito_gancho que abre el flujo de renovación (texto con acentos, como en Meta).
export const PILOTO_GANCHO_BOTON = "Calcular mi próximo crédito";

// Formatos que Meta acepta en el encabezado de imagen de una plantilla (máx. 5 MB), con la extensión con que se guardan.
export const GANCHO_IMAGEN_FORMATOS = { "image/jpeg": "jpg", "image/png": "png" } as const;
export type GanchoImagenMimeType = keyof typeof GANCHO_IMAGEN_FORMATOS;
export const GANCHO_IMAGEN_MAX_BYTES = 5 * 1024 * 1024;

export function isGanchoImagenMimeType(value: string): value is GanchoImagenMimeType {
  return value in GANCHO_IMAGEN_FORMATOS;
}
