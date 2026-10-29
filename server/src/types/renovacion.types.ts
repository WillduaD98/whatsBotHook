// Formas del flujo de renovación del piloto: cálculo, estado en la conversación y cita persistida.
import type { InferSchemaType, Types } from "mongoose";
import type { RenovacionCitaSchema } from "../models/RenovacionCita.js";
import type { PlazoSemanas } from "../shared/clienteCredito.constants.js";
import type { RenovacionCitaStatus } from "../shared/renovacion.constants.js";
import type { ClienteCreditoLean } from "./clienteCredito.types.js";

// Lo necesario para estimar la cuota semanal de un crédito: monto pedido, plazo elegido y tasa del cliente.
export type CalculoCuotaInput = {
  monto: number;
  plazoSemanas: PlazoSemanas;
  tasaSemanal: number;
};

// Cómo entró el cliente: tocando el botón del gancho (ya vio racha/nivel/límite) o escribiendo "renovar".
export type RenovacionEntrada = "PLANTILLA" | "TEXTO";

// Lo que el flujo recuerda entre mensajes (conv.slots.renovacion). La cuota NO se guarda: se recalcula con la tasa en BD.
export type RenovacionSlots = {
  monto?: number;
  plazoSemanas?: PlazoSemanas;
};

// Solo lo que el flujo necesita del perfil del cliente para validar y calcular.
export type RenovacionCliente = Pick<ClienteCreditoLean, "numeroCredito" | "limite" | "plazos" | "tasaSemanal" | "racha" | "nivel">;

// Monto y plazo ya revalidados contra el perfil, con su cuota estimada: lo único que se puede agendar.
export type RenovacionSolicitud = {
  monto: number;
  plazoSemanas: PlazoSemanas;
  cuotaSemanal: number;
};

// Resultado de validar el monto que escribió el cliente.
export type MontoValidacion = { ok: true; monto: number } | { ok: false; motivo: "NO_ES_NUMERO" | "EXCEDE_LIMITE" };

// Cita a guardar (entrada del service).
export type RenovacionCitaInput = RenovacionSolicitud & {
  waId: string;
  numeroCredito: string;
  tasaSemanal: number;
  fechaCita: string | null;
  status: RenovacionCitaStatus;
};

// Documento tal como sale de BD con .lean().
export type RenovacionCitaLean = InferSchemaType<typeof RenovacionCitaSchema> & { _id: Types.ObjectId };

// Lo que el webhook le pasa al flujo en cada mensaje mientras el stage es RENOVACION:*.
export type RenovacionFlowParams = {
  waId: string;
  stage: string;
  type: string;
  text: string;
  interactiveBtnId?: string | undefined;
  slots: Record<string, unknown> | undefined;
  senderPhoneNumberId?: string | undefined;
};

export type RenovacionFlowResult = { handled: boolean; goToMainMenu?: boolean };

// Solo lo que la lista de citas necesita de Credit para mostrar el nombre del cliente.
export type CreditNombreLean = { numeroCredito: string; nombre: string };

// Cita tal como la ve el panel: id string y fechas ISO (no la forma de BD).
export type RenovacionCitaDto = {
  id: string;
  waId: string;
  numeroCredito: string;
  nombre: string | null;
  monto: number;
  plazoSemanas: number;
  tasaSemanal: number;
  cuotaSemanal: number;
  fechaCita: string | null;
  status: RenovacionCitaStatus;
  createdAt: string;
};
