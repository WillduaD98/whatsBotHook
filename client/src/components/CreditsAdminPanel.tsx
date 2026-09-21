import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch, CreditListResponse, CreditRecord, CreditUploadSummary } from '../types';

interface CreditsAdminPanelProps {
  onNavigate: (path: string) => void;
  authToken: string;
  onUnauthorized: () => void;
}

export const CreditsAdminPanel: React.FC<CreditsAdminPanelProps> = ({ onNavigate, authToken, onUnauthorized }) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSummary, setUploadSummary] = useState<CreditUploadSummary | null>(null);

  const [query, setQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<CreditRecord[]>([]);
  const [total, setTotal] = useState(0);

  const runSearch = useCallback(
    async (numeroCredito: string) => {
      setSearchLoading(true);
      setSearchError(null);
      try {
        const params = numeroCredito.trim() ? `?numeroCredito=${encodeURIComponent(numeroCredito.trim())}` : '';
        const res = await apiFetch(`/api/credits${params}`, { token: authToken });
        if (res.status === 401) {
          onUnauthorized();
          return;
        }
        if (!res.ok) throw new Error(await res.text());
        const json = (await res.json()) as CreditListResponse;
        setResults(json.items);
        setTotal(json.total);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Error al buscar créditos';
        setSearchError(message);
        setResults([]);
        setTotal(0);
      } finally {
        setSearchLoading(false);
      }
    },
    [authToken, onUnauthorized]
  );

  useEffect(() => {
    runSearch('');
  }, [runSearch]);

  const onPickFile = (input: FileList | null) => {
    setFile(input && input.length > 0 ? input[0] : null);
  };

  const onUpload = async () => {
    if (uploading || !file) return;

    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append('file', file);

      const res = await apiFetch('/api/credits/upload', { method: 'POST', body: form, token: authToken });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as CreditUploadSummary;
      setUploadSummary(json);
      setFile(null);
      await runSearch(query);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Error al subir el CSV de créditos';
      setUploadError(message);
    } finally {
      setUploading(false);
    }
  };

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(query);
  };

  return (
    <div className="stats-panel">
      <div className="stats-header">
        <div>
          <div className="stats-title">Créditos</div>
          <div className="stats-subtitle">Cargar catálogo de créditos (CSV) y buscar por número</div>
        </div>
        <div className="stats-actions">
          <button className="stats-button" onClick={() => onNavigate('/')}>Volver</button>
        </div>
      </div>

      <div className="stats-section">
        <div className="stats-section__title">Cargar CSV</div>

        <div className="stats-filters" style={{ gridTemplateColumns: '1fr auto' }}>
          <div className="stats-filter">
            <label className="stats-label">Archivo (columnas: numeroCredito, nombre, clabe, referencia)</label>
            <input
              className="stats-input"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => onPickFile(e.target.files)}
              disabled={uploading}
            />
          </div>
          <div className="stats-filter stats-filter--apply">
            <label className="stats-label" style={{ visibility: 'hidden' }}>Subir</label>
            <button className="stats-button stats-button--primary" onClick={onUpload} disabled={uploading || !file}>
              {uploading ? 'Subiendo...' : 'Subir'}
            </button>
          </div>
        </div>

        {uploadError && <div className="stats-error" style={{ marginTop: '12px' }}>{uploadError}</div>}

        {uploadSummary && (
          <div className="stats-subtitle" style={{ marginTop: '12px' }}>
            Recibidos: {uploadSummary.recibidos} · Insertados: {uploadSummary.insertados} · Actualizados: {uploadSummary.actualizados} · Omitidos: {uploadSummary.omitidos}
            {uploadSummary.errores.length > 0 && (
              <ul>
                {uploadSummary.errores.map((err) => (
                  <li key={err.fila}>Fila {err.fila}: {err.motivo}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="stats-section">
        <div className="stats-section__title">Buscar créditos</div>

        <form onSubmit={onSearchSubmit}>
          <div className="stats-filters" style={{ gridTemplateColumns: '1fr auto' }}>
            <div className="stats-filter">
              <label className="stats-label">Número de crédito</label>
              <input
                className="stats-input"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Déjalo vacío para ver los últimos cargados"
                disabled={searchLoading}
              />
            </div>
            <div className="stats-filter stats-filter--apply">
              <label className="stats-label" style={{ visibility: 'hidden' }}>Buscar</label>
              <button type="submit" className="stats-button" disabled={searchLoading}>
                {searchLoading ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
          </div>
        </form>

        {searchError && <div className="stats-error" style={{ marginTop: '12px' }}>{searchError}</div>}

        <div className="stats-table__wrap" style={{ marginTop: '12px' }}>
          <table className="stats-table">
            <thead>
              <tr>
                <th>Número de crédito</th>
                <th>Nombre</th>
                <th>CLABE</th>
                <th>Referencia</th>
                <th style={{ width: '80px' }}>Activo</th>
              </tr>
            </thead>
            <tbody>
              {results.map((credit) => (
                <tr key={credit._id}>
                  <td>{credit.numeroCredito}</td>
                  <td>{credit.nombre}</td>
                  <td>{credit.clabe}</td>
                  <td>{credit.referencia}</td>
                  <td>{credit.activo ? 'Sí' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="stats-subtitle" style={{ marginTop: '8px' }}>Total encontrados: {total}</div>
      </div>
    </div>
  );
};
