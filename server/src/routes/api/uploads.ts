import multer from "multer";

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

function multerSingleMiddleware(upload: multer.Multer, fieldName: string) {
  return (req: any, res: any, next: any) => {
    upload.single(fieldName)(req, res, (err: any) => {
      if (!err) return next();
      const isMulterError = err instanceof multer.MulterError;
      const code = isMulterError ? err.code : "";
      const status = code === "LIMIT_FILE_SIZE" ? 413 : 400;
      const message =
        code === "LIMIT_FILE_SIZE"
          ? `Imagen demasiado grande. Máximo ${Math.floor(MAX_BROADCAST_IMAGE_SIZE_BYTES / (1024 * 1024))}MB.`
          : String(err?.message || "Error al subir imagen");
      return res.status(status).json({ message });
    });
  };
}

export const broadcastUploadMiddleware = multerArrayMiddleware(broadcastUpload, "images", MAX_BROADCAST_FILES);
export const weeklyTipUploadMiddleware = multerArrayMiddleware(weeklyTipUpload, "images", MAX_BROADCAST_FILES);
export const weeklyTipTemplateUploadMiddleware = multerSingleMiddleware(weeklyTipTemplateUpload, "headerImage");
