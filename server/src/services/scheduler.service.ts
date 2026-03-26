import cron from 'node-cron';
import { Conversation } from '../models/Conversation.js';
import { sendText } from './whatsapp.service.js';
import { saveOutgoingMessage } from './context.service.js';

// Tiempos en milisegundos
const FIVE_MINUTES = 5 * 60 * 1000;

function buildPreSolicitudFollowUp(stage: string, attempt: 1 | 2): string {
    const header = attempt === 1 ? "🙋‍♂️ Seguimos con tu pre-solicitud" : "🙋‍♂️ Recordatorio para completar tu pre-solicitud";
    const trust = "Te lo pedimos porque somos una *financiera* *regulada* y necesitamos validar tu solicitud.";
    const footer = "Si ya lo enviaste, ignora este mensaje.\n\n↩️ Si quieres regresar al menú: escribe *MENÚ*";

    let ask = "Por favor envía lo que te estoy solicitando para continuar.";
    if (stage === "PRE_SOLICITUD:aviso_privacidad") {
        ask = "Para continuar, toca *Acepto ✅*.";
    } else if (stage === "PRE_SOLICITUD:espera_ubicacion") {
        ask = "Por favor envíame tu ubicación para *validar* *cobertura* (clip 📎 -> Ubicación -> Enviar mi ubicación actual) o escribe *SOLO* el nombre de tu ciudad. (Aún no te visitaremos, no te preocupes 😌).";
    } else if (stage === "PRE_SOLICITUD:espera_colonia_puebla") {
        ask = "Por favor escribe tu *colonia* TAL CUAL aparece en tu comprobante de domicilio.";
    } else if (stage === "PRE_SOLICITUD:espera_fotos_negocio") {
        ask = "Por favor envíame *3* fotos de tu negocio (por *fuera* y por *dentro*).";
    } else if (stage === "PRE_SOLICITUD:espera_ine_frente") {
        ask = "Por favor envíame foto de tu INE por delante.";
    } else if (stage === "PRE_SOLICITUD:espera_ine_atras") {
        ask = "Por favor envíame foto de tu INE por atrás.";
    } else if (stage === "PRE_SOLICITUD:espera_comprobante") {
        ask = "Por favor envíame foto del comprobante de domicilio o un PDF.";
    }

    return `${header}\n\n${ask}\n\n${trust}\n\n${footer}`;
}

export const startScheduler = () => {
    // Ejecutar cada minuto
    cron.schedule('* * * * *', async () => {
        try {
            const now = new Date();
            // console.log(`[Scheduler] Running follow-up check at ${now.toISOString()}`);

            const candidates = await Conversation.find({
                stage: { $regex: /^(ENGAGE|PRE_SOLICITUD)/ },
                verificationStatus: { $ne: 'PRE_SOLICITUD_COMPLETA' },
            });

            for (const conv of candidates) {
                // Doble check por seguridad
                if (conv.verificationStatus === 'PRE_SOLICITUD_COMPLETA' || conv.stage === 'ASESOR') continue;

                // Si lastUserInteractionAt no existe, usar updatedAt como fallback
                // (aunque updatedAt cambia con CUALQUIER update, así que lastUserInteractionAt es preferible)
                const lastInteraction = new Date(conv.lastUserInteractionAt || conv.updatedAt).getTime();
                const timeDiff = now.getTime() - lastInteraction;
                const waId = conv.waId;
                const level = conv.followUpLevel || 0;

                if (conv.stage.startsWith("PRE_SOLICITUD")) {
                    if (level === 0 && timeDiff >= FIVE_MINUTES) {
                        console.log(`[Scheduler] Sending PRE_SOLICITUD follow-up (5m) to ${waId}`);
                        const msg = buildPreSolicitudFollowUp(conv.stage, 1);
                        await sendFollowUp(waId, msg, 1);
                    }
                    continue;
                }

                if (conv.stage.startsWith("ENGAGE")) {
                    if (level === 0 && timeDiff >= FIVE_MINUTES) {
                        console.log(`[Scheduler] Sending Level 1 follow-up to ${waId}`);
                        const msg = "¿Seguimos? Responde 1 y te digo si aplicas en 30s.";
                        await sendFollowUp(waId, msg, 1);
                    }
                }
            }

        } catch (error) {
            console.error('[Scheduler] Error running job:', error);
        }
    });
};

async function sendFollowUp(waId: string, text: string, newLevel: number) {
    try {
        // Enviar mensaje
        const result = await sendText(waId, text);
        const messageId = result?.messages?.[0]?.id;
        
        // Guardar mensaje saliente
        await saveOutgoingMessage({ waId, text, messageId });
        
        // Actualizar nivel de follow-up
        await Conversation.findOneAndUpdate(
            { waId },
            { $set: { followUpLevel: newLevel } }
        );
    } catch (error) {
        console.error(`[Scheduler] Failed to send follow-up to ${waId}:`, error);
    }
}
