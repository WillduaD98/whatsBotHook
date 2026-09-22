export interface Conversation {
    _id: string;
    waId: string;
    stage: string;
    lastIntent: string;
    verificationStatus?: string; // e.g. "PRE_SOLICITUD_COMPLETA"
    subscriptionStatus?: string; // e.g. "SUSCRITO"
    lastMessageText?: string;
    lastMessageType?: string;
    lastMessageDirection?: string;
    lastMessageAt?: string;
    updatedAt: string;
}

export interface Message {
    _id: string;
    waId: string;
    direction: 'incoming' | 'outgoing';
    messageId: string;
    text: string;
    type?: string;
    mediaUrl?: string;
    mimeType?: string;
    caption?: string;
    metadata?: Record<string, unknown> | null;
    status?: 'sent' | 'delivered' | 'read' | 'failed';
    createdAt: string;
}

export interface WeeklyTipImage {
    _id: string;
    filename: string;
    mediaUrl: string;
    mimeType: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface WeeklyTip {
    _id: string;
    tipText: string;
    images: WeeklyTipImage[];
    active: boolean;
    createdAt?: string;
    updatedAt?: string;
}

export interface StatsCountRow {
    key: string;
    label: string;
    count: number;
}

export interface ProspectStatsItem {
    waId: string;
    verificationStatus: string;
    lastStage: string;
    lastIntent: string;
    maxPreSolicitudStage: string;
    stuckStage: string | null;
    lastUserInteractionAt: string;
    createdAt: string;
    updatedAt: string;
}

export interface ProspectStatsResponse {
    range: { from: string | null; to: string | null };
    totals: { prospects: number; sinVerificar: number; preSolicitudCompleta: number };
    counts: {
        byLastStage: StatsCountRow[];
        byLastIntent: StatsCountRow[];
        byMaxPreSolicitudStage: StatsCountRow[];
        byVerificationStatus: StatsCountRow[];
    };
    items: ProspectStatsItem[];
}

export interface CreditRecord {
    _id: string;
    numeroCredito: string;
    nombre: string;
    clabe: string;
    referencia: string;
    activo: boolean;
    createdAt?: string;
    updatedAt?: string;
}

export interface CreditListResponse {
    items: CreditRecord[];
    total: number;
    page: number;
    pageSize: number;
}

export interface CreditUploadError {
    fila: number;
    motivo: string;
}

export interface CreditUploadSummary {
    recibidos: number;
    insertados: number;
    actualizados: number;
    omitidos: number;
    errores: CreditUploadError[];
}

export type PaymentProofStatus = 'pendiente' | 'validado' | 'rechazado';

export interface PaymentProofRecord {
    _id: string;
    waId: string;
    numeroCredito?: string;
    mediaUrl: string;
    mimeType?: string;
    status: PaymentProofStatus;
    createdAt?: string;
    updatedAt?: string;
}

export interface PaymentProofListResponse {
    items: PaymentProofRecord[];
    total: number;
    page: number;
    pageSize: number;
}

const rawViteApiBaseUrl = import.meta.env.VITE_API_BASE_URL;

export const API_BASE_URL =
    typeof rawViteApiBaseUrl === 'string' && rawViteApiBaseUrl.trim()
        ? rawViteApiBaseUrl.trim()
        : typeof window !== 'undefined' && window.location.origin.includes('localhost:5173')
          ? 'http://localhost:3000'
          : typeof window !== 'undefined'
            ? window.location.origin
            : 'http://localhost:3000';

export function buildApiUrl(path: string) {
    const raw = typeof path === 'string' ? path.trim() : '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^(blob:|data:)/i.test(raw)) return raw;
    if (/^file:\/\//i.test(raw)) {
        try {
            const u = new URL(raw);
            const parts = u.pathname.split('/').filter(Boolean);
            const filename = parts.length > 0 ? parts[parts.length - 1] : '';
            const clean = filename.replace(/\.html$/i, '');
            if (clean) return `${API_BASE_URL}/uploads/${encodeURIComponent(clean)}`;
        } catch {
        }
    }
    const normalized = raw.startsWith('/') ? raw : `/${raw}`;
    return `${API_BASE_URL}${normalized}`;
}

export async function apiFetch(
    path: string,
    init: (RequestInit & { token?: string }) | undefined = undefined
) {
    const { token, headers, ...rest } = init || {};
    const nextHeaders = new Headers(headers || undefined);
    if (token) nextHeaders.set('Authorization', `Bearer ${token}`);
    if (!nextHeaders.has('Accept')) nextHeaders.set('Accept', 'application/json');
    return fetch(buildApiUrl(path), { ...rest, headers: nextHeaders });
}
