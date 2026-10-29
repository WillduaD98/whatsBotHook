// Formas del perfil de crédito del cliente (piloto de renovación): persistida, de entrada (CSV) y resumen de carga.
import type { InferSchemaType, Types } from "mongoose";
import type { ClienteCreditoSchema } from "../models/ClienteCredito.js";
import type { NivelConfianza, PlazoSemanas } from "../shared/clienteCredito.constants.js";
import type { UpsertCreditsError } from "../services/credit.service.js";

// Documento tal como sale de BD con .lean(): derivado del schema para no re-tiparlo a mano.
export type ClienteCreditoLean = InferSchemaType<typeof ClienteCreditoSchema> & { _id: Types.ObjectId };

// Columnas del piloto tal como llegan en el CSV de créditos (todo texto, sin validar).
export type ClienteCreditoCsvRow = {
  numeroCredito?: string;
  waId?: string;
  limite?: string;
  plazos?: string;
  nivel?: string;
  racha?: string;
  renovaciones?: string;
};

// Perfil ya validado, listo para escribir. nivel/racha/renovaciones vacíos en el CSV no se tocan (al crear usan su default).
export type ClienteCreditoInput = {
  waId: string;
  numeroCredito: string;
  limite: number;
  plazos: PlazoSemanas[];
  nivel?: NivelConfianza;
  racha?: number;
  renovaciones?: number;
};

// Resultado de validar una fila del CSV: el perfil listo o el motivo por el que se omite.
export type ClienteCreditoCsvParse = { ok: true; input: ClienteCreditoInput } | { ok: false; motivo: string };

// Filas del CSV ya separadas en perfiles válidos y errores, antes de tocar BD.
export type ClientesCreditoCsvClasificacion = {
  recibidos: number;
  inputs: ClienteCreditoInput[];
  errores: UpsertCreditsError[];
};

// Lo que regresa la carga del piloto al panel; misma forma que el resumen de la carga de créditos.
export type CargaClientesCreditoResumen = {
  recibidos: number;
  insertados: number;
  actualizados: number;
  omitidos: number;
  errores: UpsertCreditsError[];
};
