import mongoose from 'mongoose';

const PaymentProofSchema = new mongoose.Schema(
    {
        waId: {
            type: String,
            required: true,
            index: true
        },
        numeroCredito: {
            type: String,
            trim: true,
            index: true
        },
        mediaUrl: {
            type: String,
            required: true
        },
        mimeType: {
            type: String
        },
        status: {
            type: String,
            enum: ['pendiente', 'validado', 'rechazado'],
            default: 'pendiente',
            index: true
        }
    },
    { timestamps: true }
);

export const PaymentProof = mongoose.model('PaymentProof', PaymentProofSchema);
