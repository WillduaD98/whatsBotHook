import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, buildApiUrl, WeeklyTip } from '../types';

interface WeeklyTipAdminPanelProps {
  onNavigate: (path: string) => void;
  authToken: string;
  onUnauthorized: () => void;
}

export const WeeklyTipAdminPanel: React.FC<WeeklyTipAdminPanelProps> = ({ onNavigate, authToken, onUnauthorized }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTip, setActiveTip] = useState<WeeklyTip | null>(null);

  const [tipText, setTipText] = useState('');
  const [active, setActive] = useState(true);
  const [replaceImages, setReplaceImages] = useState(true);
  const [files, setFiles] = useState<File[]>([]);

  const existingImagesCount = useMemo(() => (activeTip?.images?.length ? activeTip.images.length : 0), [activeTip]);
  const totalImagesAfterUpload = useMemo(() => existingImagesCount + files.length, [existingImagesCount, files.length]);

  const fetchActive = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/weekly-tip/active', { token: authToken });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as WeeklyTip | null;
      setActiveTip(json);
      setTipText(json?.tipText || '');
      setActive(json?.active ?? true);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Error al cargar consejo activo';
      setError(message);
      setActiveTip(null);
    } finally {
      setLoading(false);
    }
  }, [authToken, onUnauthorized]);

  useEffect(() => {
    fetchActive();
  }, [fetchActive]);

  const onPickFiles = (input: FileList | null) => {
    if (!input) {
      setFiles([]);
      return;
    }

    const picked = Array.from(input).filter((f) => String(f.type || '').startsWith('image/'));
    const maxAdditional = Math.max(0, 10 - existingImagesCount);
    setFiles(picked.slice(0, maxAdditional));
  };

  const onSave = async () => {
    if (loading) return;
    if (!tipText.trim() && files.length === 0) {
      setError('Agrega tipText o al menos 1 imagen');
      return;
    }
    if (totalImagesAfterUpload > 10) {
      setError('Máximo 10 imágenes');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('tipText', tipText.trim());
      form.append('active', active ? 'true' : 'false');
      form.append('replaceImages', replaceImages ? 'true' : 'false');
      for (const f of files) form.append('images', f);

      const res = await apiFetch('/api/weekly-tip/active', { method: 'POST', body: form, token: authToken });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as WeeklyTip;
      setActiveTip(json);
      setTipText(json.tipText || '');
      setActive(json.active);
      setFiles([]);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Error al guardar consejo activo';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const onDeleteImage = async (imageId: string) => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/weekly-tip/active/images/${encodeURIComponent(imageId)}`, { method: 'DELETE', token: authToken });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as WeeklyTip;
      setActiveTip(json);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Error al eliminar imagen';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="stats-panel">
      <div className="stats-header">
        <div>
          <div className="stats-title">Consejo activo de la semana</div>
          <div className="stats-subtitle">Texto + imágenes (máximo 10)</div>
        </div>
        <div className="stats-actions">
          <button className="stats-button" onClick={() => onNavigate('/')}>Volver</button>
        </div>
      </div>

      <div className="stats-section">
        <div className="stats-section__title">Configuración</div>

        <div className="stats-filters" style={{ gridTemplateColumns: '1fr 1fr auto' }}>
          <div className="stats-filter">
            <label className="stats-label">Activo</label>
            <select className="stats-input" value={active ? 'true' : 'false'} onChange={(e) => setActive(e.target.value === 'true')}>
              <option value="true">Sí</option>
              <option value="false">No</option>
            </select>
          </div>
          <div className="stats-filter">
            <label className="stats-label">Imágenes</label>
            <select className="stats-input" value={replaceImages ? 'true' : 'false'} onChange={(e) => setReplaceImages(e.target.value === 'true')}>
              <option value="true">Reemplazar</option>
              <option value="false">Agregar</option>
            </select>
            <div className="stats-subtitle">
              Existentes: {existingImagesCount} · Nuevas: {files.length} · Total: {totalImagesAfterUpload}/10
            </div>
          </div>
          <div className="stats-filter stats-filter--apply">
            <label className="stats-label" style={{ visibility: 'hidden' }}>Guardar</label>
            <button className="stats-button stats-button--primary" onClick={onSave} disabled={loading}>
              {loading ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>

        <div className="stats-filters" style={{ gridTemplateColumns: '1fr', marginTop: '12px' }}>
          <div className="stats-filter">
            <label className="stats-label">Tip (texto corto)</label>
            <textarea
              className="stats-input"
              value={tipText}
              onChange={(e) => setTipText(e.target.value)}
              rows={4}
              placeholder="Escribe el consejo corto de la semana..."
              style={{ resize: 'vertical' }}
            />
          </div>
        </div>

        <div className="stats-filters" style={{ gridTemplateColumns: '1fr', marginTop: '12px' }}>
          <div className="stats-filter">
            <label className="stats-label">Subir imágenes</label>
            <input
              className="stats-input"
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => onPickFiles(e.target.files)}
              disabled={loading}
            />
            <div className="stats-subtitle">Al enviar por WhatsApp se mandan todas las imágenes guardadas.</div>
          </div>
        </div>

        {error && (
          <div className="stats-error" style={{ marginTop: '12px' }}>{error}</div>
        )}
      </div>

      <div className="stats-section">
        <div className="stats-section__title">Imágenes actuales</div>
        {!activeTip || !activeTip.images || activeTip.images.length === 0 ? (
          <div className="stats-subtitle">No hay imágenes guardadas.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
            {activeTip.images.map((img) => (
              <div key={img._id} style={{ border: '1px solid #e6e8ee', borderRadius: '10px', overflow: 'hidden', background: 'white' }}>
                <div style={{ width: '100%', aspectRatio: '1 / 1', background: '#f3f5f7' }}>
                  <img
                    src={buildApiUrl(img.mediaUrl)}
                    alt="weekly tip"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </div>
                <div style={{ padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  <div style={{ fontSize: '12px', color: '#576071', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {img.filename}
                  </div>
                  <button className="stats-button" onClick={() => onDeleteImage(img._id)} disabled={loading}>
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
