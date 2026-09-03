import { Request, Response } from 'express';
import { Conversation } from '../models/Conversation.js';
import { saveOutgoingMessage } from '../services/context.service.js';
import {
    sendText,
    sendImage,
    uploadImageMedia,
    uploadWhatsAppMediaImage,
    sendTemplateConsejoSemanal
} from '../services/whatsapp.service.js';
import fs from "fs/promises";
import path from "path";
import { resolveUploadsPath } from "../config/paths.js";
import { makeUploadFilename, MAX_BROADCAST_IMAGES, MAX_BROADCAST_IMAGE_SIZE_BYTES, sleep } from './_shared.js';

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

        const uploadDir = resolveUploadsPath("template");
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
