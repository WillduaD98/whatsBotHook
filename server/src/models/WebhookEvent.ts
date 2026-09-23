import mongoose from 'mongoose';

// Evento de webhook encolado: se guarda al recibirlo y un worker lo procesa después.
// createdAt (timestamps) funciona como la fecha de recepción.
const WebhookEventSchema = new mongoose.Schema(
    {
        waId: {
            type: String,
            required: true,
            index: true // Número de WhatsApp del remitente
        },
        messageId: {
            type: String // ID del mensaje de Meta; se indexa con el índice único parcial de abajo
        },
        payload: {
            type: Object, // Mixed: msg crudo completo + phoneNumberId
            required: true
        },
        status: {
            type: String,
            enum: ['pending', 'processing', 'done', 'failed'],
            default: 'pending',
            index: true // Estado del evento en la cola
        },
        attempts: {
            type: Number,
            default: 0 // Intentos de procesamiento realizados
        },
        maxAttempts: {
            type: Number,
            default: 3 // Máximo de intentos antes de marcarlo como 'failed'
        },
        lastError: {
            type: String // Mensaje del último error, si hubo
        },
        processedAt: {
            type: Date // Fecha en que terminó de procesarse
        }
    },
    { timestamps: true }
);

// Query del worker: el siguiente evento pendiente más viejo de un waId
WebhookEventSchema.index({ waId: 1, status: 1, _id: 1 });

// Dedupe contra reentregas de Meta: único solo cuando messageId existe y no es null
WebhookEventSchema.index(
    { messageId: 1 },
    { unique: true, partialFilterExpression: { messageId: { $exists: true, $ne: null } } }
);

export const WebhookEvent = mongoose.model('WebhookEvent', WebhookEventSchema);
