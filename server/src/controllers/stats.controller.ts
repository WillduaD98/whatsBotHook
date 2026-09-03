import { Request, Response } from 'express';
import { Conversation } from '../models/Conversation.js';

type ProspectStatsItem = {
    waId: string;
    verificationStatus: string;
    lastStage: string;
    lastIntent: string;
    maxPreSolicitudStage: string;
    stuckStage: string | null;
    lastUserInteractionAt: string;
    createdAt: string;
    updatedAt: string;
};

type ProspectStatsResponse = {
    range: { from: string | null; to: string | null };
    totals: { prospects: number; sinVerificar: number; preSolicitudCompleta: number };
    counts: {
        byLastStage: Array<{ key: string; label: string; count: number }>;
        byLastIntent: Array<{ key: string; label: string; count: number }>;
        byMaxPreSolicitudStage: Array<{ key: string; label: string; count: number }>;
        byVerificationStatus: Array<{ key: string; label: string; count: number }>;
    };
    items: ProspectStatsItem[];
};

function normalizeStageKey(stage: unknown): string {
    return typeof stage === "string" && stage.trim().length > 0 ? stage.trim() : "UNKNOWN";
}

function stageLabel(stage: string): string {
    if (stage === "start") return "Menú principal";
    if (stage === "ASESOR") return "Asesor";
    if (stage === "PRE_SOLICITUD:aviso_privacidad") return "Pre-sol: Aviso privacidad";
    if (stage === "PRE_SOLICITUD:espera_ubicacion") return "Pre-sol: Ubicación";
    if (stage === "PRE_SOLICITUD:espera_fotos_negocio") return "Pre-sol: Fotos negocio";
    if (stage === "PRE_SOLICITUD:espera_ine_frente") return "Pre-sol: INE frente";
    if (stage === "PRE_SOLICITUD:espera_ine_atras") return "Pre-sol: INE atrás";
    if (stage === "PRE_SOLICITUD:espera_comprobante") return "Pre-sol: Comprobante";
    if (stage === "SIN_VERIFICAR") return "Sin verificar";
    if (stage === "PRE_SOLICITUD_COMPLETA") return "Pre-solicitud completa";
    return stage;
}

function verificationLabel(status: string): string {
    if (status === "NONE") return "Sin verificar";
    if (status === "PRE_SOLICITUD_COMPLETA") return "Pre-solicitud completa";
    return status;
}

function normalizeIntentKey(intent: unknown): string {
    return typeof intent === "string" && intent.trim().length > 0 ? intent.trim() : "UNKNOWN";
}

function intentLabel(intent: string): string {
    if (intent === "SALUDO") return "Menú inicial";
    if (intent === "FAQ_MENU") return "Menú FAQ";
    if (intent === "REQUISITOS") return "Requisitos";
    if (intent === "MONTOS_PLAZOS") return "Montos y plazos";
    if (intent === "EXPLICACION") return "Explicación / Cómo funciona";
    if (intent === "PRE_SOLICITUD") return "Pre-solicitud (intención)";
    if (intent === "CONFIANZA") return "Confianza";
    if (intent === "ASESOR") return "Asesor";
    if (intent === "ENGAGE") return "Engage";
    if (intent === "UNKNOWN") return "Unknown";
    return intent;
}

function toDateOrNull(v: unknown): Date | null {
    if (typeof v !== "string" || v.trim().length === 0) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
}

function endOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
}

// En este proyecto no se persiste un historial de etapas; el "máximo alcanzado" se infiere con stage actual + flags en slots.prev.
function maxPreSolicitudStageForConversation(conv: any): string {
    const status = typeof conv?.verificationStatus === "string" ? conv.verificationStatus : "NONE";
    if (status === "PRE_SOLICITUD_COMPLETA") return "PRE_SOLICITUD_COMPLETA";

    const stage = normalizeStageKey(conv?.stage);
    if (stage.startsWith("PRE_SOLICITUD:")) return stage;

    const lastIntent = typeof conv?.lastIntent === "string" ? conv.lastIntent : "";
    const prev = conv?.slots?.prev;
    if (!prev || typeof prev !== "object") {
        return lastIntent === "PRE_SOLICITUD" ? "PRE_SOLICITUD:aviso_privacidad" : "SIN_VERIFICAR";
    }

    if (prev.comprobante === true) return "PRE_SOLICITUD:espera_comprobante";
    if (prev.ineAtras === true) return "PRE_SOLICITUD:espera_ine_atras";
    if (prev.ineFrente === true) return "PRE_SOLICITUD:espera_ine_frente";

    const fotos = Number(prev.negocioFotos || 0);
    if (fotos > 0) return "PRE_SOLICITUD:espera_fotos_negocio";

    return lastIntent === "PRE_SOLICITUD" ? "PRE_SOLICITUD:aviso_privacidad" : "SIN_VERIFICAR";
}

function stuckStageForConversation(conv: any): string | null {
    const status = typeof conv?.verificationStatus === "string" ? conv.verificationStatus : "NONE";
    if (status === "PRE_SOLICITUD_COMPLETA") return null;

    const stage = normalizeStageKey(conv?.stage);
    if (stage.startsWith("PRE_SOLICITUD:")) return stage;

    const lastIntent = typeof conv?.lastIntent === "string" ? conv.lastIntent : "";
    const prev = conv?.slots?.prev;

    if (lastIntent !== "PRE_SOLICITUD") return null;

    if (!prev || typeof prev !== "object") return "PRE_SOLICITUD:aviso_privacidad";

    if (prev.comprobante === true) return "PRE_SOLICITUD:espera_comprobante";
    if (prev.ineAtras === true) return "PRE_SOLICITUD:espera_comprobante";
    if (prev.ineFrente === true) return "PRE_SOLICITUD:espera_ine_atras";

    const fotos = Number(prev.negocioFotos || 0);
    if (fotos >= 5) return "PRE_SOLICITUD:espera_ine_frente";
    if (fotos > 0) return "PRE_SOLICITUD:espera_fotos_negocio";

    return "PRE_SOLICITUD:aviso_privacidad";
}

function toSortedCounts(input: Map<string, number>, preferredOrder: string[]): Array<{ key: string; label: string; count: number }> {
    const entries = Array.from(input.entries());
    const orderIndex = new Map<string, number>(preferredOrder.map((k, i) => [k, i]));
    entries.sort((a, b) => {
        const ai = orderIndex.has(a[0]) ? (orderIndex.get(a[0]) as number) : 9999;
        const bi = orderIndex.has(b[0]) ? (orderIndex.get(b[0]) as number) : 9999;
        if (ai !== bi) return ai - bi;
        return a[0].localeCompare(b[0]);
    });
    return entries.map(([key, count]) => ({ key, label: stageLabel(key), count }));
}

// GET /api/stats/prospectos?from=YYYY-MM-DD&to=YYYY-MM-DD
export const getProspectsStats = async (req: Request, res: Response) => {
    try {
        const fromRaw = req.query.from;
        const toRaw = req.query.to;

        const from = toDateOrNull(fromRaw);
        const to = toDateOrNull(toRaw);

        const match: any = {};
        if (from || to) {
            match.lastUserInteractionAt = {};
            if (from) match.lastUserInteractionAt.$gte = from;
            if (to) match.lastUserInteractionAt.$lte = endOfDay(to);
        }

        const conversations = await Conversation.find(match).sort({ lastUserInteractionAt: -1 });

        const byLastStage = new Map<string, number>();
        const byLastIntent = new Map<string, number>();
        const byMax = new Map<string, number>();
        const byStatus = new Map<string, number>();

        let sinVerificar = 0;
        let preSolicitudCompleta = 0;

        const items: ProspectStatsItem[] = conversations.map((c: any) => {
            const verificationStatus = typeof c?.verificationStatus === "string" ? c.verificationStatus : "NONE";
            const lastStage = normalizeStageKey(c?.stage);
            const lastIntent = normalizeIntentKey(c?.lastIntent);
            const maxPreSolicitudStage = maxPreSolicitudStageForConversation(c);
            const stuckStage = stuckStageForConversation(c);

            byLastStage.set(lastStage, (byLastStage.get(lastStage) || 0) + 1);
            byLastIntent.set(lastIntent, (byLastIntent.get(lastIntent) || 0) + 1);
            byMax.set(maxPreSolicitudStage, (byMax.get(maxPreSolicitudStage) || 0) + 1);
            byStatus.set(verificationStatus, (byStatus.get(verificationStatus) || 0) + 1);

            if (verificationStatus === "NONE") sinVerificar += 1;
            if (verificationStatus === "PRE_SOLICITUD_COMPLETA") preSolicitudCompleta += 1;

            return {
                waId: c.waId,
                verificationStatus,
                lastStage,
                lastIntent,
                maxPreSolicitudStage,
                stuckStage,
                lastUserInteractionAt: new Date(c.lastUserInteractionAt).toISOString(),
                createdAt: new Date(c.createdAt).toISOString(),
                updatedAt: new Date(c.updatedAt).toISOString()
            };
        });

        const maxOrder = [
            "SIN_VERIFICAR",
            "PRE_SOLICITUD:aviso_privacidad",
            "PRE_SOLICITUD:espera_ubicacion",
            "PRE_SOLICITUD:espera_fotos_negocio",
            "PRE_SOLICITUD:espera_ine_frente",
            "PRE_SOLICITUD:espera_ine_atras",
            "PRE_SOLICITUD:espera_comprobante",
            "PRE_SOLICITUD_COMPLETA"
        ];

        const resp: ProspectStatsResponse = {
            range: {
                from: from ? from.toISOString() : null,
                to: to ? endOfDay(to).toISOString() : null
            },
            totals: { prospects: conversations.length, sinVerificar, preSolicitudCompleta },
            counts: {
                byLastStage: toSortedCounts(byLastStage, ["start", "ASESOR", ...maxOrder]),
                byLastIntent: Array.from(byLastIntent.entries())
                    .sort((a, b) => {
                        const preferred = ["SALUDO", "REQUISITOS", "MONTOS_PLAZOS", "EXPLICACION", "PRE_SOLICITUD", "CONFIANZA", "ASESOR", "ENGAGE", "UNKNOWN"];
                        const ai = preferred.indexOf(a[0]);
                        const bi = preferred.indexOf(b[0]);
                        if (ai !== -1 || bi !== -1) {
                            if (ai === -1) return 1;
                            if (bi === -1) return -1;
                            return ai - bi;
                        }
                        return a[0].localeCompare(b[0]);
                    })
                    .map(([key, count]) => ({ key, label: intentLabel(key), count })),
                byMaxPreSolicitudStage: toSortedCounts(byMax, maxOrder),
                byVerificationStatus: Array.from(byStatus.entries())
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([key, count]) => ({ key, label: verificationLabel(key), count }))
            },
            items
        };

        return res.status(200).json(resp);
    } catch (error) {
        console.error("Error fetching prospects stats:", error);
        return res.status(500).json({ message: "Error fetching prospects stats" });
    }
};
