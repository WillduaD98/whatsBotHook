import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';

// Backfill de una sola vez: pone lastMessageAt en cada conversacion = fecha del ULTIMO mensaje real.
// Asi los chats viejos tambien quedan ordenados como WhatsApp (no solo los nuevos).
// Uso: cd server && npm run migrate:last-message
async function run() {
  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Ultima fecha de mensaje por waId
    const rows = await Message.aggregate([
      { $group: { _id: '$waId', last: { $max: '$createdAt' } } }
    ]);
    console.log('Conversaciones con mensajes:', rows.length);

    const ops = rows
      .filter((r: any) => r && r._id && r.last)
      .map((r: any) => ({
        updateOne: {
          filter: { waId: r._id },
          update: { $set: { lastMessageAt: r.last } }
        }
      }));

    let modified = 0;
    if (ops.length > 0) {
      const res = await Conversation.bulkWrite(ops, { ordered: false });
      modified = (res as any).modifiedCount ?? 0;
    }

    console.log('Backfill terminado. Conversaciones actualizadas:', modified);
    await mongoose.disconnect();
  } catch (error) {
    console.error(error);
    try { await mongoose.disconnect(); } catch (_) {}
    process.exitCode = 1;
  }
}

run();
