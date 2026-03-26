
import mongoose from 'mongoose';
import { Message } from '../models/Message.js';
import { env } from '../config/env.js';

async function run() {
  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const messages = await Message.find().sort({ createdAt: -1 }).limit(5);
    console.log('Last 5 messages:');
    messages.forEach(m => {
        console.log({
            id: m._id,
            waId: m.waId,
            type: (m as any).type, // cast to any in case type definition is missing in local model
            text: m.text,
            mediaUrl: (m as any).mediaUrl,
            createdAt: m.createdAt
        });
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error(error);
  }
}

run();
