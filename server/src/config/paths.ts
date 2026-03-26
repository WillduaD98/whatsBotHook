import path from "path";
import { fileURLToPath } from "url";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(configDir, "..");

export const serverRoot = path.resolve(srcRoot, "..");
export const repoRoot = path.resolve(serverRoot, "..");
export const uploadsPath = path.join(serverRoot, "public/uploads");

export function resolveUploadsPath(...segments: string[]) {
  return path.join(uploadsPath, ...segments);
}

export function resolvePublicPath(...segments: string[]) {
  return path.join(serverRoot, "public", ...segments);
}
