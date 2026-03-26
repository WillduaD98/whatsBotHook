import React, { useMemo, useState } from 'react';
import { apiFetch } from '../types';

type Audience = 'SUSCRITO' | 'NO_SUSCRITO';
type WeeklyTipAudience = 'SUSCRITO' | 'NO_SUSCRITO';
type BroadcastMode = 'MESSAGE' | 'WEEKLY_TIP_TEMPLATE';

type BroadcastSendResponse = {
  audience: Audience;
  recipients: number;
  sent: number;
  failed: number;
  failures: string[];
};

type WeeklyTipBroadcastResponse = {
  audience: WeeklyTipAudience;
  recipients: number;
  sent: number;
  failed: number;
  failures: string[];
};

interface BulkBroadcastPanelProps {
  onNavigate: (path: string) => void;
  authToken: string;
  onUnauthorized: () => void;
}

export const BulkBroadcastPanel: React.FC<BulkBroadcastPanelProps> = ({ onNavigate, authToken, onUnauthorized }) => {
  const [mode, setMode] = useState<BroadcastMode>('MESSAGE');
  const [audience, setAudience] = useState<Audience>('SUSCRITO');
  const [text, setText] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [weeklyAudience, setWeeklyAudience] = useState<WeeklyTipAudience>('SUSCRITO');
  const [weeklyHeaderImage, setWeeklyHeaderImage] = useState<File | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(BroadcastSendResponse | WeeklyTipBroadcastResponse) | null>(null);

  const canSend = useMemo(() => {
    if (!confirm) return false;
    if (mode === 'WEEKLY_TIP_TEMPLATE') {
      if (!weeklyHeaderImage) return false;
      return !loading;
    }
    const t = text.trim();
    const hasImages = images.length > 0;
    if (!t && !hasImages) return false;
    if (t.length > 1500) return false;
    return !loading;
  }, [confirm, images.length, loading, mode, text, weeklyHeaderImage]);

  const onSend = async () => {
    if (!confirm) return;

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      if (mode === 'WEEKLY_TIP_TEMPLATE') {
        if (!weeklyHeaderImage) return;
        const body = new FormData();
        body.append('audience', weeklyAudience);
        body.append('headerImage', weeklyHeaderImage, weeklyHeaderImage.name);
        const res = await apiFetch('/api/broadcast/weekly-tip', {
          method: 'POST',
          token: authToken,
          body
        });
        if (res.status === 401) {
          onUnauthorized();
          return;
        }
        if (!res.ok) {
          throw new Error(await res.text());
        }
        const json = (await res.json()) as WeeklyTipBroadcastResponse;
        setResult(json);
      } else {
        const payloadText = text.trim();
        if (!payloadText && images.length === 0) return;

        const body = new FormData();
        body.append('audience', audience);
        if (payloadText) body.append('text', payloadText);
        body.append('confirm', 'true');
        images.forEach((img) => body.append('images', img, img.name));

        const res = await apiFetch('/api/broadcast/send', {
          method: 'POST',
          token: authToken,
          body
        });
        if (res.status === 401) {
          onUnauthorized();
          return;
        }
        if (!res.ok) {
          throw new Error(await res.text());
        }
        const json = (await res.json()) as BroadcastSendResponse;
        setResult(json);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Error al enviar mensajes masivos';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="stats-panel">
      <div className="stats-header">
        <div>
          <div className="stats-title">Envío masivo</div>
          <div className="stats-subtitle">Mensajes por estatus de suscripción</div>
        </div>
        <div className="stats-actions">
          <button className="stats-button" onClick={() => onNavigate('/')}>Volver</button>
        </div>
      </div>

      <div className="stats-section">
        <div className="stats-section__title">Configuración</div>
        <div className="stats-filters" style={{ gridTemplateColumns: '1fr 1fr 2fr auto' }}>
          <div className="stats-filter">
            <label className="stats-label">Tipo</label>
            <select
              className="stats-input"
              value={mode}
              onChange={(e) => {
                const next = e.target.value as BroadcastMode;
                setMode(next);
                setError(null);
                setResult(null);
              }}
            >
              <option value="MESSAGE">Mensaje / imágenes</option>
              <option value="WEEKLY_TIP_TEMPLATE">Consejo semanal (plantilla)</option>
            </select>
          </div>
          <div className="stats-filter">
            <label className="stats-label">Audiencia</label>
            {mode === 'WEEKLY_TIP_TEMPLATE' ? (
              <select className="stats-input" value={weeklyAudience} onChange={(e) => setWeeklyAudience(e.target.value as WeeklyTipAudience)}>
                <option value="SUSCRITO">SUSCRITO</option>
                <option value="NO_SUSCRITO">NO SUSCRITO</option>
              </select>
            ) : (
              <select className="stats-input" value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
                <option value="SUSCRITO">SUSCRITO</option>
                <option value="NO_SUSCRITO">NO SUSCRITO</option>
              </select>
            )}
          </div>
          <div className="stats-filter">
            <label className="stats-label">{mode === 'WEEKLY_TIP_TEMPLATE' ? 'Header (imagen)' : 'Mensaje'}</label>
            {mode === 'WEEKLY_TIP_TEMPLATE' ? (
              <>
                <input
                  className="stats-input"
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    const isImage = !!file && (!file.type || String(file.type).toLowerCase().startsWith('image/'));
                    setWeeklyHeaderImage(isImage ? file : null);
                  }}
                  disabled={loading}
                />
                <div className="stats-subtitle">
                  {weeklyHeaderImage ? weeklyHeaderImage.name : 'Selecciona 1 imagen (máx. 5MB)'}
                </div>
              </>
            ) : (
              <>
                <textarea
                  className="stats-input"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={6}
                  placeholder="Escribe el mensaje que se enviará a todos los clientes del grupo seleccionado..."
                  style={{ resize: 'vertical' }}
                  disabled={loading}
                />
                <div className="stats-subtitle">{text.trim().length}/1500</div>
              </>
            )}
          </div>
          <div className="stats-filter stats-filter--apply">
            <label className="stats-label" style={{ visibility: 'hidden' }}>Enviar</label>
            <button className="stats-button stats-button--primary" onClick={onSend} disabled={!canSend}>
              {loading ? 'Enviando...' : 'Enviar'}
            </button>
          </div>
        </div>

        {mode !== 'WEEKLY_TIP_TEMPLATE' && (
          <div className="stats-filters" style={{ gridTemplateColumns: '1fr', marginTop: '12px' }}>
            <div className="stats-filter">
              <label className="stats-label">Imágenes (puedes subir varias)</label>
              <input
                className="stats-input"
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  const next = [...images, ...files].slice(0, 10);
                  setImages(next);
                  e.target.value = '';
                }}
                disabled={loading}
              />
              <div className="stats-subtitle">{images.length}/10 imágenes seleccionadas (máx. 5MB c/u)</div>
            </div>
          </div>
        )}

        {mode !== 'WEEKLY_TIP_TEMPLATE' && images.length > 0 && (
          <div className="stats-section" style={{ marginTop: '12px' }}>
            <div className="stats-section__title">Previsualización</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '10px' }}>
              {images.map((img, idx) => {
                const url = URL.createObjectURL(img);
                return (
                  <div key={`${img.name}-${idx}`} style={{ border: '1px solid #e9edef', borderRadius: '10px', padding: '8px', background: '#fff' }}>
                    <img src={url} alt={img.name} style={{ width: '100%', borderRadius: '8px', display: 'block' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', gap: '8px' }}>
                      <div className="stats-subtitle" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.name}</div>
                      <button
                        className="stats-button"
                        onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                        disabled={loading}
                        style={{ padding: '6px 10px' }}
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input id="broadcast-confirm" type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          <label htmlFor="broadcast-confirm" className="stats-subtitle">
            Confirmo que quiero enviar este mensaje a todo el grupo seleccionado.
          </label>
        </div>
      </div>

      {error && (
        <div className="stats-error">{error}</div>
      )}

      {result && (
        <>
          <div className="stats-cards">
            <div className="stats-card">
              <div className="stats-card__label">Destinatarios</div>
              <div className="stats-card__value">{result.recipients}</div>
            </div>
            <div className="stats-card">
              <div className="stats-card__label">Enviados</div>
              <div className="stats-card__value">{result.sent}</div>
            </div>
            <div className="stats-card">
              <div className="stats-card__label">Fallidos</div>
              <div className="stats-card__value">{result.failed}</div>
            </div>
          </div>

          {result.failures.length > 0 && (
            <div className="stats-section">
              <div className="stats-section__title">Fallos (primeros {result.failures.length})</div>
              <div className="stats-table__wrap">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th>waId</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.failures.map((waId) => (
                      <tr key={waId}>
                        <td>{waId}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
