// Rutas del panel 🔥 Piloto: imagen del encabezado del gancho y citas de renovación agendadas por el bot.
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { getGanchoImagen, listCitasRenovacion, uploadGanchoImagen } from "../../controllers/piloto.controller.js";
import { ganchoImagenUploadMiddleware } from "./uploads.js";

export const pilotoRouter = Router();

pilotoRouter.get("/piloto/gancho-imagen", requireAuth, getGanchoImagen);
pilotoRouter.post("/piloto/gancho-imagen", requireAuth, ganchoImagenUploadMiddleware, uploadGanchoImagen);
pilotoRouter.get("/piloto/citas", requireAuth, listCitasRenovacion);
