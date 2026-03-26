import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Conversation } from '../models/Conversation.js';

async function run() {
  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const stagePrefix = await Conversation.updateMany(
      { stage: { $regex: /^PRE_VERIFICACION:/ } },
      [
        {
          $set: {
            stage: {
              $replaceOne: {
                input: '$stage',
                find: 'PRE_VERIFICACION:',
                replacement: 'PRE_SOLICITUD:'
              }
            }
          }
        }
      ]
    );

    const stageExact = await Conversation.updateMany(
      { stage: 'PRE_VERIFICADO' },
      { $set: { stage: 'PRE_SOLICITUD_COMPLETA' } }
    );

    const lastIntent = await Conversation.updateMany(
      { lastIntent: 'PRE_VERIFICACION' },
      { $set: { lastIntent: 'PRE_SOLICITUD' } }
    );

    const verificationStatus = await Conversation.updateMany(
      { verificationStatus: 'PRE_VERIFICADO' },
      { $set: { verificationStatus: 'PRE_SOLICITUD_COMPLETA' } }
    );

    console.log('Migration results:', {
      stagePrefix,
      stageExact,
      lastIntent,
      verificationStatus
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error(error);
    try {
      await mongoose.disconnect();
    } catch (_) {}
    process.exitCode = 1;
  }
}

run();
