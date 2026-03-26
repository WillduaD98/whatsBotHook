
import axios from "axios";
import fs from "fs";
import path from "path";
import { env } from "../config/env.js";
import { uploadsPath } from "../config/paths.js";

// Obtener la URL de descarga desde el ID del media
export async function getMediaUrl(mediaId: string): Promise<string | null> {
  try {
    const url = `https://graph.facebook.com/${env.GRAPH_VERSION}/${mediaId}`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` }
    });
    return response.data.url;
  } catch (error) {
    console.error("Error al obtener URL del media:", error);
    return null;
  }
}

// Descargar el archivo y guardarlo localmente
export async function downloadMedia(mediaUrl: string, filename: string): Promise<string | null> {
  try {
    const response = await axios({
      method: "GET",
      url: mediaUrl,
      responseType: "stream",
      headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` }
    });

    // Asegurar que el directorio existe
    // Ajuste: si se ejecuta desde 'server/', usar 'public/uploads'
    if (!fs.existsSync(uploadsPath)) {
      fs.mkdirSync(uploadsPath, { recursive: true });
    }

    const filePath = path.join(uploadsPath, filename);
    const writer = fs.createWriteStream(filePath);

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on("finish", () => resolve(`/uploads/${filename}`));
      writer.on("error", reject);
    });
  } catch (error) {
    console.error("Error al descargar media:", error);
    return null;
  }
}
