import { Request, Response } from 'express';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { WeeklyTip } from '../models/WeeklyTip.js';
import { updateConversationState, saveOutgoingMessage } from '../services/context.service.js';
import {
    sendText,
    sendImage,
    uploadImageMedia,
    uploadWhatsAppMediaImage,
    sendTemplateConsejoSemanal
} from '../services/whatsapp.service.js';
import fs from "fs/promises";
import path from "path";

// GET /api/conversations
export const getConversations = async (_req: Request, res: Response) => {
    try {
        const conversations = await Conversation.find().sort({ updatedAt: -1 });
        res.status(200).json(conversations);
    } catch (error) {
        console.error('Error fetching conversations:', error);
        res.status(500).json({ message: 'Error fetching conversations' });
    }
};

// GET /api/messages/:waId
export const getMessages = async (req: Request, res: Response) => {
    try {
        const { waId } = req.params;
        const messages = await Message.find({ waId }).sort({ createdAt: 1 });
        res.status(200).json(messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ message: 'Error fetching messages' });
    }
};

// POST /api/messages/send
export const sendMessage = async (req: Request, res: Response) => {
    try {
        const { waId, text } = req.body;

        if (!waId || !text) {
            return res.status(400).json({ message: 'waId and text are required' });
        }

        // 1. Enviar mensaje a WhatsApp
        const result = await sendText(waId, text);
        const messageId = result?.messages?.[0]?.id;

        // 2. Guardar mensaje en base de datos
        const savedMessage = await saveOutgoingMessage({ 
            waId, 
            text, 
            messageId 
        });
        return res.status(200).json(savedMessage);
    } catch (error) {
        console.error('Error sending message:', error);
        return res.status(500).json({ message: 'Error sending message' });
    }
};

type BroadcastAudience = 'SUSCRITO' | 'NO_SUSCRITO';
type BroadcastResult = {
    audience: BroadcastAudience;
    recipients: number;
    sent: number;
    failed: number;
    failures: string[];
};

type WeeklyTipAudience = 'SUSCRITO' | 'NO_SUSCRITO';
type WeeklyTipBroadcastResult = {
    audience: WeeklyTipAudience;
    recipients: number;
    sent: number;
    failed: number;
    failures: string[];
};

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseBoolean(v: unknown): boolean {
    if (v === true) return true;
    if (v === false) return false;
    const s = String(v || '').trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes" || s === "si" || s === "sí";
}

function makeUploadFilename(originalName: string, mimeType: string, fallbackBase: string) {
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

const MAX_BROADCAST_IMAGES = 10;
const MAX_BROADCAST_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

// POST /api/broadcast/send
export const sendBroadcast = async (req: Request, res: Response) => {
    try {
        const audience = String(req.body?.audience || '') as BroadcastAudience;
        const text = String(req.body?.text || '').trim();
        const confirmRaw = req.body?.confirm;
        const confirm = confirmRaw === true || confirmRaw === "true" || confirmRaw === "1";
        const files = (req as any)?.files as Array<{
            originalname: string;
            mimetype: string;
            size: number;
            buffer: Buffer;
        }> | undefined;

        if (!confirm) {
            return res.status(400).json({ message: 'confirm must be true' });
        }

        if (audience !== 'SUSCRITO' && audience !== 'NO_SUSCRITO') {
            return res.status(400).json({ message: 'audience must be SUSCRITO or NO_SUSCRITO' });
        }

        const hasImages = Array.isArray(files) && files.length > 0;
        if (!text && !hasImages) return res.status(400).json({ message: 'text or images are required' });

        if (text.length > 1500) {
            return res.status(400).json({ message: 'text is too long' });
        }

        if (hasImages && files) {
            if (files.length > MAX_BROADCAST_IMAGES) return res.status(400).json({ message: 'too many images' });
            for (const f of files) {
                if (!String(f.mimetype || '').toLowerCase().startsWith('image/')) {
                    return res.status(400).json({ message: 'only images are allowed' });
                }
                if (!Buffer.isBuffer(f.buffer)) {
                    return res.status(400).json({ message: 'invalid image payload' });
                }
                if (typeof f.size === "number" && f.size > MAX_BROADCAST_IMAGE_SIZE_BYTES) {
                    return res.status(400).json({ message: 'image too large' });
                }
            }
        }

        const query =
            audience === 'SUSCRITO'
                ? { subscriptionStatus: 'SUSCRITO' }
                : { subscriptionStatus: { $ne: 'SUSCRITO' } };

        const recipients = await Conversation.find(query).select('waId').lean();

        if (recipients.length > 5000) {
            return res.status(400).json({ message: 'too many recipients' });
        }

        const result: BroadcastResult = {
            audience,
            recipients: recipients.length,
            sent: 0,
            failed: 0,
            failures: []
        };

        const uploadDir = path.join(process.cwd(), "public/uploads/broadcast");
        const broadcastImages: Array<{ mediaId: string; mediaUrl: string; mimeType: string }> = [];

        if (hasImages && files) {
            await fs.mkdir(uploadDir, { recursive: true });
            for (const f of files) {
                const filename = makeUploadFilename(f.originalname, f.mimetype, "image");
                const fullPath = path.join(uploadDir, filename);
                await fs.writeFile(fullPath, f.buffer);
                const mediaUrl = `/uploads/broadcast/${filename}`;

                const uploaded = await uploadImageMedia({ buffer: f.buffer, filename, mimeType: f.mimetype });
                if (!uploaded?.id) return res.status(500).json({ message: 'failed to upload image to WhatsApp' });
                broadcastImages.push({ mediaId: uploaded.id, mediaUrl, mimeType: f.mimetype });
            }
        }

        let nextIndex = 0;
        const concurrency = 5;

        async function worker() {
            while (true) {
                const idx = nextIndex;
                nextIndex += 1;
                if (idx >= recipients.length) return;

                const waId = String((recipients[idx] as any)?.waId || '');
                if (!waId) continue;
                try {
                    if (text) {
                        const apiRes = await sendText(waId, text);
                        const messageId = apiRes?.messages?.[0]?.id;
                        await saveOutgoingMessage({ waId, text, messageId, type: "text" });
                    }

                    for (const img of broadcastImages) {
                        const apiRes = await sendImage(waId, img.mediaId);
                        const messageId = apiRes?.messages?.[0]?.id;
                        await saveOutgoingMessage({
                            waId,
                            text: "",
                            messageId,
                            type: "image",
                            mediaUrl: img.mediaUrl,
                            mimeType: img.mimeType
                        });
                    }

                    result.sent += 1;
                } catch (e) {
                    result.failed += 1;
                    if (result.failures.length < 50) result.failures.push(waId);
                }
            }
        }

        await Promise.all(Array.from({ length: concurrency }, () => worker()));

        return res.status(200).json(result);
    } catch (error) {
        console.error('Error sending broadcast:', error);
        return res.status(500).json({ message: 'Error sending broadcast' });
    }
};

// POST /api/chats/:waId/weekly-tip
export const sendWeeklyTip = async (req: Request, res: Response) => {
    try {
        const waId = String(req.params?.waId || '').trim();
        const file = (req as any)?.file as
            | { originalname: string; mimetype: string; size: number; buffer: Buffer }
            | undefined;

        if (!waId) return res.status(400).json({ message: 'waId is required' });
        if (!file || !Buffer.isBuffer(file.buffer)) {
            return res.status(400).json({ message: 'headerImage is required' });
        }
        if (!String(file.mimetype || '').toLowerCase().startsWith('image/')) {
            return res.status(400).json({ message: 'only images are allowed' });
        }
        if (typeof file.size === "number" && file.size > MAX_BROADCAST_IMAGE_SIZE_BYTES) {
            return res.status(400).json({ message: 'image too large' });
        }

        const filename = makeUploadFilename(file.originalname, file.mimetype, "weekly-tip-template");
        const mediaId = await uploadWhatsAppMediaImage(
            { buffer: file.buffer, filename, mimeType: file.mimetype },
            undefined
        );
        const apiRes = await sendTemplateConsejoSemanal(waId, mediaId);
        const messageId = apiRes?.messages?.[0]?.id;

        const uploadDir = path.join(process.cwd(), "public/uploads/template");
        await fs.mkdir(uploadDir, { recursive: true });
        const previewFilename = makeUploadFilename(file.originalname, file.mimetype, "template-header");
        const previewFullPath = path.join(uploadDir, previewFilename);
        await fs.writeFile(previewFullPath, file.buffer);
        const mediaUrl = `/uploads/template/${previewFilename}`;

        const savedMessage = await saveOutgoingMessage({
            waId,
            text: "",
            messageId,
            type: "template",
            mediaUrl,
            mimeType: file.mimetype
        });

        return res.status(200).json(savedMessage);
    } catch (error) {
        console.error('Error sending weekly tip template:', error);
        return res.status(500).json({ message: 'Error sending weekly tip template' });
    }
};

// POST /api/broadcast/weekly-tip
export const broadcastWeeklyTip = async (req: Request, res: Response) => {
    try {
        const audience = String(req.body?.audience || '').trim().toUpperCase();
        const file = (req as any)?.file as
            | { originalname: string; mimetype: string; size: number; buffer: Buffer }
            | undefined;
        if (!file || !Buffer.isBuffer(file.buffer)) {
            return res.status(400).json({ message: 'headerImage is required' });
        }
        if (!String(file.mimetype || '').toLowerCase().startsWith('image/')) {
            return res.status(400).json({ message: 'only images are allowed' });
        }
        if (typeof file.size === "number" && file.size > MAX_BROADCAST_IMAGE_SIZE_BYTES) {
            return res.status(400).json({ message: 'image too large' });
        }

        const normalizedAudience: WeeklyTipAudience | null =
            audience === 'SUSCRITO'
                ? 'SUSCRITO'
                : audience === 'NO_SUSCRITO'
                    ? 'NO_SUSCRITO'
                    : null;

        if (!normalizedAudience) {
            return res.status(400).json({ message: 'audience must be SUSCRITO or NO_SUSCRITO' });
        }

        const filename = makeUploadFilename(file.originalname, file.mimetype, "weekly-tip-template");
        const mediaId = await uploadWhatsAppMediaImage(
            { buffer: file.buffer, filename, mimeType: file.mimetype },
            undefined
        );

        const uploadDir = path.join(process.cwd(), "public/uploads/template");
        await fs.mkdir(uploadDir, { recursive: true });
        const previewFilename = makeUploadFilename(file.originalname, file.mimetype, "template-header");
        const previewFullPath = path.join(uploadDir, previewFilename);
        await fs.writeFile(previewFullPath, file.buffer);
        const mediaUrl = `/uploads/template/${previewFilename}`;

        const query =
            normalizedAudience === 'SUSCRITO'
                ? { subscriptionStatus: 'SUSCRITO' }
                : { subscriptionStatus: { $ne: 'SUSCRITO' } };

        const recipients = await Conversation.find(query).select('waId').lean();
        if (recipients.length > 5000) {
            return res.status(400).json({ message: 'too many recipients' });
        }

        const result: WeeklyTipBroadcastResult = {
            audience: normalizedAudience,
            recipients: recipients.length,
            sent: 0,
            failed: 0,
            failures: []
        };

        const delayMs = 700;
        for (const r of recipients) {
            const waId = String((r as any)?.waId || '').trim();
            if (!waId) continue;

            try {
                const apiRes = await sendTemplateConsejoSemanal(waId, mediaId);
                const messageId = apiRes?.messages?.[0]?.id;
                await saveOutgoingMessage({
                    waId,
                    text: "",
                    messageId,
                    type: "template",
                    mediaUrl,
                    mimeType: file.mimetype
                });
                result.sent += 1;
            } catch (e) {
                result.failed += 1;
                if (result.failures.length < 50) result.failures.push(waId);
            }

            await sleep(delayMs);
        }

        return res.status(200).json(result);
    } catch (error) {
        console.error('Error sending weekly tip broadcast:', error);
        return res.status(500).json({ message: 'Error sending weekly tip broadcast' });
    }
};

// GET /api/weekly-tip/active
export const getActiveWeeklyTip = async (_req: Request, res: Response) => {
    try {
        const active = await WeeklyTip.findOne({ active: true }).lean();
        return res.status(200).json(active || null);
    } catch (error) {
        console.error('Error fetching active weekly tip:', error);
        return res.status(500).json({ message: 'Error fetching active weekly tip' });
    }
};

// POST /api/weekly-tip/active (multipart: tipText, replaceImages?, images[])
export const upsertActiveWeeklyTip = async (req: Request, res: Response) => {
    try {
        const tipText = String(req.body?.tipText ?? "").trim();
        const replaceImages = parseBoolean(req.body?.replaceImages);
        const activeFlag = req.body?.active === undefined ? true : parseBoolean(req.body?.active);
        const files = (req as any)?.files as Array<{
            originalname: string;
            mimetype: string;
            size: number;
            buffer: Buffer;
        }> | undefined;

        if (!tipText && (!files || files.length === 0)) {
            return res.status(400).json({ message: 'tipText is required (or provide images)' });
        }

        const uploadDir = path.join(process.cwd(), "public/uploads/weekly-tip");
        await fs.mkdir(uploadDir, { recursive: true });

        const currentActive = await WeeklyTip.findOne({ active: true });
        const doc = currentActive ?? new WeeklyTip({ active: true, tipText: "" });

        if (typeof tipText === "string" && tipText.length > 0) {
            doc.tipText = tipText;
        }

        if (replaceImages && Array.isArray(doc.images) && doc.images.length > 0) {
            for (const img of doc.images as any[]) {
                const mediaUrl = String(img?.mediaUrl || "");
                const rel = mediaUrl.replace(/^\/+/, "");
                if (!rel.startsWith("uploads/weekly-tip/")) continue;
                const fullPath = path.join(process.cwd(), "public", rel);
                try {
                    await fs.unlink(fullPath);
                } catch (_) {
                }
            }
            doc.set("images", []);
        }

        const incomingFiles = Array.isArray(files) ? files : [];
        if (incomingFiles.length > 0) {
            for (const f of incomingFiles) {
                if (!String(f.mimetype || '').toLowerCase().startsWith('image/')) {
                    return res.status(400).json({ message: 'only images are allowed' });
                }
                if (!Buffer.isBuffer(f.buffer)) {
                    return res.status(400).json({ message: 'invalid image payload' });
                }
                if (typeof f.size === "number" && f.size > MAX_BROADCAST_IMAGE_SIZE_BYTES) {
                    return res.status(400).json({ message: 'image too large' });
                }
            }

            const existingCount = Array.isArray(doc.images) ? doc.images.length : 0;
            if (existingCount + incomingFiles.length > 10) {
                return res.status(400).json({ message: 'too many images (max 10)' });
            }

            for (const f of incomingFiles) {
                const filename = makeUploadFilename(f.originalname, f.mimetype, "weekly-tip");
                const fullPath = path.join(uploadDir, filename);
                await fs.writeFile(fullPath, f.buffer);
                const mediaUrl = `/uploads/weekly-tip/${filename}`;
                (doc.images as any[]).push({ filename, mediaUrl, mimeType: f.mimetype });
            }
        }

        doc.active = activeFlag;
        await doc.save();
        if (doc.active) {
            await WeeklyTip.updateMany({ _id: { $ne: doc._id } }, { $set: { active: false } });
        }

        const saved = await WeeklyTip.findById(doc._id).lean();
        return res.status(200).json(saved);
    } catch (error) {
        console.error('Error upserting active weekly tip:', error);
        return res.status(500).json({ message: 'Error upserting active weekly tip' });
    }
};

// DELETE /api/weekly-tip/active/images/:imageId
export const deleteActiveWeeklyTipImage = async (req: Request, res: Response) => {
    try {
        const imageId = String(req.params?.imageId || '').trim();
        if (!imageId) return res.status(400).json({ message: 'imageId is required' });

        const doc = await WeeklyTip.findOne({ active: true });
        if (!doc) return res.status(404).json({ message: 'no active weekly tip' });

        const img = (doc.images as any)?.id?.(imageId) as any;
        if (!img) return res.status(404).json({ message: 'image not found' });

        const mediaUrl = String(img?.mediaUrl || "");
        const rel = mediaUrl.replace(/^\/+/, "");
        if (rel.startsWith("uploads/weekly-tip/")) {
            const fullPath = path.join(process.cwd(), "public", rel);
            try {
                await fs.unlink(fullPath);
            } catch (_) {
            }
        }

        if (typeof img?.deleteOne === "function") img.deleteOne();
        await doc.save();
        const saved = await WeeklyTip.findById(doc._id).lean();
        return res.status(200).json(saved);
    } catch (error) {
        console.error('Error deleting weekly tip image:', error);
        return res.status(500).json({ message: 'Error deleting weekly tip image' });
    }
};

// PATCH /api/conversations/:waId
export const updateConversation = async (req: Request, res: Response) => {
    try {
        const { waId } = req.params;
        const { stage, verificationStatus, subscriptionStatus } = req.body;
        
        const patch: any = {};
        if (stage !== undefined) patch.stage = stage;
        if (verificationStatus !== undefined) patch.verificationStatus = verificationStatus;
        if (subscriptionStatus !== undefined) patch.subscriptionStatus = subscriptionStatus;
        
        if (Object.keys(patch).length === 0) {
            return res.status(400).json({ message: 'No fields to update' });
        }

        const updated = await updateConversationState(waId, patch);
        return res.status(200).json(updated);
    } catch (error) {
        console.error('Error updating conversation:', error);
        return res.status(500).json({ message: 'Error updating conversation' });
    }
};

type ProspectStatsItem = {
    waId: string;
    verificationStatus: string;
    lastStage: string;
    lastIntent: string;
    maxPreSolicitudStage: string;
    stuckStage: string | null;
    lastUserInteractionAt: string;
    createdAt: string;
    updatedAt: string;
};

type ProspectStatsResponse = {
    range: { from: string | null; to: string | null };
    totals: { prospects: number; sinVerificar: number; preSolicitudCompleta: number };
    counts: {
        byLastStage: Array<{ key: string; label: string; count: number }>;
        byLastIntent: Array<{ key: string; label: string; count: number }>;
        byMaxPreSolicitudStage: Array<{ key: string; label: string; count: number }>;
        byVerificationStatus: Array<{ key: string; label: string; count: number }>;
    };
    items: ProspectStatsItem[];
};

function normalizeStageKey(stage: unknown): string {
    return typeof stage === "string" && stage.trim().length > 0 ? stage.trim() : "UNKNOWN";
}

function stageLabel(stage: string): string {
    if (stage === "start") return "Menú principal";
    if (stage === "ASESOR") return "Asesor";
    if (stage === "PRE_SOLICITUD:aviso_privacidad") return "Pre-sol: Aviso privacidad";
    if (stage === "PRE_SOLICITUD:espera_ubicacion") return "Pre-sol: Ubicación";
    if (stage === "PRE_SOLICITUD:espera_fotos_negocio") return "Pre-sol: Fotos negocio";
    if (stage === "PRE_SOLICITUD:espera_ine_frente") return "Pre-sol: INE frente";
    if (stage === "PRE_SOLICITUD:espera_ine_atras") return "Pre-sol: INE atrás";
    if (stage === "PRE_SOLICITUD:espera_comprobante") return "Pre-sol: Comprobante";
    if (stage === "SIN_VERIFICAR") return "Sin verificar";
    if (stage === "PRE_SOLICITUD_COMPLETA") return "Pre-solicitud completa";
    return stage;
}

function verificationLabel(status: string): string {
    if (status === "NONE") return "Sin verificar";
    if (status === "PRE_SOLICITUD_COMPLETA") return "Pre-solicitud completa";
    return status;
}

function normalizeIntentKey(intent: unknown): string {
    return typeof intent === "string" && intent.trim().length > 0 ? intent.trim() : "UNKNOWN";
}

function intentLabel(intent: string): string {
    if (intent === "SALUDO") return "Menú inicial";
    if (intent === "FAQ_MENU") return "Menú FAQ";
    if (intent === "REQUISITOS") return "Requisitos";
    if (intent === "MONTOS_PLAZOS") return "Montos y plazos";
    if (intent === "EXPLICACION") return "Explicación / Cómo funciona";
    if (intent === "PRE_SOLICITUD") return "Pre-solicitud (intención)";
    if (intent === "CONFIANZA") return "Confianza";
    if (intent === "ASESOR") return "Asesor";
    if (intent === "ENGAGE") return "Engage";
    if (intent === "UNKNOWN") return "Unknown";
    return intent;
}

function toDateOrNull(v: unknown): Date | null {
    if (typeof v !== "string" || v.trim().length === 0) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
}

function endOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
}

// En este proyecto no se persiste un historial de etapas; el "máximo alcanzado" se infiere con stage actual + flags en slots.prev.
function maxPreSolicitudStageForConversation(conv: any): string {
    const status = typeof conv?.verificationStatus === "string" ? conv.verificationStatus : "NONE";
    if (status === "PRE_SOLICITUD_COMPLETA") return "PRE_SOLICITUD_COMPLETA";

    const stage = normalizeStageKey(conv?.stage);
    if (stage.startsWith("PRE_SOLICITUD:")) return stage;

    const lastIntent = typeof conv?.lastIntent === "string" ? conv.lastIntent : "";
    const prev = conv?.slots?.prev;
    if (!prev || typeof prev !== "object") {
        return lastIntent === "PRE_SOLICITUD" ? "PRE_SOLICITUD:aviso_privacidad" : "SIN_VERIFICAR";
    }

    if (prev.comprobante === true) return "PRE_SOLICITUD:espera_comprobante";
    if (prev.ineAtras === true) return "PRE_SOLICITUD:espera_ine_atras";
    if (prev.ineFrente === true) return "PRE_SOLICITUD:espera_ine_frente";

    const fotos = Number(prev.negocioFotos || 0);
    if (fotos > 0) return "PRE_SOLICITUD:espera_fotos_negocio";

    return lastIntent === "PRE_SOLICITUD" ? "PRE_SOLICITUD:aviso_privacidad" : "SIN_VERIFICAR";
}

function stuckStageForConversation(conv: any): string | null {
    const status = typeof conv?.verificationStatus === "string" ? conv.verificationStatus : "NONE";
    if (status === "PRE_SOLICITUD_COMPLETA") return null;

    const stage = normalizeStageKey(conv?.stage);
    if (stage.startsWith("PRE_SOLICITUD:")) return stage;
    
    const lastIntent = typeof conv?.lastIntent === "string" ? conv.lastIntent : "";
    const prev = conv?.slots?.prev;

    if (lastIntent !== "PRE_SOLICITUD") return null;

    if (!prev || typeof prev !== "object") return "PRE_SOLICITUD:aviso_privacidad";

    if (prev.comprobante === true) return "PRE_SOLICITUD:espera_comprobante";
    if (prev.ineAtras === true) return "PRE_SOLICITUD:espera_comprobante";
    if (prev.ineFrente === true) return "PRE_SOLICITUD:espera_ine_atras";

    const fotos = Number(prev.negocioFotos || 0);
    if (fotos >= 5) return "PRE_SOLICITUD:espera_ine_frente";
    if (fotos > 0) return "PRE_SOLICITUD:espera_fotos_negocio";

    return "PRE_SOLICITUD:aviso_privacidad";
}

function toSortedCounts(input: Map<string, number>, preferredOrder: string[]): Array<{ key: string; label: string; count: number }> {
    const entries = Array.from(input.entries());
    const orderIndex = new Map<string, number>(preferredOrder.map((k, i) => [k, i]));
    entries.sort((a, b) => {
        const ai = orderIndex.has(a[0]) ? (orderIndex.get(a[0]) as number) : 9999;
        const bi = orderIndex.has(b[0]) ? (orderIndex.get(b[0]) as number) : 9999;
        if (ai !== bi) return ai - bi;
        return a[0].localeCompare(b[0]);
    });
    return entries.map(([key, count]) => ({ key, label: stageLabel(key), count }));
}

// GET /api/stats/prospectos?from=YYYY-MM-DD&to=YYYY-MM-DD
export const getProspectsStats = async (req: Request, res: Response) => {
    try {
        const fromRaw = req.query.from;
        const toRaw = req.query.to;

        const from = toDateOrNull(fromRaw);
        const to = toDateOrNull(toRaw);

        const match: any = {};
        if (from || to) {
            match.lastUserInteractionAt = {};
            if (from) match.lastUserInteractionAt.$gte = from;
            if (to) match.lastUserInteractionAt.$lte = endOfDay(to);
        }

        const conversations = await Conversation.find(match).sort({ lastUserInteractionAt: -1 });

        const byLastStage = new Map<string, number>();
        const byLastIntent = new Map<string, number>();
        const byMax = new Map<string, number>();
        const byStatus = new Map<string, number>();

        let sinVerificar = 0;
        let preSolicitudCompleta = 0;

        const items: ProspectStatsItem[] = conversations.map((c: any) => {
            const verificationStatus = typeof c?.verificationStatus === "string" ? c.verificationStatus : "NONE";
            const lastStage = normalizeStageKey(c?.stage);
            const lastIntent = normalizeIntentKey(c?.lastIntent);
            const maxPreSolicitudStage = maxPreSolicitudStageForConversation(c);
            const stuckStage = stuckStageForConversation(c);

            byLastStage.set(lastStage, (byLastStage.get(lastStage) || 0) + 1);
            byLastIntent.set(lastIntent, (byLastIntent.get(lastIntent) || 0) + 1);
            byMax.set(maxPreSolicitudStage, (byMax.get(maxPreSolicitudStage) || 0) + 1);
            byStatus.set(verificationStatus, (byStatus.get(verificationStatus) || 0) + 1);

            if (verificationStatus === "NONE") sinVerificar += 1;
            if (verificationStatus === "PRE_SOLICITUD_COMPLETA") preSolicitudCompleta += 1;

            return {
                waId: c.waId,
                verificationStatus,
                lastStage,
                lastIntent,
                maxPreSolicitudStage,
                stuckStage,
                lastUserInteractionAt: new Date(c.lastUserInteractionAt).toISOString(),
                createdAt: new Date(c.createdAt).toISOString(),
                updatedAt: new Date(c.updatedAt).toISOString()
            };
        });

        const maxOrder = [
            "SIN_VERIFICAR",
            "PRE_SOLICITUD:aviso_privacidad",
            "PRE_SOLICITUD:espera_ubicacion",
            "PRE_SOLICITUD:espera_fotos_negocio",
            "PRE_SOLICITUD:espera_ine_frente",
            "PRE_SOLICITUD:espera_ine_atras",
            "PRE_SOLICITUD:espera_comprobante",
            "PRE_SOLICITUD_COMPLETA"
        ];

        const resp: ProspectStatsResponse = {
            range: {
                from: from ? from.toISOString() : null,
                to: to ? endOfDay(to).toISOString() : null
            },
            totals: { prospects: conversations.length, sinVerificar, preSolicitudCompleta },
            counts: {
                byLastStage: toSortedCounts(byLastStage, ["start", "ASESOR", ...maxOrder]),
                byLastIntent: Array.from(byLastIntent.entries())
                    .sort((a, b) => {
                        const preferred = ["SALUDO", "REQUISITOS", "MONTOS_PLAZOS", "EXPLICACION", "PRE_SOLICITUD", "CONFIANZA", "ASESOR", "ENGAGE", "UNKNOWN"];
                        const ai = preferred.indexOf(a[0]);
                        const bi = preferred.indexOf(b[0]);
                        if (ai !== -1 || bi !== -1) {
                            if (ai === -1) return 1;
                            if (bi === -1) return -1;
                            return ai - bi;
                        }
                        return a[0].localeCompare(b[0]);
                    })
                    .map(([key, count]) => ({ key, label: intentLabel(key), count })),
                byMaxPreSolicitudStage: toSortedCounts(byMax, maxOrder),
                byVerificationStatus: Array.from(byStatus.entries())
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([key, count]) => ({ key, label: verificationLabel(key), count }))
            },
            items
        };

        return res.status(200).json(resp);
    } catch (error) {
        console.error("Error fetching prospects stats:", error);
        return res.status(500).json({ message: "Error fetching prospects stats" });
    }
};
