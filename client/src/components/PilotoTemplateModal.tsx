// Modal para mandar a un chat una de las plantillas del piloto "droga del pago".
// Nombre, racha, nivel y límite los pone el servidor desde la BD (CSV de Créditos); aquí solo se captura monto y fecha.
import React, { useState } from 'react';
import { apiFetch, Message } from '../types';

type PilotoTemplate = 'streak_alert' | 'due_date_action' | 'prox_credito_gancho';

const PLANTILLAS: Array<{ id: PilotoTemplate; label: string; ayuda: string; pideMontoYFecha: boolean }> = [
  { id: 'streak_alert', label: 'Mañana toca (día −1)', ayuda: 'Recordatorio con su racha. Sin botones.', pideMontoYFecha: true },
  { id: 'due_date_action', label: 'Hoy toca (día 0)', ayuda: 'Pago de hoy con botones: Ya pagué / Pásame los datos / Necesito ayuda.', pideMontoYFecha: true },
  { id: 'prox_credito_gancho', label: 'Gancho renovación', ayuda: 'Imagen + racha, nivel y límite. Su botón abre el flujo de renovación.', pideMontoYFecha: false }
];

interface PilotoTemplateModalProps {
  waId: string;
  authToken: string;
  onUnauthorized: () => void;
  onClose: () => void;
  onSent: (message: Message) => void;
}

// El servidor responde { message } en sus errores; si no es JSON, se muestra el texto tal cual.
async function readErrorMessage(res: Response): Promise<string> {
  const raw = await res.text();
  try {
    const parsed: { message?: string } = JSON.parse(raw);
    return parsed.message || raw;
  } catch {
    return raw || 'Error al enviar la plantilla';
  }
}

export const PilotoTemplateModal: React.FC<PilotoTemplateModalProps> = ({ waId, authToken, onUnauthorized, onClose, onSent }) => {
  const [plantilla, setPlantilla] = useState<PilotoTemplate>('due_date_action');
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seleccionada = PLANTILLAS.find((p) => p.id === plantilla) ?? PLANTILLAS[0];

  const handleSend = async () => {
    if (sending) return;
    if (seleccionada.pideMontoYFecha && (!monto.trim() || !fecha.trim())) {
      setError('Faltan el monto y la fecha de vencimiento');
      return;
    }

    setSending(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/chats/${encodeURIComponent(waId)}/piloto-template`, {
        method: 'POST',
        token: authToken,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plantilla, monto: monto.trim(), fecha: fecha.trim() })
      });

      if (res.status === 401) { onUnauthorized(); return; }
      if (!res.ok) throw new Error(await readErrorMessage(res));

      onSent((await res.json()) as Message);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al enviar la plantilla');
    } finally {
      setSending(false);
    }
  };

  const optionStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '8px',
    borderRadius: '8px',
    cursor: 'pointer',
    border: active ? '2px solid #008069' : '1px solid #ddd',
    background: active ? '#e8f5f1' : '#fff',
    fontWeight: active ? 700 : 400
  });
  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd' };
  const labelStyle: React.CSSProperties = { display: 'grid', gap: '4px', fontSize: '0.9em', color: '#334' };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 1000 }}
      onClick={() => { if (!sending) onClose(); }}
    >
      <div
        style={{ width: '100%', maxWidth: '520px', background: '#fff', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.1)', padding: '14px', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
          <div style={{ fontWeight: 700 }}>🔥 Piloto (plantilla)</div>
          <button
            onClick={onClose}
            disabled={sending}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '18px' }}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div style={{ marginTop: '10px', display: 'grid', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {PLANTILLAS.map((p) => (
              <button key={p.id} type="button" onClick={() => setPlantilla(p.id)} disabled={sending} style={optionStyle(p.id === plantilla)}>
                {p.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: '0.85em', color: '#667' }}>
            <code>{seleccionada.id}</code> · {seleccionada.ayuda} Nombre, racha, nivel y límite salen del CSV de Créditos.
          </div>

          {seleccionada.pideMontoYFecha && (
            <>
              <label style={labelStyle}>
                <span>Monto del pago (el "$" lo pone el sistema)</span>
                <input type="text" value={monto} onChange={(e) => setMonto(e.target.value)} disabled={sending} placeholder="750" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                <span>Fecha de vencimiento (texto tal cual lo verá el cliente)</span>
                <input type="text" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={sending} placeholder="vie 30 oct" style={inputStyle} />
              </label>
            </>
          )}

          {error && <div style={{ color: '#b00020', fontSize: '0.9em' }}>{error}</div>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
          <button
            onClick={onClose}
            disabled={sending}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSend}
            disabled={sending}
            style={{ padding: '8px 12px', borderRadius: '8px', border: 'none', background: '#008069', color: '#fff', cursor: 'pointer' }}
          >
            {sending ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
};
