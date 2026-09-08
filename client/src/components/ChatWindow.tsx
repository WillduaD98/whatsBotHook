import React, { useEffect, useState, useRef } from 'react';
import { apiFetch, buildApiUrl, Conversation, Message } from '../types';
import { sortDedupe, sameDay, dayLabel } from './chat/messageUtils';

interface ChatWindowProps {
  conversation: Conversation | null;
  authToken: string;
  onUnauthorized: () => void;
  onBack?: () => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ conversation, authToken, onUnauthorized, onBack }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasAutoScrolledRef = useRef(false);

  const normalizeSubscriptionStatus = (value?: string) => (value === 'SUSCRITO' ? 'SUSCRITO' : 'NO_SUSCRITO');
  
  // Local state for manual controls
  const [currentStage, setCurrentStage] = useState(conversation?.stage || 'start');
  const [currentStatus, setCurrentStatus] = useState(conversation?.verificationStatus || 'NONE');
  const [currentSubscription, setCurrentSubscription] = useState(normalizeSubscriptionStatus(conversation?.subscriptionStatus));
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [weeklyTipOpen, setWeeklyTipOpen] = useState(false);
  const [weeklyTipHeaderImage, setWeeklyTipHeaderImage] = useState<File | null>(null);
  const [weeklyTipSending, setWeeklyTipSending] = useState(false);
  const [weeklyTipError, setWeeklyTipError] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [paySending, setPaySending] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({ numero: '', nombre: '', fecha: '', monto: '', clabe: '', referencia: '', tipo: 'antes' });
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    if (conversation) {
        setCurrentStage(conversation.stage);
        setCurrentStatus(conversation.verificationStatus || 'NONE');
        setCurrentSubscription(normalizeSubscriptionStatus(conversation.subscriptionStatus));
    }
  }, [conversation]);

  const handleStageChange = async (newStage: string) => {
      if (!conversation) return;
      try {
          const res = await apiFetch(`/api/conversations/${conversation.waId}`, {
              method: 'PATCH',
              token: authToken,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ stage: newStage })
          });

          if (res.status === 401) {
              onUnauthorized();
              return;
          }
          
          if (!res.ok) {
              alert('Error al actualizar el estado en el servidor');
              return;
          }
          
          setCurrentStage(newStage);
      } catch (err) {
          alert('Error de conexión al actualizar estado');
      }
  };

  const handleStatusChange = async (newStatus: string) => {
      if (!conversation) return;
      try {
          const res = await apiFetch(`/api/conversations/${conversation.waId}`, {
              method: 'PATCH',
              token: authToken,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ verificationStatus: newStatus })
          });

          if (res.status === 401) {
              onUnauthorized();
              return;
          }

          if (!res.ok) {
              alert('Error al actualizar el estatus de verificación');
              return;
          }

          setCurrentStatus(newStatus);
      } catch (err) {
          alert('Error de conexión al actualizar estatus');
      }
  };

  const handleSubscriptionChange = async (newSubscription: string) => {
      if (!conversation) return;
      try {
          const res = await apiFetch(`/api/conversations/${conversation.waId}`, {
              method: 'PATCH',
              token: authToken,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ subscriptionStatus: newSubscription })
          });

          if (res.status === 401) {
              onUnauthorized();
              return;
          }
          
          if (!res.ok) {
              alert('Error al actualizar la suscripción');
              return;
          }
          
          setCurrentSubscription(newSubscription);
      } catch (err) {
          alert('Error de conexión al actualizar suscripción');
      }
  };

  const handleSendMessage = async () => {
      if (!conversation || !inputText.trim() || sending) return;
      
      setSending(true);
      try {
          const res = await apiFetch('/api/messages/send', {
              method: 'POST',
              token: authToken,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ waId: conversation.waId, text: inputText })
          });

          if (res.status === 401) {
              onUnauthorized();
              return;
          }
          
          if (res.ok) {
              const newMsg = await res.json();
              setMessages(prev => sortDedupe([...prev, newMsg]));
              setInputText('');
          } else {
              alert('Error al enviar mensaje');
          }
      } catch (err) {
          alert('Error de conexión al enviar mensaje');
      } finally {
          setSending(false);
      }
  };

  const handleSendWeeklyTip = async () => {
      if (!conversation || weeklyTipSending) return;
      if (!weeklyTipHeaderImage) {
          setWeeklyTipError('Selecciona 1 imagen para el header');
          return;
      }

      setWeeklyTipSending(true);
      setWeeklyTipError(null);
      try {
          const body = new FormData();
          body.append('headerImage', weeklyTipHeaderImage, weeklyTipHeaderImage.name);
          const res = await apiFetch(`/api/chats/${conversation.waId}/weekly-tip`, {
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

          const newMsg = await res.json();
          setMessages(prev => sortDedupe([...prev, newMsg]));
          setWeeklyTipHeaderImage(null);
          setWeeklyTipOpen(false);
      } catch (e: unknown) {
          const message = e instanceof Error ? e.message : 'Error al enviar consejo semanal';
          setWeeklyTipError(message);
      } finally {
          setWeeklyTipSending(false);
      }
  };

  const handleSendPaymentReminder = async () => {
      if (!conversation || paySending) return;
        const numero = (payForm.numero || '').trim();
        const nombre = (payForm.nombre || '').trim();
        const fecha = (payForm.fecha || '').trim();
        const monto = (payForm.monto || '').trim();
        const clabe = (payForm.clabe || '').trim();
        const referencia = (payForm.referencia || '').trim();
        const tipo = payForm.tipo;

        if (!numero) { setPayError('Falta el número de teléfono'); return; }
        if (!tipo) { setPayError('Falta el tipo'); return; }

        const tiposValidos = new Set(['hoy', 'atraso', 'atraso2', 'atrasolargo']);  
        if (!tiposValidos.has(tipo)) { setPayError('Tipo inválido'); return; }
        
      const requeridos = tipo === 'atraso'
          ? { clabe, referencia }
          : tipo === 'atraso2'
          ? { nombre, clabe, referencia }
          : tipo === 'hoy'
          ? { monto, clabe, referencia }
          : tipo === 'atrasolargo'
          ? { nombre, clabe, referencia }
          : { nombre, fecha, monto, clabe, referencia };
      const faltan = Object.entries(requeridos)
          .filter(([, v]) => !v)
          .map(([k]) => k);
      if (faltan.length > 0) { setPayError('Faltan campos: ' + faltan.join(', ')); return; }

      setPaySending(true);
      setPayError(null);
      try {
          const res = await apiFetch(`/api/chats/${encodeURIComponent(numero)}/payment-reminder`, {
              method: 'POST',
              token: authToken,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tipo, nombre, fecha, monto, clabe, referencia })
          });

          if (res.status === 401) { onUnauthorized(); return; }
          if (!res.ok) { throw new Error(await res.text()); }

          const newMsg = await res.json();
          // Solo lo insertamos en el hilo visible si es el mismo chat abierto
          if (String(newMsg?.waId) === String(conversation.waId)) {
              setMessages(prev => sortDedupe([...prev, newMsg]));
          }
          setPayOpen(false);
      } catch (e: unknown) {
          const message = e instanceof Error ? e.message : 'Error al enviar recordatorio de pago';
          setPayError(message);
      } finally {
          setPaySending(false);
      }
  };

  useEffect(() => {
    if (!conversation) return;

    setLoading(true);
    apiFetch(`/api/messages/${conversation.waId}`, { token: authToken })
      .then(async (res) => {
        if (res.status === 401) {
          onUnauthorized();
          return;
        }
        const data = (await res.json()) as Message[];
        setMessages(sortDedupe(data));
        setLoading(false);
      })
      .catch(() => setLoading(false));
      
    // Poll for new messages every 3 seconds
    const interval = setInterval(() => {
        apiFetch(`/api/messages/${conversation.waId}`, { token: authToken })
            .then(async (res) => {
                if (res.status === 401) {
                    onUnauthorized();
                    return;
                }
                const data = (await res.json()) as Message[];
                setMessages(sortDedupe(data));
            })
            .catch(() => undefined);
    }, 3000);

    return () => clearInterval(interval);

  }, [authToken, conversation, onUnauthorized]);

  useEffect(() => {
    hasAutoScrolledRef.current = false;
  }, [conversation?.waId]);

  useEffect(() => {
    if (hasAutoScrolledRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    hasAutoScrolledRef.current = true;
  }, [messages]);

  if (!conversation) {
    return (
      <div className="chat-window">
        <div className="chat-placeholder">
          <h2>Selecciona un chat para empezar</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-window">
      <div className="chat-header">
        <button className="chat-back-button" onClick={() => onBack?.()} aria-label="Regresar" title="Regresar">←</button>
        <div className="avatar">👤</div>
        <div className="chat-info">
          <h3>{conversation.waId}</h3>
          <div className="chat-subtitle">{currentStage === 'ASESOR' ? 'Modo asesor' : 'Bot activo'}</div>
        </div>
        <button className="advisor-toggle" onClick={() => setPanelOpen(v => !v)} aria-label="Acciones" title="Acciones de asesor">⚙️</button>
      </div>
      {panelOpen && (
        <div className="advisor-panel">
          <div style={{ display: 'flex', gap: '10px', marginTop: '5px', flexWrap: 'wrap', alignItems: 'center' }}>
            <select 
                value={currentStage} 
                onChange={(e) => handleStageChange(e.target.value)}
                style={{ padding: '4px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.9em' }}
            >
                <option value="start">Start (Bot)</option>
                <option value="ASESOR">ASESOR (Humano)</option>
                <option value="PRE_SOLICITUD:aviso_privacidad">Pre-sol: Aviso Privacidad</option>
                <option value="PRE_SOLICITUD:espera_ubicacion">Pre-sol: Ubicación</option>
                <option value="PRE_SOLICITUD:espera_fotos_negocio">Pre-sol: Fotos</option>
                <option value="PRE_SOLICITUD:espera_ine_frente">Pre-sol: INE Frente</option>
                <option value="PRE_SOLICITUD:espera_ine_atras">Pre-sol: INE Atrás</option>
                <option value="PRE_SOLICITUD:espera_comprobante">Pre-sol: Comprobante</option>
            </select>
            
            <select 
                value={currentStatus} 
                onChange={(e) => handleStatusChange(e.target.value)}
                style={{ 
                    padding: '4px', 
                    borderRadius: '4px', 
                    border: '1px solid #ccc', 
                    fontSize: '0.9em',
                    backgroundColor: currentStatus === 'PRE_SOLICITUD_COMPLETA' ? '#e8f5e9' : 'white',
                    color: currentStatus === 'PRE_SOLICITUD_COMPLETA' ? '#2e7d32' : 'black'
                }}
            >
                <option value="NONE">Sin Verificar</option>
                <option value="PRE_SOLICITUD_COMPLETA">✅ PRE-SOLICITUD COMPLETA</option>
            </select>

            <select 
                value={currentSubscription} 
                onChange={(e) => handleSubscriptionChange(e.target.value)}
                style={{ 
                    padding: '4px', 
                    borderRadius: '4px', 
                    border: '1px solid #ccc', 
                    fontSize: '0.9em',
                    backgroundColor: currentSubscription === 'SUSCRITO' ? '#e3f2fd' : 'white',
                    color: currentSubscription === 'SUSCRITO' ? '#1565c0' : 'black'
                }}
            >
                <option value="NO_SUSCRITO">Sin suscripción</option>
                <option value="SUSCRITO">🔔 SUSCRITO</option>
            </select>
            <button
              onClick={() => { setWeeklyTipError(null); setWeeklyTipOpen(true); }}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #ccc',
                background: '#fff',
                cursor: 'pointer',
                fontSize: '0.9em'
              }}
              title="Enviar plantilla consejo_semanal_v1"
            >
              📩 Consejo semanal
            </button>
            <button
              onClick={() => {
                setPayError(null);
                setPayForm({ numero: conversation.waId, nombre: '', fecha: '', monto: '', clabe: '', referencia: '', tipo: 'antes' });
                setPayOpen(true);
              }}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #ccc',
                background: '#fff',
                cursor: 'pointer',
                fontSize: '0.9em'
              }}
              title="Enviar plantilla recordatorio_de_pago1"
            >
              💳 Recordatorio de pago
            </button>
          </div>
        </div>
      )}

      {weeklyTipOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            zIndex: 1000
          }}
          onClick={() => { if (!weeklyTipSending) setWeeklyTipOpen(false); }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '520px',
              background: '#fff',
              borderRadius: '10px',
              border: '1px solid rgba(0,0,0,0.1)',
              padding: '14px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
              <div style={{ fontWeight: 700 }}>Enviar consejo semanal (plantilla)</div>
              <button
                onClick={() => setWeeklyTipOpen(false)}
                disabled={weeklyTipSending}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '18px' }}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <div style={{ marginTop: '10px' }}>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  const isImage = !!file && (!file.type || String(file.type).toLowerCase().startsWith('image/'));
                  setWeeklyTipHeaderImage(isImage ? file : null);
                }}
                disabled={weeklyTipSending}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }}
              />
              {weeklyTipHeaderImage && (
                <div style={{ marginTop: '8px', color: '#576071', fontSize: '0.9em' }}>
                  Seleccionada: {weeklyTipHeaderImage.name}
                </div>
              )}
              {weeklyTipError && (
                <div style={{ marginTop: '8px', color: '#b00020', fontSize: '0.9em' }}>
                  {weeklyTipError}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <button
                onClick={() => setWeeklyTipOpen(false)}
                disabled={weeklyTipSending}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSendWeeklyTip}
                disabled={weeklyTipSending || !weeklyTipHeaderImage}
                style={{ padding: '8px 12px', borderRadius: '8px', border: 'none', background: '#008069', color: '#fff', cursor: 'pointer' }}
              >
                {weeklyTipSending ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {payOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 1000 }}
          onClick={() => { if (!paySending) setPayOpen(false); }}
        >
          <div
            style={{ width: '100%', maxWidth: '520px', background: '#fff', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.1)', padding: '14px', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
              <div style={{ fontWeight: 700 }}>💳 Recordatorio de pago (plantilla)</div>
              <button
                onClick={() => setPayOpen(false)}
                disabled={paySending}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '18px' }}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div style={{ marginTop: '10px', display: 'grid', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setPayForm((prev) => ({ ...prev, tipo: 'antes' }))}
                  disabled={paySending}
                  style={{ flex: 1, padding: '8px', borderRadius: '8px', cursor: 'pointer', border: payForm.tipo === 'antes' ? '2px solid #008069' : '1px solid #ddd', background: payForm.tipo === 'antes' ? '#e8f5f1' : '#fff', fontWeight: payForm.tipo === 'antes' ? 700 : 400 }}
                >
                  Antes del pago
                </button>
                <button
                  type="button"
                  onClick={() => setPayForm((prev) => ({ ...prev, tipo: 'hoy' }))}
                  disabled={paySending}
                  style={{ flex: 1, padding: '8px', borderRadius: '8px', cursor: 'pointer', border: payForm.tipo === 'hoy' ? '2px solid #008069' : '1px solid #ddd', background: payForm.tipo === 'hoy' ? '#e8f5f1' : '#fff', fontWeight: payForm.tipo === 'hoy' ? 700 : 400 }}
                >
                  El día de pago
                </button>
                <button
                  type="button"
                  onClick={() => setPayForm((prev) => ({ ...prev, tipo: 'atraso' }))}
                  disabled={paySending}
                  style={{ flex: 1, padding: '8px', borderRadius: '8px', cursor: 'pointer', border: payForm.tipo === 'atraso' ? '2px solid #008069' : '1px solid #ddd', background: payForm.tipo === 'atraso' ? '#e8f5f1' : '#fff', fontWeight: payForm.tipo === 'atraso' ? 700 : 400 }}
                >
                  Pago atrasado
                </button>
                <button
                  type="button"
                  onClick={() => setPayForm((prev) => ({ ...prev, tipo: 'atraso2' }))}
                  disabled={paySending}
                  style={{ flex: 1, padding: '8px', borderRadius: '8px', cursor: 'pointer', border: payForm.tipo === 'atraso2' ? '2px solid #008069' : '1px solid #ddd', background: payForm.tipo === 'atraso2' ? '#e8f5f1' : '#fff', fontWeight: payForm.tipo === 'atraso2' ? 700 : 400 }}
                >
                  Atraso día 2
                </button>

                <button
                  type = 'button'
                  onClick={() => setPayForm((prev) => ({ ...prev, tipo: 'atrasolargo'}))}
                  disabled={paySending}
                  style={{ flex: 1, padding: '8px', borderRadius: '8px', cursor: 'pointer', border: payForm.tipo === 'atrasolargo' ? '2px solid #008069' : '1px solid #ddd', background: payForm.tipo === 'atrasolargo' ? '#e8f5f1' : '#fff', fontWeight: payForm.tipo === 'atrasolargo' ? 700 : 400 }}
                >
                  Atraso Largo
                </button>
              </div>
              <label style={{ display: 'grid', gap: '4px', fontSize: '0.9em', color: '#334' }}>
                <span>Número de teléfono (con lada, ej. 5214771234567)</span>
                <input
                  type="text"
                  value={payForm.numero}
                  onChange={(e) => setPayForm((prev) => ({ ...prev, numero: e.target.value }))}
                  disabled={paySending}
                  placeholder="5214771234567"
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }}
                />
              </label>
              {(payForm.tipo === 'antes' || payForm.tipo === 'atraso2' || payForm.tipo === 'atrasolargo') && (
              <label style={{ display: 'grid', gap: '4px', fontSize: '0.9em', color: '#334' }}>
                <span>Nombre del cliente</span>
                <input
                  type="text"
                  value={payForm.nombre}
                  onChange={(e) => setPayForm((prev) => ({ ...prev, nombre: e.target.value }))}
                  disabled={paySending}
                  placeholder="María"
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }}
                />
              </label>
              )}
              {payForm.tipo === 'antes' && (
              <label style={{ display: 'grid', gap: '4px', fontSize: '0.9em', color: '#334' }}>
                <span>Fecha de pago</span>
                <input
                  type="text"
                  value={payForm.fecha}
                  onChange={(e) => setPayForm((prev) => ({ ...prev, fecha: e.target.value }))}
                  disabled={paySending}
                  placeholder="05/09/2026"
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }}
                />
              </label>
              )}
{(payForm.tipo === 'antes' || payForm.tipo === 'hoy') && (
              <label style={{ display: 'grid', gap: '4px', fontSize: '0.9em', color: '#334' }}>
                <span>Monto (solo número, el "$" ya va en la plantilla)</span>
                <input
                  type="text"
                  value={payForm.monto}
                  onChange={(e) => setPayForm((prev) => ({ ...prev, monto: e.target.value }))}
                  disabled={paySending}
                  placeholder="1,500.00"
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }}
                />
              </label>
              )}
              <label style={{ display: 'grid', gap: '4px', fontSize: '0.9em', color: '#334' }}>
                <span>CLABE interbancaria</span>
                <input
                  type="text"
                  value={payForm.clabe}
                  onChange={(e) => setPayForm((prev) => ({ ...prev, clabe: e.target.value }))}
                  disabled={paySending}
                  placeholder="012345678901234567"
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }}
                />
              </label>
              <label style={{ display: 'grid', gap: '4px', fontSize: '0.9em', color: '#334' }}>
                <span>Referencia</span>
                <input
                  type="text"
                  value={payForm.referencia}
                  onChange={(e) => setPayForm((prev) => ({ ...prev, referencia: e.target.value }))}
                  disabled={paySending}
                  placeholder="FAC-000123"
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }}
                />
              </label>

              {payError && (
                <div style={{ color: '#b00020', fontSize: '0.9em' }}>{payError}</div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <button
                onClick={() => setPayOpen(false)}
                disabled={paySending}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSendPaymentReminder}
                disabled={paySending}
                style={{ padding: '8px 12px', borderRadius: '8px', border: 'none', background: '#008069', color: '#fff', cursor: 'pointer' }}
              >
                {paySending ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="chat-messages">
        {loading ? (
          <div>Loading messages...</div>
        ) : (
          messages.map((msg, index) => {
            const prevMsg = index > 0 ? messages[index - 1] : null;
            const showDate = !prevMsg || !sameDay(prevMsg.createdAt, msg.createdAt);
            return (
            <React.Fragment key={(msg._id || index) + '-frag'}>
              {showDate && (
                <div className="date-separator"><span>{dayLabel(msg.createdAt)}</span></div>
              )}
            <div 
              key={msg._id || index} 
              className={`message ${msg.direction === 'outgoing' ? 'outgoing' : 'incoming'}`}
            >
              <div className="message-content">
                {msg.type === 'image' && msg.mediaUrl && (
                  <div className="message-media">
                    <img 
                      src={buildApiUrl(msg.mediaUrl)} 
                      alt={msg.caption || "Imagen"} 
                      style={{ maxWidth: '100%', borderRadius: '4px', cursor: 'pointer' }}
                      onClick={() => window.open(buildApiUrl(msg.mediaUrl || ''), '_blank')}
                    />
                    <div style={{ marginTop: '5px' }}>
                      <a 
                        href={buildApiUrl(msg.mediaUrl)} 
                        download 
                        target="_blank" 
                        rel="noreferrer"
                        className="download-link"
                      >
                        Descargar 📥
                      </a>
                    </div>
                  </div>
                )}
                {msg.type === 'template' && msg.mediaUrl && (
                  <div className="message-media">
                    {msg.mediaUrl && (
                      <>
                        <img
                          src={buildApiUrl(msg.mediaUrl)}
                          alt="Header de plantilla"
                          style={{ maxWidth: '100%', borderRadius: '4px', cursor: 'pointer' }}
                          onClick={() => window.open(buildApiUrl(msg.mediaUrl || ''), '_blank')}
                        />
                        <div style={{ marginTop: '5px' }}>
                          <a
                            href={buildApiUrl(msg.mediaUrl)}
                            download
                            target="_blank"
                            rel="noreferrer"
                            className="download-link"
                          >
                            Descargar 📥
                          </a>
                        </div>
                      </>
                    )}
                    <div style={{ marginTop: '8px', padding: '8px', border: '1px solid #e9edef', borderRadius: '8px', background: '#fff' }}>
                      <div style={{ fontWeight: 600 }}>Plantilla: consejo_semanal_v1 (es_MX)</div>
                      <div className="stats-subtitle" style={{ marginTop: '4px' }}>
                        Botón: “Recibir Consejo Semanal”
                      </div>
                      <div className="stats-subtitle" style={{ marginTop: '2px' }}>
                        Footer: “Para dejar de recibirlos, responde 'Baja'.”
                      </div>
                    </div>
                  </div>
                )}
                {msg.type === 'document' && msg.mediaUrl && (
                  <div className="message-media">
                    <div style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '6px', background: '#fff' }}>
                      <div style={{ fontWeight: 600, marginBottom: '6px' }}>
                        {msg.caption || msg.text || 'Documento'}
                      </div>
                      <a
                        href={buildApiUrl(msg.mediaUrl)}
                        download
                        target="_blank"
                        rel="noreferrer"
                        className="download-link"
                      >
                        Descargar 📄
                      </a>
                    </div>
                  </div>
                )}
                {msg.type === 'template' && !msg.mediaUrl && (
                  <div style={{ marginBottom: '6px', fontSize: '0.8em', color: '#008069', fontWeight: 600 }}>
                    💳 Recordatorio de pago (recordatorio_de_pago1)
                  </div>
                )}
                {msg.text && (
                  <div className="message-text">
                    {msg.text.split('\n').map((line, i) => (
                      <React.Fragment key={i}>
                        {line}
                        {i < msg.text.split('\n').length - 1 && <br />}
                      </React.Fragment>
                    ))}
                  </div>
                )}
                <span className="message-time">
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {msg.direction === 'outgoing' && (
                    <span className={`msg-ticks ${msg.status === 'read' ? 'msg-ticks--read' : ''}`}>
                      {msg.status === 'failed' ? ' ⚠' : (msg.status === 'read' || msg.status === 'delivered') ? ' ✓✓' : ' ✓'}
                    </span>
                  )}
                </span>
              </div>
            </div>
            </React.Fragment>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area enabled only for ASESOR stage */}
      <div className="chat-input-area">
        <input 
          type="text" 
          className="chat-input"
          placeholder={currentStage === 'ASESOR' ? "Escribe un mensaje..." : "Cambia a modo ASESOR para responder"} 
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
              }
          }}
          disabled={currentStage !== 'ASESOR'} 
        />
        <button 
            className="chat-send-button"
            onClick={handleSendMessage}
            disabled={currentStage !== 'ASESOR' || !inputText.trim() || sending}
            aria-label="Enviar"
        >
            {sending ? '…' : '➤'}
        </button>
      </div>
    </div>
  );
};
