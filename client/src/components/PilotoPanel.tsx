// Panel 🔥 Piloto: imagen del encabezado de la plantilla prox_credito_gancho y citas de renovación que agenda el bot.
import React, { useCallback, useEffect, useState } from 'react';
import {
  apiFetch,
  buildApiUrl,
  GanchoImagenResponse,
  RenovacionCitaListResponse,
  RenovacionCitaRecord,
  RenovacionCitaStatus
} from '../types';

interface PilotoPanelProps {
  onNavigate: (path: string) => void;
  authToken: string;
  onUnauthorized: () => void;
}

const STATUS_LABELS: Record<RenovacionCitaStatus, string> = {
  pendiente_confirmacion: 'Por confirmar (mañana)',
  pendiente_fecha: 'Pidió otro día'
};

const STATUS_OPTIONS: Array<{ value: RenovacionCitaStatus | ''; label: string }> = [
  { value: 'pendiente_confirmacion', label: 'Por confirmar (mañana)' },
  { value: 'pendiente_fecha', label: 'Pidió otro día' },
  { value: '', label: 'Todas' }
];

const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

// El server responde { message } en sus errores; si no es JSON, se muestra el texto tal cual.
async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const raw = await res.text();
  try {
    const parsed: { message?: string } = JSON.parse(raw);
    return parsed.message || raw;
  } catch {
    return raw || fallback;
  }
}

// "2026-10-30" → "vie 30 oct 2026" (se arma a mediodía para que la zona horaria del navegador no cambie el día).
function formatFechaCita(fecha: string | null): string {
  if (!fecha) return '—';
  return new Date(`${fecha}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export const PilotoPanel: React.FC<PilotoPanelProps> = ({ onNavigate, authToken, onUnauthorized }) => {
  const [imagenUrl, setImagenUrl] = useState<string | null>(null);
  const [imagenFile, setImagenFile] = useState<File | null>(null);
  const [imagenSubiendo, setImagenSubiendo] = useState(false);
  const [imagenError, setImagenError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<RenovacionCitaStatus | ''>('pendiente_confirmacion');
  const [citas, setCitas] = useState<RenovacionCitaRecord[]>([]);
  const [citasLoading, setCitasLoading] = useState(false);
  const [citasError, setCitasError] = useState<string | null>(null);

  const fetchImagen = useCallback(async () => {
    setImagenError(null);
    try {
      const res = await apiFetch('/api/piloto/gancho-imagen', { token: authToken });
      if (res.status === 401) { onUnauthorized(); return; }
      if (!res.ok) throw new Error(await readErrorMessage(res, 'Error al cargar la imagen del gancho'));
      const json = (await res.json()) as GanchoImagenResponse;
      setImagenUrl(json.url);
    } catch (e: unknown) {
      setImagenError(e instanceof Error ? e.message : 'Error al cargar la imagen del gancho');
    }
  }, [authToken, onUnauthorized]);

  const fetchCitas = useCallback(
    async (status: RenovacionCitaStatus | '') => {
      setCitasLoading(true);
      setCitasError(null);
      try {
        const params = status ? `?status=${encodeURIComponent(status)}` : '';
        const res = await apiFetch(`/api/piloto/citas${params}`, { token: authToken });
        if (res.status === 401) { onUnauthorized(); return; }
        if (!res.ok) throw new Error(await readErrorMessage(res, 'Error al cargar las citas'));
        const json = (await res.json()) as RenovacionCitaListResponse;
        setCitas(json.items);
      } catch (e: unknown) {
        setCitasError(e instanceof Error ? e.message : 'Error al cargar las citas');
        setCitas([]);
      } finally {
        setCitasLoading(false);
      }
    },
    [authToken, onUnauthorized]
  );

  useEffect(() => {
    fetchImagen();
  }, [fetchImagen]);

  useEffect(() => {
    fetchCitas(statusFilter);
  }, [fetchCitas, statusFilter]);

  const onUploadImagen = async () => {
    if (imagenSubiendo || !imagenFile) return;
    setImagenSubiendo(true);
    setImagenError(null);
    try {
      const form = new FormData();
      form.append('imagen', imagenFile, imagenFile.name);
      const res = await apiFetch('/api/piloto/gancho-imagen', { method: 'POST', body: form, token: authToken });
      if (res.status === 401) { onUnauthorized(); return; }
      if (!res.ok) throw new Error(await readErrorMessage(res, 'Error al subir la imagen'));
      const json = (await res.json()) as GanchoImagenResponse;
      setImagenUrl(json.url);
      setImagenFile(null);
    } catch (e: unknown) {
      setImagenError(e instanceof Error ? e.message : 'Error al subir la imagen');
    } finally {
      setImagenSubiendo(false);
    }
  };

  return (
    <div className="stats-panel">
      <div className="stats-header">
        <div>
          <div className="stats-title">Piloto de renovación</div>
          <div className="stats-subtitle">Imagen del gancho y citas de renovación agendadas por el bot</div>
        </div>
        <div className="stats-actions">
          <button className="stats-button" onClick={() => onNavigate('/')}>Volver</button>
        </div>
      </div>

      <div className="stats-section">
        <div className="stats-section__title">Imagen del gancho (prox_credito_gancho)</div>
        <div className="stats-subtitle">Es el encabezado que lleva cada envío del gancho. Al subir una nueva, reemplaza a la anterior.</div>

        <div style={{ marginTop: '12px', display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {imagenUrl ? (
            <img
              src={buildApiUrl(imagenUrl)}
              alt="Imagen actual del gancho"
              style={{ width: '220px', maxHeight: '220px', objectFit: 'contain', borderRadius: '8px', border: '1px solid #ddd', cursor: 'pointer' }}
              onClick={() => window.open(buildApiUrl(imagenUrl), '_blank')}
            />
          ) : (
            <div className="stats-error" style={{ maxWidth: '220px' }}>
              Aún no hay imagen: sin ella no se puede mandar el gancho.
            </div>
          )}

          <div className="stats-filters" style={{ gridTemplateColumns: '1fr auto', flex: 1, minWidth: '260px' }}>
            <div className="stats-filter">
              <label className="stats-label">Nueva imagen (JPG o PNG, máx. 5 MB)</label>
              <input
                className="stats-input"
                type="file"
                accept="image/jpeg,image/png"
                onChange={(e) => setImagenFile(e.target.files && e.target.files.length > 0 ? e.target.files[0] : null)}
                disabled={imagenSubiendo}
              />
            </div>
            <div className="stats-filter stats-filter--apply">
              <label className="stats-label" style={{ visibility: 'hidden' }}>Subir</label>
              <button className="stats-button stats-button--primary" onClick={onUploadImagen} disabled={imagenSubiendo || !imagenFile}>
                {imagenSubiendo ? 'Subiendo...' : 'Subir'}
              </button>
            </div>
          </div>
        </div>

        {imagenError && <div className="stats-error" style={{ marginTop: '12px' }}>{imagenError}</div>}
      </div>

      <div className="stats-section">
        <div className="stats-section__title">Citas de renovación</div>

        <div className="stats-filters" style={{ gridTemplateColumns: '1fr' }}>
          <div className="stats-filter">
            <label className="stats-label">Estado</label>
            <select
              className="stats-input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as RenovacionCitaStatus | '')}
              disabled={citasLoading}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value || 'todas'} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {citasError && <div className="stats-error" style={{ marginTop: '12px' }}>{citasError}</div>}

        <div className="stats-table__wrap" style={{ marginTop: '12px' }}>
          <table className="stats-table">
            <thead>
              <tr>
                <th>Fecha de visita</th>
                <th>Cliente</th>
                <th>Crédito</th>
                <th>Monto</th>
                <th>Plazo</th>
                <th>Cuota estimada</th>
                <th>Estado</th>
                <th>Agendada</th>
              </tr>
            </thead>
            <tbody>
              {citas.map((cita) => (
                <tr key={cita.id}>
                  <td>{formatFechaCita(cita.fechaCita)}</td>
                  <td>
                    <div>{cita.nombre || '—'}</div>
                    <div style={{ fontSize: '0.85em', color: '#667' }}>{cita.waId}</div>
                  </td>
                  <td>{cita.numeroCredito}</td>
                  <td>{PESOS.format(cita.monto)}</td>
                  <td>{cita.plazoSemanas} semanas</td>
                  <td>{PESOS.format(cita.cuotaSemanal)}/semana</td>
                  <td>{STATUS_LABELS[cita.status]}</td>
                  <td>{new Date(cita.createdAt).toLocaleString('es-MX')}</td>
                </tr>
              ))}
              {!citasLoading && citas.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: '#667' }}>No hay citas con este estado</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="stats-subtitle" style={{ marginTop: '8px' }}>Total: {citas.length}</div>
      </div>
    </div>
  );
};
