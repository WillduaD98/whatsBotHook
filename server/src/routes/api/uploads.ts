import multer from "multer";
import type { Request, Response, NextFunction } from "express";
import { GANCHO_IMAGEN_MAX_BYTES, isGanchoImagenMimeType } from "../../shared/pilotoTemplates.constants.js";

const MAX_BROADCAST_FILES = 10;
const MAX_BROADCAST_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

const broadcastUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: MAX_BROADCAST_FILES, fileSize: MAX_BROADCAST_IMAGE_SIZE_BYTES },
  fileFilter: (_req: any, file: any, cb: any) => {
    const ok = typeof file?.mimetype === "string" && file.mimetype.toLowerCase().startsWith("image/");
    cb(ok ? undefined : new Error("Only image files are allowed"), ok);
  }
});

const weeklyTipUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: MAX_BROADCAST_FILES, fileSize: MAX_BROADCAST_IMAGE_SIZE_BYTES },
  fileFilter: (_req: any, file: any, cb: any) => {
    const ok = typeof file?.mimetype === "string" && file.mimetype.toLowerCase().startsWith("image/");
    cb(ok ? undefined : new Error("Only image files are allowed"), ok);
  }
});

const weeklyTipTemplateUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: MAX_BROADCAST_IMAGE_SIZE_BYTES },
  fileFilter: (_req: any, file: any, cb: any) => {
    const ok = typeof file?.mimetype === "string" && file.mimetype.toLowerCase().startsWith("image/");
    cb(ok ? undefined : new Error("Only image files are allowed"), ok);
  }
});

// WhatsApp acepta videos de hasta 16MB y solo en estos formatos (con códec H.264 + AAC).
const MAX_TEMPLATE_VIDEO_SIZE_BYTES = 16 * 1024 * 1024;
const TEMPLATE_VIDEO_MIMETYPES = new Set(["video/mp4", "video/3gpp"]);

// Recibe 1 solo video en memoria (no se guarda en disco aquí) para el header de una plantilla.
// Los tipos de (_req, file, cb) los infiere TypeScript desde multer, por eso no se escriben a mano.
const templateVideoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: MAX_TEMPLATE_VIDEO_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (TEMPLATE_VIDEO_MIMETYPES.has(file.mimetype.toLowerCase())) return cb(null, true);
    cb(new Error("Solo se permiten videos MP4 o 3GP"));
  }
});

const MAX_CREDITS_CSV_SIZE_BYTES = 5 * 1024 * 1024;
const CREDITS_CSV_MIMETYPES = new Set(["text/csv", "application/vnd.ms-excel"]);

const creditsCsvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: MAX_CREDITS_CSV_SIZE_BYTES },
  fileFilter: (_req: any, file: any, cb: any) => {
    const ok = CREDITS_CSV_MIMETYPES.has(String(file?.mimetype || "").toLowerCase());
    cb(ok ? undefined : new Error("Only CSV files are allowed"), ok);
  }
});

function multerArrayMiddleware(upload: multer.Multer, fieldName: string, maxFiles: number) {
  return (req: any, res: any, next: any) => {
    upload.array(fieldName, maxFiles)(req, res, (err: any) => {
      if (!err) return next();
      const isMulterError = err instanceof multer.MulterError;
      const code = isMulterError ? err.code : "";
      const status = code === "LIMIT_FILE_SIZE" ? 413 : 400;
      const message =
        code === "LIMIT_FILE_SIZE"
          ? `Imagen demasiado grande. Máximo ${Math.floor(MAX_BROADCAST_IMAGE_SIZE_BYTES / (1024 * 1024))}MB por imagen.`
          : code === "LIMIT_FILE_COUNT"
            ? `Demasiadas imágenes. Máximo ${maxFiles}.`
            : String(err?.message || "Error al subir imágenes");
      return res.status(status).json({ message });
    });
  };
}

// Envuelve un upload de 1 archivo para responder errores legibles (413 si pesa de más, 400 si no es válido).
// maxBytes y mediaLabel solo cambian el texto del error; por defecto siguen siendo los de imagen,
// así los usos que ya existían se comportan igual que antes.
function multerSingleMiddleware(
  upload: multer.Multer,
  fieldName: string,
  maxBytes: number = MAX_BROADCAST_IMAGE_SIZE_BYTES,
  mediaLabel: string = "Imagen"
) {
  return (req: Request, res: Response, next: NextFunction) => {
    // multer entrega un MulterError (límite de tamaño/cantidad) o el Error que lanzó el fileFilter.
    // El "| string" solo existe porque el tipo de Express permite next("route"); multer nunca lo usa.
    upload.single(fieldName)(req, res, (err?: Error | string) => {
      if (!err) return next();
      const code = err instanceof multer.MulterError ? err.code : "";
      const status = code === "LIMIT_FILE_SIZE" ? 413 : 400;
      const message =
        code === "LIMIT_FILE_SIZE"
          ? `${mediaLabel} demasiado grande. Máximo ${Math.floor(maxBytes / (1024 * 1024))}MB.`
          : (err instanceof Error && err.message) || `Error al subir ${mediaLabel.toLowerCase()}`;
      return res.status(status).json({ message });
    });
  };
}

export const broadcastUploadMiddleware = multerArrayMiddleware(broadcastUpload, "images", MAX_BROADCAST_FILES);
export const weeklyTipUploadMiddleware = multerArrayMiddleware(weeklyTipUpload, "images", MAX_BROADCAST_FILES);
export const weeklyTipTemplateUploadMiddleware = multerSingleMiddleware(weeklyTipTemplateUpload, "headerImage");
// Video del header de la plantilla ejemplo_comprobante_pago (campo "headerVideo" del FormData).
export const templateVideoUploadMiddleware = multerSingleMiddleware(
  templateVideoUpload,
  "headerVideo",
  MAX_TEMPLATE_VIDEO_SIZE_BYTES,
  "Video"
);

export function creditsCsvUploadMiddleware(req: any, res: any, next: any) {
  creditsCsvUpload.single("file")(req, res, (err: any) => {
    if (!err) return next();
    const isMulterError = err instanceof multer.MulterError;
    const code = isMulterError ? err.code : "";
    const status = code === "LIMIT_FILE_SIZE" ? 413 : 400;
    const message =
      code === "LIMIT_FILE_SIZE"
        ? `Archivo demasiado grande. Máximo ${Math.floor(MAX_CREDITS_CSV_SIZE_BYTES / (1024 * 1024))}MB.`
        : String(err?.message || "Error al subir el archivo CSV");
    return res.status(status).json({ message });
  });
}

// Imagen fija del encabezado de prox_credito_gancho (campo "imagen" del FormData): solo JPG/PNG, como pide Meta.
const ganchoImagenUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: GANCHO_IMAGEN_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (isGanchoImagenMimeType(file.mimetype.toLowerCase())) return cb(null, true);
    cb(new Error("Solo se permiten imágenes JPG o PNG"));
  }
});
export const ganchoImagenUploadMiddleware = multerSingleMiddleware(ganchoImagenUpload, "imagen", GANCHO_IMAGEN_MAX_BYTES);
