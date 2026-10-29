// Traducción central de errores de la API: un DomainError sale con su status y mensaje seguro;
// cualquier otro error es falla nuestra → se loguea completo aquí y al cliente solo le llega un 500 genérico.
import type { ErrorRequestHandler } from "express";
import { DomainError } from "../errors/DomainError.js";

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof DomainError) {
    return res.status(err.status).json({ message: err.message, code: err.code });
  }
  // Los errores de axios traen la respuesta de Meta en response.data: es lo útil para depurar.
  console.error(`[api] ${req.method} ${req.path} error no controlado:`, err?.response?.data ?? err);
  return res.status(500).json({ message: "Error interno del servidor" });
};
