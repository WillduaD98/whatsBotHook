import mongoose from 'mongoose';

const ConversationSchema = new mongoose.Schema(
    {
        waId: {
            type: String,
            required: true,
            unique: true,
            index: true
        },
        stage: {
            type: String,
            default: 'start'
        },
        lastIntent: {
            type: String,
            default: ''
        },
        slots: {
            type: Object,
            default: {}
        },
        verificationStatus: {
            type: String,
            default: 'NONE' // NONE, PRE_SOLICITUD_COMPLETA
        },
        lastUserInteractionAt: {
            type: Date,
            default: Date.now
        },
        lastMessageAt: {
            type: Date,
            default: Date.now
        },
        followUpLevel: {
            type: Number,
            default: 0 // 0=none, 1=3min, 2=2h, 3=24h
        },
        subscriptionStatus: {
            type: String,
            default: ''
        },
        subscriptionOfferPending: {
            type: Boolean,
            default: false
        },
        noCoverageLocation: {
            type: Object,
            default: null
        },
        clienteVerificado: {
            type: Boolean,
            default: false // true cuando el cliente confirmó su número de crédito y su nombre; se muestra como distintivo en el panel
        }
    },
    { timestamps: true }    
)
export const Conversation = mongoose.model('Conversation', ConversationSchema);
