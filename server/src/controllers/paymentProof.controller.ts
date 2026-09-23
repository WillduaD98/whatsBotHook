import { Request, Response } from 'express';
import { PaymentProof } from '../models/PaymentProof.js';
import { Conversation } from '../models/Conversation.js';
import { env } from '../config/env.js';
import { sendText } from '../services/whatsapp.service.js';
import { saveOutgoingMessage } from '../services/context.service.js';
import { normalizeTo } from '../services/waid.service.js';
import { CLIENTE_STAGE_COMPROBANTE_PENDIENTE } from '../flows/cliente.flow.js';

// 'regresado_por_cliente' se incluye para que el panel también pueda filtrar esos comprobantes
const VALID_STATUSES = ['pendiente', 'validado', 'rechazado', 'regresado_por_cliente'] as const;
type PaymentProofStatus = (typeof VALID_STATUSES)[number];

function isValidStatus(value: string): value is PaymentProofStatus {
    return (VALID_STATUSES as readonly string[]).includes(value);
}

// true solo si value es un número real mayor que 0. Rechaza texto (aunque sea "1500"), NaN,
// Infinity, 0 y negativos.
function isPositiveNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

// Formato del monto con separador de miles de México: 1500 → "$1,500", 1500.5 → "$1,500.5"
function buildValidadoMessage(monto: number): string {
    return `✅ Tu comprobante de pago fue validado por $${monto.toLocaleString('es-MX')}. ¡Gracias!`;
}

// Si no hay teléfono configurado (CONTACTO_TEL vacío), no se muestra un número vacío:
// se pide al cliente comunicarse "con nosotros"
function buildRechazadoMessage(): string {
    const tel = env.CONTACTO_TEL.trim();
    const contacto = tel ? `al ${tel}` : 'con nosotros';
    return `❌ Tu comprobante de pago fue rechazado. Por favor comunícate ${contacto} para más información.`;
}

// Resultado de la revisión del asesor. El monto solo existe cuando se validó.
type ResultadoRevision = { status: 'validado'; monto: number } | { status: 'rechazado' };

// Avisa al cliente por WhatsApp el resultado de la revisión y saca su conversación del estado de espera.
// Tiene su propio try/catch porque el cambio de status del asesor ya se guardó: si algo falla aquí,
// solo se registra el error, no se revierte nada y la respuesta al panel no falla.
async function notifyClienteResultado(waId: string, resultado: ResultadoRevision): Promise<void> {
    const id = normalizeTo(waId);
    try {
        // 1) Primero se saca la conversación de 'comprobante_pendiente', para que el cliente no quede atorado
        //    aunque el WhatsApp de abajo falle. Es una sola operación en Mongo que solo cambia la conversación
        //    si todavía está en ese stage; si ya había cambiado por otra razón, no la toca.
        //    También borra slots.cliente (número de crédito, nombre, purpose), igual que las otras salidas del flujo.
        const result = await Conversation.updateOne(
            { waId: id, stage: CLIENTE_STAGE_COMPROBANTE_PENDIENTE },
            { $set: { stage: 'start', lastIntent: 'SALUDO' }, $unset: { 'slots.cliente': '' } }
        );
        if (result.modifiedCount > 0) {
            console.log('[paymentProof] conversación regresada a start tras la revisión', { waId: id, status: resultado.status });
        }

        // 2) Mensaje al cliente, guardado en el historial como cualquier otro mensaje del bot
        const text = resultado.status === 'validado' ? buildValidadoMessage(resultado.monto) : buildRechazadoMessage();
        await sendText(id, text);
        await saveOutgoingMessage({ waId: id, text });
    } catch (error) {
        // Causa más común: WhatsApp solo deja mandar texto libre dentro de las 24 h siguientes al último
        // mensaje del cliente. Pasado ese plazo, Meta rechaza el envío y el cliente NO se entera del resultado.
        console.error('[paymentProof] notify error: no se pudo avisar al cliente (¿pasaron más de 24 h desde su último mensaje?)', { waId: id, status: resultado.status }, error);
    }
}

// GET /api/payment-proofs?status=pendiente&page=1&pageSize=20
export const listPaymentProofs = async (req: Request, res: Response) => {
    try {
        const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? '20'), 10) || 20));

        const statusRaw = String(req.query.status ?? '').trim();
        const filter: any = {};
        if (statusRaw) {
            if (!isValidStatus(statusRaw)) {
                return res.status(400).json({ message: `status debe ser uno de: ${VALID_STATUSES.join(', ')}` });
            }
            filter.status = statusRaw;
        }

        const [items, total] = await Promise.all([
            PaymentProof.find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * pageSize)
                .limit(pageSize)
                .lean(),
            PaymentProof.countDocuments(filter)
        ]);

        return res.status(200).json({ items, total, page, pageSize });
    } catch (error) {
        console.error('Error listing payment proofs:', error);
        return res.status(500).json({ message: 'Error listing payment proofs' });
    }
};

// PATCH /api/payment-proofs/:id   body: { status, monto? }
export const updatePaymentProofStatus = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const status = String(req.body?.status ?? '').trim();
        const montoRaw: unknown = req.body?.monto;

        if (!isValidStatus(status)) {
            return res.status(400).json({ message: `status debe ser uno de: ${VALID_STATUSES.join(', ')}` });
        }

        // Al validar, el asesor tiene que indicar por cuánto fue el pago. Se revisa antes de guardar nada.
        // Con cualquier otro status el monto que venga en el body se ignora (no se guarda). Ojo: el monto que ya
        // tenía el comprobante no se borra; si uno 'validado' se regresa a otro status, conserva su monto viejo.
        let monto: number | undefined;
        if (status === 'validado') {
            if (!isPositiveNumber(montoRaw)) {
                return res.status(400).json({ message: 'monto es obligatorio al validar y debe ser un número mayor que 0' });
            }
            monto = montoRaw;
        }

        const proof = await PaymentProof.findById(id);
        if (!proof) {
            return res.status(404).json({ message: 'Comprobante no encontrado' });
        }

        // Se guarda el status anterior para avisar al cliente solo si el asesor realmente lo cambió
        // (si valida dos veces el mismo comprobante, el cliente no recibe un segundo mensaje)
        const previousStatus = proof.status;
        proof.status = status;
        if (monto !== undefined) proof.monto = monto;
        const updated = await proof.save();

        if (status !== previousStatus) {
            if (status === 'validado' && monto !== undefined) {
                await notifyClienteResultado(updated.waId, { status: 'validado', monto });
            } else if (status === 'rechazado') {
                await notifyClienteResultado(updated.waId, { status: 'rechazado' });
            }
        }

        return res.status(200).json(updated);
    } catch (error) {
        console.error('Error updating payment proof:', error);
        return res.status(500).json({ message: 'Error updating payment proof' });
    }
};
