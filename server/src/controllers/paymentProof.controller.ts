import { Request, Response } from 'express';
import { PaymentProof } from '../models/PaymentProof.js';

const VALID_STATUSES = ['pendiente', 'validado', 'rechazado'] as const;
type PaymentProofStatus = (typeof VALID_STATUSES)[number];

function isValidStatus(value: string): value is PaymentProofStatus {
    return (VALID_STATUSES as readonly string[]).includes(value);
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

// PATCH /api/payment-proofs/:id
export const updatePaymentProofStatus = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const status = String(req.body?.status ?? '').trim();

        if (!isValidStatus(status)) {
            return res.status(400).json({ message: `status debe ser uno de: ${VALID_STATUSES.join(', ')}` });
        }

        const updated = await PaymentProof.findByIdAndUpdate(id, { $set: { status } }, { new: true });
        if (!updated) {
            return res.status(404).json({ message: 'Comprobante no encontrado' });
        }

        return res.status(200).json(updated);
    } catch (error) {
        console.error('Error updating payment proof:', error);
        return res.status(500).json({ message: 'Error updating payment proof' });
    }
};
