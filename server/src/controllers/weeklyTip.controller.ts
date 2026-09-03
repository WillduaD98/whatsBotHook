import { Request, Response } from 'express';
import { WeeklyTip } from '../models/WeeklyTip.js';
import fs from "fs/promises";
import path from "path";
import { resolvePublicPath, resolveUploadsPath } from "../config/paths.js";
import { makeUploadFilename, parseBoolean, MAX_BROADCAST_IMAGE_SIZE_BYTES } from './_shared.js';

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

        const uploadDir = resolveUploadsPath("weekly-tip");
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
                const fullPath = resolvePublicPath(rel);
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
            const fullPath = resolvePublicPath(rel);
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
