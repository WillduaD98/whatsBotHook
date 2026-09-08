import { Request, Response } from 'express';
import { Message } from '../models/Message.js';
import { saveOutgoingMessage } from '../services/context.service.js';
import {
    sendText,
    uploadWhatsAppMediaImage,
    sendTemplateConsejoSemanal,
    sendTemplateRecordatorioPago,
    sendTemplateRecordatorioPagoHoy,
    sendTemplatePagoAtrasado,
    sendTemplateRegularizaTuPago,
    sendTemplatePagoAtrasadoCobranza
} from '../services/whatsapp.service.js';
import fs from "fs/promises";
import path from "path";
import { resolveUploadsPath } from "../config/paths.js";
import { makeUploadFilename, MAX_BROADCAST_IMAGE_SIZE_BYTES } from './_shared.js';

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

        const uploadDir = resolveUploadsPath("template");
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

// POST /api/chats/:waId/payment-reminder   (body.tipo: "antes" | "hoy" | "atraso")
export const sendPaymentReminder = async (req: Request, res: Response) => {
    try {
        const waId = String(req.params?.waId || '').trim();
        const tipoRaw = String(req.body?.tipo ?? 'antes').trim().toLowerCase();
        const tiposValidos = new Set(['hoy', 'atraso', 'atraso2', 'atrasolargo']);
        const tipo = tiposValidos.has(tipoRaw) ? tipoRaw : 'antes';

        const nombre = String(req.body?.nombre ?? '').trim();
        const fecha = String(req.body?.fecha ?? '').trim();
        const monto = String(req.body?.monto ?? '').trim();
        const clabe = String(req.body?.clabe ?? '').trim();
        const referencia = String(req.body?.referencia ?? '').trim();

        if (!waId) return res.status(400).json({ message: 'waId is required' });

        // --- Recordatorio del DIA DE PAGO (recordatorio_hoy_es_tu_pago) ---
        if (tipo === 'hoy') {
            const values = { monto, clabe, referencia };
            const missing = Object.entries(values).filter(([, v]) => !v).map(([k]) => k);
            if (missing.length > 0) {
                return res.status(400).json({ message: `Missing fields: ${missing.join(', ')}` });
            }

            const apiRes = await sendTemplateRecordatorioPagoHoy(waId, { monto, clabe, referencia });
            const messageId = apiRes?.messages?.[0]?.id;

            const preview =
                `Hola 😊 Te recordamos que *HOY* corresponde realizar tu pago.\n\n` +
                `💰 *Monto:* $${monto}\n` +
                `🏦 *CLABE:* ${clabe}\n` +
                `🔢 *Referencia:* ${referencia}\n\n` +
                `Te agradecemos realizarlo el día de hoy para evitar recargos por atraso. Si ya realizaste tu pago, puedes hacer caso omiso a este mensaje. ¡Muchas gracias! 🙌`;

            const savedMessage = await saveOutgoingMessage({
                waId,
                text: preview,
                messageId,
                type: 'template',
                metadata: {
                    template: 'recordatorio_hoy_es_tu_pago',
                    tipo,
                    variables: { monto, clabe, referencia }
                }
            });

            return res.status(200).json(savedMessage);
        }

        // --- Recordatorio de PAGO ATRASADO (pago_atrasado) ---
        if (tipo === 'atraso') {
            const values = { clabe, referencia };
            const missing = Object.entries(values).filter(([, v]) => !v).map(([k]) => k);
            if (missing.length > 0) {
                return res.status(400).json({ message: `Missing fields: ${missing.join(', ')}` });
            }

            const apiRes = await sendTemplatePagoAtrasado(waId, { clabe, referencia });
            const messageId = apiRes?.messages?.[0]?.id;

            const preview =
                `Hola 😊 Vemos que tu pago presenta algunos *días de atraso* y queremos ayudarte a regularizarlo de la mejor manera. Recuerda que *día con día* tu pago genera *comisiones por pago tardío*.\n\n` +
                `🏦 *CLABE:* ${clabe}\n` +
                `🔢 *Referencia:* ${referencia}\n\n` +
                `📲 Antes de realizar tu pago, *llámanos al 4777180504*. Contamos con opciones de negociación para clientes con atraso y podrías recibir una *bonificación o descuento* en la comisión generada.\n\n` +
                `¡Con gusto te ayudamos a encontrar la mejor opción! 😊`;

            const savedMessage = await saveOutgoingMessage({
                waId,
                text: preview,
                messageId,
                type: 'template',
                metadata: {
                    template: 'pago_atrasado',
                    tipo,
                    variables: { clabe, referencia }
                }
            });

            return res.status(200).json(savedMessage);
        }



        // --- Recordatorio 2do DIA DE ATRASO (regulariza_tu_pago) ---
        if (tipo === 'atraso2') {
            const values = { nombre, clabe, referencia };
            const missing = Object.entries(values).filter(([, v]) => !v).map(([k]) => k);
            if (missing.length > 0) {
                return res.status(400).json({ message: `Missing fields: ${missing.join(', ')}` });
            }

            const apiRes = await sendTemplateRegularizaTuPago(waId, { nombre, clabe, referencia });
            const messageId = apiRes?.messages?.[0]?.id;

            const preview =
                `Hola ${nombre}, tu crédito presenta *2 días de atraso* y aún no recibimos tu pago.\n\n` +
                `⚠️ Esto ya genera *comisiones por pago tardío que aumentan cada día*. De continuar, tu cuenta pasará a *cobranza formal* y se reportará a las *sociedades de información crediticia*, afectando tu historial y tu acceso a crédito futuro.\n\n` +
                `Todavía estás a tiempo de resolverlo hoy:\n` +
                `🏦 *CLABE:* ${clabe}\n` +
                `🔢 *Referencia:* ${referencia}\n\n` +
                `📲 *Comunícate HOY al 4777180504* para regularizar tu pago o acordar una solución. Queremos ayudarte a evitar que llegue a esa etapa.`;

            const savedMessage = await saveOutgoingMessage({
                waId,
                text: preview,
                messageId,
                type: 'template',
                metadata: {
                    template: 'regulariza_tu_pago',
                    tipo,
                    variables: { nombre, clabe, referencia }
                }
            });

            return res.status(200).json(savedMessage);
        }

        if (tipo === 'atrasolargo') {
            const values = { nombre, clabe, referencia };
            const missing = Object.entries(values).filter(([, v]) => !v).map(([k]) => k);
            if (missing.length > 0) {
                return res.status(400).json({ message: `Missing fields: ${missing.join(', ')}` });
            }

            const apiRes = await sendTemplatePagoAtrasadoCobranza(waId, { nombre, clabe, referencia });
            const messageId = apiRes?.messages?.[0]?.id;

            const preview = 
            `🚨 *TU ATRASO SIGUE GENERANDO INTERESES*\n\n` +

            `Hola ${nombre}.\n\n` +

            `⚠️ *ES URGENTE QUE TE COMUNIQUES HOY.* Tu atraso *genera intereses moratorios día con día* y puede afectar el comportamiento de tu cuenta y *tu historial crediticio*.\n\n` + 

            `Podemos revisar tu caso y *NEGOCIAR UNA REDUCCIÓN DE LOS INTERESES MORATORIOS GENERADOS* si te comunicas con nosotros.\n\n` + 

            `💳 *CLABE:* ${clabe}\n` + 
            `🔢 *REFERENCIA:* ${referencia}\n\n` +

            `📞 *477 718 0504*\n\n` + 

            `*NO DEJES PASAR MÁS DÍAS. COMUNÍCATE HOY.*.\n\n`;

                const savedMessage = await saveOutgoingMessage({
                    waId,
                    text: preview,
                    messageId,
                    type: 'template',
                    metadata: {
                        template: 'pago_atrasado_cobranza',
                        tipo,
                        variables: { nombre, clabe, referencia }
                    }
                });

                return res.status(200).json(savedMessage);
        }

        // --- Recordatorio ANTES del pago (recordatorio_de_pago1) ---
        const values = { nombre, fecha, monto, clabe, referencia };
        const missing = Object.entries(values).filter(([, v]) => !v).map(([k]) => k);
        if (missing.length > 0) {
            return res.status(400).json({ message: `Missing fields: ${missing.join(', ')}` });
        }

        const apiRes = await sendTemplateRecordatorioPago(waId, { nombre, fecha, monto, clabe, referencia });
        const messageId = apiRes?.messages?.[0]?.id;

        const preview =
            `Hola ${nombre} 🙂 Te comparto los datos para realizar tu pago:\n` +
            `🗓️ Fecha de pago: ${fecha}\n` +
            `💰 Monto: $${monto}\n` +
            `🏦 CLABE interbancaria: ${clabe}\n` +
            `🔢 Referencia: ${referencia}`;

        const savedMessage = await saveOutgoingMessage({
            waId,
            text: preview,
            messageId,
            type: 'template',
            metadata: {
                template: 'recordatorio_de_pago1',
                tipo,
                variables: { nombre, fecha, monto, clabe, referencia }
            }
        });

        return res.status(200).json(savedMessage);
    } catch (error: any) {
        console.error('Error sending payment reminder template:', error?.response?.data || error);
        return res.status(500).json({ message: 'Error sending payment reminder template' });
    }
};
