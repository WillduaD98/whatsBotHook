// Endpoints del panel para el piloto de renovación: plantillas, imagen del gancho y citas.
// Los errores (incluidos los PilotoError) los traduce el errorHandler central.
import type { NextFunction, Request, Response } from "express";
import { PilotoError } from "../errors/PilotoErrores.js";
import { parsePilotoTemplateName } from "../mappers/pilotoTemplate.mapper.js";
import { parseCitaStatusFilter } from "../mappers/renovacionCita.mapper.js";
import { findGanchoImagen, guardarGanchoImagen } from "../services/ganchoImagen.service.js";
import { enviarPlantillaPiloto } from "../services/pilotoTemplates.service.js";
import { listarCitasRenovacion } from "../services/renovacionCita.service.js";
import { isGanchoImagenMimeType } from "../shared/pilotoTemplates.constants.js";

// POST /api/chats/:waId/piloto-template   body: { plantilla, monto?, fecha? }
export const sendPilotoTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const waId = String(req.params.waId ?? "").trim();
    const plantilla = parsePilotoTemplateName(String(req.body?.plantilla ?? ""));
    const monto = String(req.body?.monto ?? "");
    const fecha = String(req.body?.fecha ?? "");

    const savedMessage = await enviarPlantillaPiloto(waId, { plantilla, monto, fecha });
    return res.status(200).json(savedMessage);
  } catch (err) {
    return next(err);
  }
};

// GET /api/piloto/gancho-imagen → { url } de la imagen vigente, o { url: null } si aún no se sube.
export const getGanchoImagen = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const imagen = await findGanchoImagen();
    return res.status(200).json({ url: imagen?.url ?? null });
  } catch (err) {
    return next(err);
  }
};

// POST /api/piloto/gancho-imagen (multipart: imagen) → reemplaza la imagen del encabezado del gancho.
// El middleware ya filtró formato y tamaño; aquí solo se exige que venga el archivo.
export const uploadGanchoImagen = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = req.file;
    const mimeType = file?.mimetype.toLowerCase() ?? "";
    if (!file || !isGanchoImagenMimeType(mimeType)) throw new PilotoError("IMAGEN_GANCHO_INVALIDA");

    const imagen = await guardarGanchoImagen(file.buffer, mimeType);
    return res.status(200).json({ url: imagen.url });
  } catch (err) {
    return next(err);
  }
};

// GET /api/piloto/citas?status=pendiente_confirmacion|pendiente_fecha (vacío = todas)
export const listCitasRenovacion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = parseCitaStatusFilter(String(req.query.status ?? ""));
    const items = await listarCitasRenovacion(status);
    return res.status(200).json({ items, total: items.length });
  } catch (err) {
    return next(err);
  }
};
