import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { webhookRouter } from "./routes/webhook.routes.js";
import { repoRoot, uploadsPath } from "./config/paths.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);

  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    }
    next();
  });

  const corsOriginsRaw = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || "").trim();
  const allowedOrigins = corsOriginsRaw
    ? corsOriginsRaw
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
    : null;

  app.use(
    cors({
      origin: allowedOrigins || true
    })
  );

  // Servir archivos estáticos (imágenes cargadas)
  // Ajuste: como se ejecuta desde 'server/', la ruta relativa es 'public/uploads'
  app.use("/uploads", express.static(uploadsPath));
  const altUploadsPath = path.join(process.cwd(), "public/uploads");
  if (altUploadsPath !== uploadsPath && fs.existsSync(altUploadsPath)) {
    app.use("/uploads", express.static(altUploadsPath));
  }

  // Necesitamos raw body para la firma de Meta
  app.use(
    express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
      limit: "1mb"
    })
  );

  app.get("/health", (_req, res) => {
        res.status(200).json({ 
            status: "ok", 
            uploadsPath: uploadsPath,
            cwd: process.cwd()
        });
    });
  app.use("/", webhookRouter);

  const clientDistPath = path.join(repoRoot, "client/dist");
  const clientIndexHtmlPath = path.join(clientDistPath, "index.html");
  if (fs.existsSync(clientIndexHtmlPath)) {
    app.use(express.static(clientDistPath));
    app.get("*", (req, res, next) => {
      if (req.method !== "GET") return next();
      if (req.path.startsWith("/api") || req.path.startsWith("/webhook") || req.path.startsWith("/uploads") || req.path.startsWith("/health")) {
        return next();
      }
      const accept = req.header("accept") || "";
      if (!accept.includes("text/html")) return next();
      return res.sendFile(clientIndexHtmlPath);
    });
  }

  return app;
}
