export function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseBoolean(v: unknown): boolean {
    if (v === true) return true;
    if (v === false) return false;
    const s = String(v || '').trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes" || s === "si" || s === "sí";
}

export function makeUploadFilename(originalName: string, mimeType: string, fallbackBase: string) {
    const safeBase = String(originalName || fallbackBase)
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9.\-_]/g, "")
        .slice(0, 80);
    const baseNoExt = safeBase.replace(/\.[a-z0-9]+$/i, "") || fallbackBase;
    const extFromMime = String(mimeType || "").split("/")[1] || "bin";
    const ext = extFromMime.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    return `${Date.now()}-${Math.random().toString(16).slice(2)}-${baseNoExt}.${ext}`;
}

export const MAX_BROADCAST_IMAGES = 10;
export const MAX_BROADCAST_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
