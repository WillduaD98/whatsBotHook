import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch, buildApiUrl, PaymentProofListResponse, PaymentProofRecord, PaymentProofStatus } from '../types';

interface PaymentProofsPanelProps {
  onNavigate: (path: string) => void;
  authToken: string;
  onUnauthorized: () => void;
}

const STATUS_LABELS: Record<PaymentProofStatus, string> = {
  pendiente: 'Pendiente',
  validado: 'Validado',
  rechazado: 'Rechazado'
};

const STATUS_OPTIONS: Array<{ value: PaymentProofStatus | ''; label: string }> = [
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'validado', label: 'Validados' },
  { value: 'rechazado', label: 'Rechazados' },
  { value: '', label: 'Todos' }
];

const ALL_STATUSES: PaymentProofStatus[] = ['pendiente', 'validado', 'rechazado'];

export const PaymentProofsPanel: React.FC<PaymentProofsPanelProps> = ({ onNavigate, authToken, onUnauthorized }) => {
  const [statusFilter, setStatusFilter] = useState<PaymentProofStatus | ''>('pendiente');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PaymentProofRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchList = useCallback(
    async (status: PaymentProofStatus | '') => {
      setLoading(true);
      setError(null);
      try {
        const params = status ? `?status=${encodeURIComponent(status)}` : '';
        const res = await apiFetch(`/api/payment-proofs${params}`, { token: authToken });
        if (res.status === 401) {
          onUnauthorized();
          return;
        }
        if (!res.ok) throw new Error(await res.text());
        const json = (await res.json()) as PaymentProofListResponse;
        setItems(json.items);
        setTotal(json.total);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Error al cargar comprobantes';
        setError(message);
        setItems([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [authToken, onUnauthorized]
  );

  useEffect(() => {
    fetchList(statusFilter);
  }, [fetchList, statusFilter]);

  const onChangeStatus = async (id: string, nextStatus: PaymentProofStatus) => {
    if (updatingId) return;
    setUpdatingId(id);
    setError(null);
    try {
      const res = await apiFetch(`/api/payment-proofs/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
        token: authToken
      });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      await fetchList(statusFilter);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Error al actualizar el comprobante';
      setError(message);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="stats-panel">
      <div className="stats-header">
        <div>
          <div className="stats-title">Comprobantes de pago</div>
          <div className="stats-subtitle">Revisa y valida los comprobantes enviados por WhatsApp</div>
        </div>
        <div className="stats-actions">
          <button className="stats-button" onClick={() => onNavigate('/')}>Volver</button>
        </div>
      </div>

      <div className="stats-section">
        <div className="stats-filters" style={{ gridTemplateColumns: '1fr' }}>
          <div className="stats-filter">
            <label className="stats-label">Estado</label>
            <select
              className="stats-input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as PaymentProofStatus | '')}
              disabled={loading}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value || 'todos'} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {error && <div className="stats-error" style={{ marginTop: '12px' }}>{error}</div>}

        <div className="stats-table__wrap" style={{ marginTop: '12px' }}>
          <table className="stats-table">
            <thead>
              <tr>
                <th>WhatsApp</th>
                <th>Número de crédito</th>
                <th>Comprobante</th>
                <th style={{ width: '110px' }}>Estado</th>
                <th style={{ width: '220px' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((proof) => (
                <tr key={proof._id}>
                  <td>{proof.waId}</td>
                  <td>{proof.numeroCredito || '—'}</td>
                  <td>
                    {String(proof.mimeType || '').startsWith('image/') ? (
                      <img
                        src={buildApiUrl(proof.mediaUrl)}
                        alt="comprobante"
                        style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px', cursor: 'pointer' }}
                        onClick={() => window.open(buildApiUrl(proof.mediaUrl), '_blank')}
                      />
                    ) : (
                      <a href={buildApiUrl(proof.mediaUrl)} target="_blank" rel="noreferrer">Ver comprobante</a>
                    )}
                  </td>
                  <td>{STATUS_LABELS[proof.status]}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {ALL_STATUSES.filter((s) => s !== proof.status).map((s) => (
                        <button
                          key={s}
                          className="stats-button"
                          disabled={updatingId === proof._id}
                          onClick={() => onChangeStatus(proof._id, s)}
                        >
                          Marcar {STATUS_LABELS[s]}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="stats-subtitle" style={{ marginTop: '8px' }}>Total: {total}</div>
      </div>
    </div>
  );
};
