import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, ProspectStatsResponse } from '../types';

interface StatsPanelProps {
  onNavigate: (path: string) => void;
  authToken: string;
  onUnauthorized: () => void;
}

function toDateInputValue(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const StatsPanel: React.FC<StatsPanelProps> = ({ onNavigate, authToken, onUnauthorized }) => {
  const today = useMemo(() => new Date(), []);
  const defaultFrom = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  }, []);

  const [fromDate, setFromDate] = useState(() => toDateInputValue(defaultFrom));
  const [toDate, setToDate] = useState(() => toDateInputValue(today));
  const [appliedFromDate, setAppliedFromDate] = useState(() => toDateInputValue(defaultFrom));
  const [appliedToDate, setAppliedToDate] = useState(() => toDateInputValue(today));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ProspectStatsResponse | null>(null);

  const fetchStats = useCallback(async (from: string, to: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const res = await apiFetch(`/api/stats/prospectos?${qs.toString()}`, { token: authToken });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const json = (await res.json()) as ProspectStatsResponse;
      setData(json);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Error al cargar estadísticas';
      setError(message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [authToken, onUnauthorized]);

  useEffect(() => {
    fetchStats(appliedFromDate, appliedToDate);
  }, [appliedFromDate, appliedToDate, fetchStats]);

  return (
    <div className="stats-panel">
      <div className="stats-header">
        <div>
          <div className="stats-title">Estadísticas WhatsApp</div>
          <div className="stats-subtitle">Prospectos y pre-solicitud</div>
        </div>
        <div className="stats-actions">
          <button className="stats-button" onClick={() => onNavigate('/')}>Volver</button>
        </div>
      </div>

      <div className="stats-filters">
        <div className="stats-filter">
          <label className="stats-label">Fecha inicial</label>
          <input className="stats-input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="stats-filter">
          <label className="stats-label">Fecha final</label>
          <input className="stats-input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <div className="stats-filter stats-filter--apply">
          <button
            className="stats-button stats-button--primary"
            onClick={() => {
              setAppliedFromDate(fromDate);
              setAppliedToDate(toDate);
            }}
            disabled={loading}
          >
            {loading ? 'Cargando...' : 'Aplicar'}
          </button>
        </div>
      </div>

      {error && (
        <div className="stats-error">{error}</div>
      )}

      {data && (
        <>
          <div className="stats-cards">
            <div className="stats-card">
              <div className="stats-card__label">Total prospectos</div>
              <div className="stats-card__value">{data.totals.prospects}</div>
            </div>
            <div className="stats-card">
              <div className="stats-card__label">Sin verificar</div>
              <div className="stats-card__value">{data.totals.sinVerificar}</div>
            </div>
            <div className="stats-card">
              <div className="stats-card__label">Pre-solicitud completa</div>
              <div className="stats-card__value">{data.totals.preSolicitudCompleta}</div>
            </div>
          </div>

          <div className="stats-section">
            <div className="stats-section__title">Estado máximo alcanzado (pre-solicitud)</div>
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Estado</th>
                  <th style={{ width: '140px' }}>Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {data.counts.byMaxPreSolicitudStage.map((row) => (
                  <tr key={row.key}>
                    <td>{row.label}</td>
                    <td>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="stats-section">
            <div className="stats-section__title">Último estado registrado</div>
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Estado</th>
                  <th style={{ width: '140px' }}>Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {data.counts.byLastStage.map((row) => (
                  <tr key={row.key}>
                    <td>{row.label}</td>
                    <td>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="stats-section">
            <div className="stats-section__title">Sub-estado (última intención)</div>
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Intent</th>
                  <th style={{ width: '140px' }}>Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {data.counts.byLastIntent.map((row) => (
                  <tr key={row.key}>
                    <td>{row.label}</td>
                    <td>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="stats-section">
            <div className="stats-section__title">Detalle por prospecto</div>
            <div className="stats-table__wrap">
              <table className="stats-table">
                <thead>
                  <tr>
                    <th>waId</th>
                    <th>Sin/Pre</th>
                    <th>Último estado</th>
                    <th>Último intent</th>
                    <th>Máximo alcanzado</th>
                    <th>Atorado</th>
                    <th>Última interacción</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((it) => (
                    <tr key={it.waId}>
                      <td>{it.waId}</td>
                      <td>{it.verificationStatus === 'PRE_SOLICITUD_COMPLETA' ? 'Pre-solicitud completa' : 'Sin verificar'}</td>
                      <td>{it.lastStage}</td>
                      <td>{it.lastIntent}</td>
                      <td>{it.maxPreSolicitudStage}</td>
                      <td>{it.stuckStage || '-'}</td>
                      <td>{new Date(it.lastUserInteractionAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
