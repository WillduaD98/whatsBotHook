import cron from 'node-cron';
import { WebhookEvent } from '../models/WebhookEvent.js';
// Dependencia circular controlada: el controller importa scheduleProcessing y este archivo importa
// processIncomingMessage. En ESM funciona porque ninguno usa al otro al cargar, solo dentro de funciones.
import { processIncomingMessage } from '../controllers/webhookController.js';

// waIds que el worker está drenando ahora mismo: garantiza un solo ciclo por usuario (orden estricto)
const activeWaIds = new Set<string>();

// Evento ya reclamado (status 'processing') tal como lo devuelve Mongo
type ClaimedEvent = NonNullable<Awaited<ReturnType<typeof claimNextEvent>>>;

// Reclamo atómico: pasa a 'processing' el pendiente más viejo del waId.
// Ordena por _id, que refleja el orden real de llegada aunque el evento se haya reintentado.
function claimNextEvent(waId: string) {
    return WebhookEvent.findOneAndUpdate(
        { waId, status: 'pending' },
        { $set: { status: 'processing' } },
        { sort: { _id: 1 }, new: true }
    );
}

// Lee msg y phoneNumberId del payload guardado al encolar (tipo Mixed) sin asumir su forma
function readPayload(payload: unknown): { msg: unknown; phoneNumberId: string | undefined } {
    if (typeof payload !== 'object' || payload === null) return { msg: undefined, phoneNumberId: undefined };
    const msg = 'msg' in payload ? payload.msg : undefined;
    const phoneNumberId = 'phoneNumberId' in payload && typeof payload.phoneNumberId === 'string'
        ? payload.phoneNumberId
        : undefined;
    return { msg, phoneNumberId };
}

// Procesa un evento reclamado y actualiza su estado: 'done', de vuelta a 'pending' o 'failed'
async function processEvent(event: ClaimedEvent): Promise<void> {
    try {
        const { msg, phoneNumberId } = readPayload(event.payload);
        if (!msg) throw new Error('payload sin msg');
        await processIncomingMessage({
            waId: event.waId,
            messageId: event.messageId ?? undefined, // Mongoose puede devolver null
            msg,
            inboundPhoneNumberId: phoneNumberId
        });
    } catch (err: unknown) {
        // Falla: suma un intento; al llegar a maxAttempts queda 'failed', si no vuelve a 'pending'
        // y el mismo ciclo lo reintenta de inmediato (sigue siendo el pendiente más viejo del waId)
        const attempts = event.attempts + 1;
        const exhausted = attempts >= event.maxAttempts;
        // Texto del error, calculado una sola vez: se guarda en lastError y se usa en los logs
        const lastError = err instanceof Error ? err.message : String(err);
        const messageId = event.messageId ?? undefined;
        // En ambos logs se pasa también err completo al final para conservar el stack
        // (la lista de archivos y líneas por donde pasó el error), que ayuda a encontrar dónde falló
        if (exhausted) {
            // Error: ya no se reintentará solo, alguien tiene que revisarlo a mano
            console.error('[webhookWorker] evento agotó reintentos, quedó como FAILED', { waId: event.waId, messageId, attempts, lastError }, err);
        } else {
            // Advertencia (no error): el mismo ciclo lo va a reintentar enseguida
            console.warn('[webhookWorker] intento fallido, se reintentará', { waId: event.waId, messageId, attempts, maxAttempts: event.maxAttempts, lastError }, err);
        }
        await WebhookEvent.updateOne(
            { _id: event._id },
            exhausted
                ? { $set: { attempts, status: 'failed', lastError } }
                : { $set: { attempts, status: 'pending' } }
        );
        return;
    }

    // Éxito: fuera del try para que un fallo al marcar 'done' no provoque reprocesar (y reenviar mensajes)
    await WebhookEvent.updateOne({ _id: event._id }, { $set: { status: 'done', processedAt: new Date() } });
}

// Drena la cola de un waId: procesa sus pendientes uno por uno, en orden, hasta que no quede ninguno
async function drainWaId(waId: string): Promise<void> {
    let event = await claimNextEvent(waId);
    while (event) {
        await processEvent(event);
        event = await claimNextEvent(waId);
    }
}

// Dispara el procesamiento de un waId (fire-and-forget). Si ya está activo, lo ignora:
// el ciclo en curso llegará al evento nuevo.
export const scheduleProcessing = (waId: string): void => {
    if (activeWaIds.has(waId)) return;
    activeWaIds.add(waId);
    drainWaId(waId)
        .catch((err: unknown) => console.error('[webhookWorker] drain error:', waId, err))
        // Siempre libera el waId, aunque falle Mongo, para que no quede bloqueado para siempre
        .finally(() => activeWaIds.delete(waId));
};

// Recupera eventos "huérfanos": los que quedaron en 'processing' porque el servidor se cayó o se
// reinició (crash, redeploy, pm2 restart) justo mientras los procesaba. Sin esto se quedarían
// atorados para siempre, porque claimNextEvent solo busca eventos en 'pending'.
// Es seguro regresarlos todos a 'pending' al arrancar: este proceso todavía no ha tomado ningún
// evento, así que cualquier 'processing' lo dejó un proceso anterior que ya no existe.
// Ojo: esto asume que corre UNA sola instancia del servidor. Con varias, una podría regresar a
// 'pending' eventos que otra instancia sí está procesando.
// No se suma a attempts: la caída del servidor no es culpa del evento.
async function recoverOrphanEvents(): Promise<void> {
    const result = await WebhookEvent.updateMany({ status: 'processing' }, { $set: { status: 'pending' } });
    if (result.modifiedCount > 0) {
        console.log(`[webhookWorker] ${result.modifiedCount} evento(s) huérfano(s) regresados a 'pending'`);
    }
}

// Se llama con await al arrancar (index.ts), antes de que el servidor empiece a escuchar.
// Así la recuperación termina antes de que entre cualquier webhook o corra el barrido, y no puede
// regresar a 'pending' un evento que este mismo proceso esté procesando de verdad (eso lo
// procesaría dos veces y el cliente recibiría respuestas duplicadas).
export const startWebhookWorker = async (): Promise<void> => {
    await recoverOrphanEvents();

    // Barrido cada 5 segundos (6 campos: el primero son segundos). Red de seguridad por si se
    // perdió el disparo por evento: dispara los waIds con pendientes que no estén activos.
    cron.schedule('*/5 * * * * *', async () => {
        try {
            const pendingWaIds = await WebhookEvent.distinct('waId', { status: 'pending' });
            for (const waId of pendingWaIds) scheduleProcessing(waId);
        } catch (error) {
            console.error('[webhookWorker] sweep error:', error);
        }
    });

    // Chequeo de la cola cada minuto (5 campos, igual que el scheduler): muestra cuántos eventos hay
    // en cada estado para detectar si se está acumulando trabajo o hay fallos.
    cron.schedule('* * * * *', async () => {
        try {
            // Un conteo por estado, en paralelo. Es barato porque status tiene índice en el modelo
            const [pending, processing, failed] = await Promise.all([
                WebhookEvent.countDocuments({ status: 'pending' }),
                WebhookEvent.countDocuments({ status: 'processing' }),
                WebhookEvent.countDocuments({ status: 'failed' })
            ]);
            // Solo imprime si hay trabajo pendiente o en curso. Los 'failed' se muestran en el mismo log,
            // pero no bastan para imprimir: nunca se borran, y con uno solo se imprimiría cada minuto para siempre.
            if (pending > 0 || processing > 0) {
                console.log('[webhookWorker] estado de la cola', { pending, processing, failed });
            }
        } catch (error) {
            console.error('[webhookWorker] queue check error:', error);
        }
    });
};
