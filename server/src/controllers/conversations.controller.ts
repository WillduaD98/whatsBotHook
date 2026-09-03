import { Request, Response } from 'express';
import { Conversation } from '../models/Conversation.js';
import { updateConversationState } from '../services/context.service.js';

// GET /api/conversations
export const getConversations = async (_req: Request, res: Response) => {
    try {
        const conversations = await Conversation.aggregate([
            { $addFields: { _sortAt: { $ifNull: ['$lastMessageAt', '$updatedAt'] } } },
            { $sort: { _sortAt: -1 } },
            {
                $lookup: {
                    from: 'messages',
                    let: { wa: '$waId' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$waId', '$$wa'] } } },
                        { $sort: { createdAt: -1 } },
                        { $limit: 1 },
                        { $project: { _id: 0, text: 1, type: 1, direction: 1, createdAt: 1 } }
                    ],
                    as: '_lastMsg'
                }
            },
            {
                $addFields: {
                    lastMessageText: { $ifNull: [{ $arrayElemAt: ['$_lastMsg.text', 0] }, ''] },
                    lastMessageType: { $ifNull: [{ $arrayElemAt: ['$_lastMsg.type', 0] }, 'text'] },
                    lastMessageDirection: { $ifNull: [{ $arrayElemAt: ['$_lastMsg.direction', 0] }, ''] }
                }
            },
            { $project: { _lastMsg: 0 } }
        ]);
        res.status(200).json(conversations);
    } catch (error) {
        console.error('Error fetching conversations:', error);
        res.status(500).json({ message: 'Error fetching conversations' });
    }
};

// PATCH /api/conversations/:waId
export const updateConversation = async (req: Request, res: Response) => {
    try {
        const { waId } = req.params;
        const { stage, verificationStatus, subscriptionStatus } = req.body;

        const patch: any = {};
        if (stage !== undefined) patch.stage = stage;
        if (verificationStatus !== undefined) patch.verificationStatus = verificationStatus;
        if (subscriptionStatus !== undefined) patch.subscriptionStatus = subscriptionStatus;

        if (Object.keys(patch).length === 0) {
            return res.status(400).json({ message: 'No fields to update' });
        }

        const updated = await updateConversationState(waId, patch);
        return res.status(200).json(updated);
    } catch (error) {
        console.error('Error updating conversation:', error);
        return res.status(500).json({ message: 'Error updating conversation' });
    }
};
