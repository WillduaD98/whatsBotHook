// Errores del piloto de renovación (plantillas, imagen del gancho y citas en el panel), con su texto y código HTTP.
import { DomainError, type DomainErrorStatus } from "./DomainError.js";

export type PilotoErrorCode =
  | "PLANTILLA_INVALIDA"
  | "CLIENTE_NO_EN_PILOTO"
  | "CREDITO_NO_ENCONTRADO"
  | "MONTO_INVALIDO"
  | "FALTA_FECHA"
  | "RENOVACION_NO_AUTORIZADA"
  | "FALTA_IMAGEN_GANCHO"
  | "IMAGEN_GANCHO_INVALIDA"
  | "STATUS_CITA_INVALIDO"
  | "META_VARIABLES_NO_COINCIDEN"
  | "META_PLANTILLA_NO_EXISTE"
  | "META_TEXTO_MUY_LARGO"
  | "META_PLANTILLA_PAUSADA"
  | "META_RECHAZO";

// Texto que ve el operador en el panel.
const PILOTO_ERROR_MESSAGES: Record<PilotoErrorCode, string> = {
  PLANTILLA_INVALIDA: "La plantilla no es del piloto (usa streak_alert, due_date_action o prox_credito_gancho)",
  CLIENTE_NO_EN_PILOTO: "Este número no está en el piloto: cárgalo en el CSV de Créditos con waId, limite y plazos",
  CREDITO_NO_ENCONTRADO: "El numeroCredito de este cliente del piloto no existe en Créditos: cárgalo con nombre, CLABE y referencia",
  MONTO_INVALIDO: "Escribe el monto del pago (ej. 750)",
  FALTA_FECHA: "Escribe la fecha de vencimiento (ej. vie 30 oct)",
  RENOVACION_NO_AUTORIZADA: "Este cliente tiene límite 0 (renovación no autorizada): no se le puede mandar el gancho de renovación",
  FALTA_IMAGEN_GANCHO: "Falta la imagen del gancho: súbela en el panel 🔥 Piloto antes de mandar prox_credito_gancho",
  IMAGEN_GANCHO_INVALIDA: "Selecciona una imagen JPG o PNG (máx. 5 MB) para el gancho",
  STATUS_CITA_INVALIDO: "Estado de cita inválido (usa pendiente_confirmacion o pendiente_fecha)",
  META_VARIABLES_NO_COINCIDEN:
    "Meta rechazó la plantilla: sus variables (encabezado o cuerpo) no coinciden con las que mandamos",
  META_PLANTILLA_NO_EXISTE: "Meta no encuentra la plantilla: revisa que el nombre sea exacto, que esté aprobada y el idioma (es_MX)",
  META_TEXTO_MUY_LARGO:
    "Meta rechazó la plantilla: con los datos del cliente el texto se pasa del límite (el encabezado admite 60 caracteres)",
  META_PLANTILLA_PAUSADA: "Meta pausó o deshabilitó esta plantilla: revisa su estado en el administrador de plantillas",
  META_RECHAZO: "Meta rechazó el envío"
};

const PILOTO_ERROR_STATUS: Record<PilotoErrorCode, DomainErrorStatus> = {
  PLANTILLA_INVALIDA: 400,
  CLIENTE_NO_EN_PILOTO: 404,
  CREDITO_NO_ENCONTRADO: 404,
  MONTO_INVALIDO: 400,
  FALTA_FECHA: 400,
  RENOVACION_NO_AUTORIZADA: 409,
  FALTA_IMAGEN_GANCHO: 409,
  IMAGEN_GANCHO_INVALIDA: 400,
  STATUS_CITA_INVALIDO: 400,
  META_VARIABLES_NO_COINCIDEN: 409,
  META_PLANTILLA_NO_EXISTE: 409,
  META_TEXTO_MUY_LARGO: 409,
  META_PLANTILLA_PAUSADA: 409,
  META_RECHAZO: 409
};

// detalleMeta: lo que respondió Meta (código y descripción), para que el operador sepa qué corregir en la plantilla.
export class PilotoError extends DomainError {
  constructor(
    readonly pilotoCode: PilotoErrorCode,
    detalleMeta?: string
  ) {
    const mensaje = PILOTO_ERROR_MESSAGES[pilotoCode];
    super(detalleMeta ? `${mensaje} — Meta: ${detalleMeta}` : mensaje, PILOTO_ERROR_STATUS[pilotoCode], pilotoCode);
  }
}
