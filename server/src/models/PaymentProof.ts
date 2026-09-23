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
            // 'regresado_por_cliente': el propio cliente pidió reenviar su comprobante.
            // Es distinto de 'rechazado', que es cuando un asesor lo revisa y no lo acepta.
            enum: ['pendiente', 'validado', 'rechazado', 'regresado_por_cliente'],
            default: 'pendiente',
            index: true
        },
        monto: {
            // Monto del pago. Es opcional: solo se llena cuando un asesor valida
            // el comprobante e indica por cuánto fue el pago.
            type: Number
        }
    },
    { timestamps: true }
);

export const PaymentProof = mongoose.model('PaymentProof', PaymentProofSchema);
