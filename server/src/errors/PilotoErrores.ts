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
  | "STATUS_CITA_INVALIDO";

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
  STATUS_CITA_INVALIDO: "Estado de cita inválido (usa pendiente_confirmacion o pendiente_fecha)"
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
  STATUS_CITA_INVALIDO: 400
};

export class PilotoError extends DomainError {
  constructor(readonly pilotoCode: PilotoErrorCode) {
    super(PILOTO_ERROR_MESSAGES[pilotoCode], PILOTO_ERROR_STATUS[pilotoCode], pilotoCode);
  }
}
