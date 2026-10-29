// Imagen fija del encabezado de la plantilla prox_credito_gancho: la sube el operador desde el panel y
// se reutiliza en cada envío. Vive en uploads/piloto/ para que el panel también la pueda mostrar.
import fs from "fs/promises";
import path from "path";
import { resolveUploadsPath } from "../config/paths.js";
import { GANCHO_IMAGEN_FORMATOS, type GanchoImagenMimeType } from "../shared/pilotoTemplates.constants.js";
import type { GanchoImagen } from "../types/piloto.types.js";

const GANCHO_DIR = resolveUploadsPath("piloto");
const GANCHO_BASENAME = "prox_credito_gancho";
const MIME_TYPES = Object.keys(GANCHO_IMAGEN_FORMATOS) as GanchoImagenMimeType[];

function filenameFor(mimeType: GanchoImagenMimeType): string {
  return `${GANCHO_BASENAME}.${GANCHO_IMAGEN_FORMATOS[mimeType]}`;
}

// ENOENT = el archivo no existe (caso normal); cualquier otro error del disco es falla nuestra y sube.
function isFileNotFound(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "ENOENT";
}

async function modifiedAt(filePath: string): Promise<Date | null> {
  try {
    return (await fs.stat(filePath)).mtime;
  } catch (err) {
    if (isFileNotFound(err)) return null;
    throw err;
  }
}

// La imagen vigente (JPG o PNG); null si todavía no se ha subido ninguna.
export async function findGanchoImagen(): Promise<GanchoImagen | null> {
  for (const mimeType of MIME_TYPES) {
    const filename = filenameFor(mimeType);
    const filePath = path.join(GANCHO_DIR, filename);
    const mtime = await modifiedAt(filePath);
    if (mtime) return { path: filePath, filename, mimeType, url: `/uploads/piloto/${filename}?v=${mtime.getTime()}` };
  }
  return null;
}

// Reemplaza la imagen: escribe la nueva y borra la del otro formato, para que solo quede una vigente.
export async function guardarGanchoImagen(buffer: Buffer, mimeType: GanchoImagenMimeType): Promise<GanchoImagen> {
  await fs.mkdir(GANCHO_DIR, { recursive: true });
  await fs.writeFile(path.join(GANCHO_DIR, filenameFor(mimeType)), buffer);
  const otros = MIME_TYPES.filter((otro) => otro !== mimeType);
  await Promise.all(otros.map((otro) => fs.rm(path.join(GANCHO_DIR, filenameFor(otro)), { force: true })));

  const guardada = await findGanchoImagen();
  // Recién escrita: si no aparece es falla del disco, no del operador.
  if (!guardada) throw new Error(`[ganchoImagen] no se encontró la imagen recién guardada en ${GANCHO_DIR}`);
  return guardada;
}
