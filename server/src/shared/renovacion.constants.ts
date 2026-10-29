// Estados de una cita de renovación: una sola fuente para el enum del schema y su type.

// pendiente_confirmacion = el bot la agendó para mañana y un asesor debe confirmarla.
// pendiente_fecha = el cliente eligió "Otro día": un asesor debe contactarlo para fijar la fecha.
export const RENOVACION_CITA_STATUS = ["pendiente_confirmacion", "pendiente_fecha"] as const;
export type RenovacionCitaStatus = (typeof RENOVACION_CITA_STATUS)[number];
