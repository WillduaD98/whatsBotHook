import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema({
    waId: {
        type: String,
        required: true,
        index: true
    },
    direction: {
        type: String,
        enum: ['incoming', 'outgoing'],
        required: true
    },
    messageId: {
        type: String,
        index: true
    },
    type: {
        type: String,
        enum: ['text', 'image', 'location', 'document', 'audio', 'video', 'sticker', 'template', 'interactive', 'unknown'],
        default: 'text'
    },
    mediaUrl: {
        type: String // URL local o remota del archivo multimedia
    },
    mimeType: {
        type: String
    },
    caption: {
        type: String
    },
    text: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['sent', 'delivered', 'read', 'failed']
    },
    metadata: {
        type: Object,
        default: null
    }},
    {timestamps: true}
);

// Unicidad solo cuando messageId existe y no es null
MessageSchema.index(
  {waId: 1, messageId: 1},
  {unique: true, partialFilterExpression: { messageId: { $exists: true, $ne: null } }}
);

export const Message = mongoose.model('Message', MessageSchema)
